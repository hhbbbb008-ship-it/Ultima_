import * as THREE from 'three';

/**
 * Gestión de recursos: texturas procedurales (sin archivos externos),
 * registro central de materiales y reconstrucción en caliente cuando
 * cambian la calidad de texturas o de iluminación.
 *
 * Cada malla del juego guarda en userData.mat la clave de su material,
 * así se puede sustituir el material de todo el juego sin reiniciar.
 */

const TAM_POR_CALIDAD = [128, 256, 512, 1024, 2048];
const ANISO_POR_CALIDAD = [1, 2, 4, 8, 16];

// ---------------------------------------------------------------------------
// Utilidades de generación
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function lienzo(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d', { willReadFrequently: true }) };
}
/** Ruido de valor periódico (enlosable) con varias octavas, en escala de grises. */
function ruidoFbm(tam, frec, octavas, semilla) {
  const rnd = mulberry32(semilla);
  const { c, g } = lienzo(tam);
  const img = g.createImageData(tam, tam);
  const capas = [];
  for (let o = 0; o < octavas; o++) {
    const f = frec << o;
    const red = new Float32Array(f * f);
    for (let i = 0; i < red.length; i++) red[i] = rnd();
    capas.push({ f, red, amp: Math.pow(0.5, o) });
  }
  let norma = 0; for (const k of capas) norma += k.amp;
  for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) {
    let v = 0;
    for (const { f, red, amp } of capas) {
      const fx = x / tam * f, fy = y / tam * f;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const x1 = (x0 + 1) % f, y1 = (y0 + 1) % f;
      const a = red[y0 * f + x0], b = red[y0 * f + x1], cc = red[y1 * f + x0], d = red[y1 * f + x1];
      v += amp * ((a * (1 - sx) + b * sx) * (1 - sy) + (cc * (1 - sx) + d * sx) * sy);
    }
    const p = (y * tam + x) * 4, n = (v / norma) * 255;
    img.data[p] = img.data[p + 1] = img.data[p + 2] = n; img.data[p + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
/** Dibuja un ruido FBM escalado sobre el lienzo con un modo de mezcla. */
function capaRuido(g, S, frec, oct, semilla, alpha, modo = 'overlay') {
  const r = ruidoFbm(Math.min(256, S), frec, oct, semilla);
  g.save(); g.globalAlpha = alpha; g.globalCompositeOperation = modo;
  g.imageSmoothingEnabled = true; g.drawImage(r, 0, 0, S, S); g.restore();
}
/** Grano fino píxel a píxel. */
function granulado(g, S, amp, semilla) {
  const rnd = mulberry32(semilla);
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amp;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}
/** Grietas: caminos aleatorios, dibujados también desplazados para que enlosen. */
function grietas(g, S, n, semilla, color, ancho = 1) {
  const rnd = mulberry32(semilla);
  g.save(); g.strokeStyle = color; g.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    let x = rnd() * S, y = rnd() * S, ang = rnd() * Math.PI * 2;
    const pasos = 8 + rnd() * 20, largo = S * (0.01 + rnd() * 0.025);
    const pts = [[x, y]];
    for (let i = 0; i < pasos; i++) { ang += (rnd() - 0.5) * 1.2; x += Math.cos(ang) * largo; y += Math.sin(ang) * largo; pts.push([x, y]); }
    g.lineWidth = Math.max(1, ancho * S / 512 * (0.5 + rnd()));
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy))); g.stroke();
    }
  }
  g.restore();
}
/** Convierte un lienzo de alturas (gris) en un mapa de normales tangentes. */
function alturaANormal(alto, fuerza = 2) {
  const S = alto.width;
  const src = alto.getContext('2d').getImageData(0, 0, S, S).data;
  const { c, g } = lienzo(S);
  const img = g.createImageData(S, S), d = img.data;
  const h = (x, y) => src[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * fuerza;
    const dy = (h(x, y + 1) - h(x, y - 1)) * fuerza;
    const nz = 1 / Math.sqrt(dx * dx + dy * dy + 1);
    const p = (y * S + x) * 4;
    d[p] = (-dx * nz * 0.5 + 0.5) * 255; d[p + 1] = (dy * nz * 0.5 + 0.5) * 255; d[p + 2] = (nz * 0.5 + 0.5) * 255; d[p + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
/** Copia en escala de grises (para usar como mapa de alturas). */
function aGris(c) {
  const S = c.width, { c: o, g } = lienzo(S);
  g.filter = 'grayscale(1)'; g.drawImage(c, 0, 0); g.filter = 'none';
  return o;
}

// ---------------------------------------------------------------------------
// Generadores de texturas. Cada uno devuelve { mapa, alto?, rug?, emis? }
// ---------------------------------------------------------------------------
const GEN = {
  asfalto(S) {
    const { c, g } = lienzo(S);
    g.fillStyle = '#34363a'; g.fillRect(0, 0, S, S);
    capaRuido(g, S, 4, 5, 11, 0.55);
    // áridos claros
    const rnd = mulberry32(5);
    for (let i = 0; i < S * S / 60; i++) { g.fillStyle = `rgba(${150 + rnd() * 60},${150 + rnd() * 60},${150 + rnd() * 50},${0.15 + rnd() * 0.25})`; g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * S / 512, 1 + rnd() * S / 512); }
    // parches de reparación
    for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(20,20,22,0.35)'; g.fillRect(rnd() * S, rnd() * S, S * (0.1 + rnd() * 0.2), S * (0.08 + rnd() * 0.15)); }
    grietas(g, S, 10, 7, 'rgba(10,10,12,0.8)', 1.4);
    granulado(g, S, 26, 3);
    // rugosidad: charcos (zonas lisas) a partir de un ruido de baja frecuencia
    const { c: rug, g: gr } = lienzo(S);
    const charcos = ruidoFbm(Math.min(256, S), 3, 3, 99);
    gr.drawImage(charcos, 0, 0, S, S);
    const im = gr.getImageData(0, 0, S, S);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = im.data[i] / 255;
      const r = v > 0.62 ? 0.18 : 0.9 - (v > 0.55 ? (v - 0.55) * 8 : 0);
      im.data[i] = im.data[i + 1] = im.data[i + 2] = Math.max(0.15, r) * 255;
    }
    gr.putImageData(im, 0, 0);
    // oscurece el color donde hay charcos (el asfalto mojado es más oscuro)
    g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.45; g.drawImage(rug, 0, 0); g.restore();
    return { mapa: c, alto: aGris(c), rug };
  },
  acera(S) {
    const { c, g } = lienzo(S);
    g.fillStyle = '#6d6a64'; g.fillRect(0, 0, S, S);
    capaRuido(g, S, 6, 4, 21, 0.5);
    const rnd = mulberry32(22), n = 2, t = S / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      g.fillStyle = `rgba(${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},0,0)`;
      const k = 0.85 + rnd() * 0.25; g.fillStyle = `rgba(${90 * k},${88 * k},${82 * k},0.35)`; g.fillRect(x * t, y * t, t, t);
    }
    g.strokeStyle = 'rgba(25,24,22,0.9)'; g.lineWidth = Math.max(1, S / 170);
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * t, 0); g.lineTo(i * t, S); g.stroke(); g.beginPath(); g.moveTo(0, i * t); g.lineTo(S, i * t); g.stroke(); }
    grietas(g, S, 4, 23, 'rgba(20,20,20,0.7)');
    for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(30,25,20,0.18)'; g.beginPath(); g.arc(rnd() * S, rnd() * S, S * (0.04 + rnd() * 0.08), 0, 7); g.fill(); }
    granulado(g, S, 22, 24);
    return { mapa: c, alto: aGris(c) };
  },
  tierra(S) {
    const { c, g } = lienzo(S);
    g.fillStyle = '#3d3528'; g.fillRect(0, 0, S, S);
    capaRuido(g, S, 5, 5, 31, 0.7);
    const rnd = mulberry32(32);
    for (let i = 0; i < S * 1.2; i++) {           // hierba seca
      const x = rnd() * S, y = rnd() * S, l = S * (0.008 + rnd() * 0.02), a = -Math.PI / 2 + (rnd() - 0.5);
      g.strokeStyle = `rgba(${90 + rnd() * 50},${85 + rnd() * 40},${45 + rnd() * 20},${0.4 + rnd() * 0.4})`;
      g.lineWidth = Math.max(1, S / 700); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    for (let i = 0; i < S / 6; i++) { g.fillStyle = `rgba(${70 + rnd() * 40},${65 + rnd() * 30},${55 + rnd() * 30},0.8)`; g.beginPath(); g.arc(rnd() * S, rnd() * S, S * 0.002 * (1 + rnd() * 2), 0, 7); g.fill(); }
    granulado(g, S, 30, 33);
    return { mapa: c, alto: aGris(c) };
  },
  ladrillo(S) {
    const { c, g } = lienzo(S);
    g.fillStyle = '#3b2e2a'; g.fillRect(0, 0, S, S);       // mortero
    const { c: h, g: gh } = lienzo(S); gh.fillStyle = '#000'; gh.fillRect(0, 0, S, S);
    const rnd = mulberry32(41), filas = 8, cols = 4, bh = S / filas, bw = S / cols, m = Math.max(1, S / 128);
    for (let f = 0; f < filas; f++) for (let k = -1; k < cols; k++) {
      const x = k * bw + (f % 2 ? bw / 2 : 0), y = f * bh, t = rnd();
      g.fillStyle = `rgb(${110 + t * 45},${50 + t * 25},${38 + t * 18})`;
      g.fillRect(x + m, y + m, bw - 2 * m, bh - 2 * m);
      gh.fillStyle = `rgb(${190 + rnd() * 60},0,0)`; gh.fillRect(x + m, y + m, bw - 2 * m, bh - 2 * m);
    }
    capaRuido(g, S, 8, 4, 42, 0.45);
    // hollín de abajo arriba
    const grad = g.createLinearGradient(0, S, 0, 0); grad.addColorStop(0, 'rgba(10,8,8,0.35)'); grad.addColorStop(1, 'rgba(10,8,8,0)');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
    granulado(g, S, 24, 43);
    return { mapa: c, alto: aGris(h) };
  },
  yeso(S) {
    const { c, g } = lienzo(S);
    g.fillStyle = '#b0aaa0'; g.fillRect(0, 0, S, S);
    capaRuido(g, S, 4, 5, 51, 0.6);
    const rnd = mulberry32(52);
    for (let i = 0; i < 14; i++) {                  // churretes de suciedad
      const x = rnd() * S, w = S * (0.01 + rnd() * 0.04), l = S * (0.2 + rnd() * 0.6);
      const gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, 'rgba(40,35,30,0.35)'); gr.addColorStop(1, 'rgba(40,35,30,0)');
      g.fillStyle = gr; g.fillRect(x, 0, w, l);
    }
    for (let i = 0; i < 5; i++) {                   // desconchones (ladrillo visto)
      const x = rnd() * S, y = rnd() * S, r = S * (0.03 + rnd() * 0.05);
      g.fillStyle = 'rgba(95,60,48,0.8)'; g.beginPath(); g.ellipse(x, y, r, r * 0.6, rnd() * 3, 0, 7); g.fill();
    }
    grietas(g, S, 6, 53, 'rgba(40,35,30,0.7)');
    granulado(g, S, 18, 54);
    return { mapa: c, alto: aGris(c) };
  },
  hormigon(S) {
    const { c, g } = lienzo(S);
    g.fillStyle = '#7c7b76'; g.fillRect(0, 0, S, S);
    capaRuido(g, S, 6, 5, 61, 0.55);
    const rnd = mulberry32(62);
    for (let i = 0; i < S / 3; i++) { g.fillStyle = 'rgba(40,40,40,0.5)'; g.beginPath(); g.arc(rnd() * S, rnd() * S, Math.max(0.5, S * 0.0025 * rnd()), 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(50,50,48,0.5)'; g.lineWidth = Math.max(1, S / 300);
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, i * S / 4); g.lineTo(S, i * S / 4); g.stroke(); }
    grietas(g, S, 3, 63, 'rgba(30,30,30,0.6)');
    granulado(g, S, 20, 64);
    return { mapa: c, alto: aGris(c) };
  },
  metal(S) {
    const { c, g } = lienzo(S);
    g.fillStyle = '#8d8f8a'; g.fillRect(0, 0, S, S);
    capaRuido(g, S, 6, 4, 71, 0.3);
    const ox = ruidoFbm(Math.min(256, S), 5, 5, 72), { c: m, g: gm } = lienzo(S);
    gm.drawImage(ox, 0, 0, S, S);
    const im = gm.getImageData(0, 0, S, S);
    for (let i = 0; i < im.data.length; i += 4) {    // óxido donde el ruido supera un umbral
      const v = im.data[i] / 255, a = v > 0.56 ? Math.min(1, (v - 0.56) * 6) : 0;
      im.data[i] = 120; im.data[i + 1] = 62; im.data[i + 2] = 30; im.data[i + 3] = a * 230;
    }
    gm.putImageData(im, 0, 0); g.drawImage(m, 0, 0);
    granulado(g, S, 16, 73);
    return { mapa: c, alto: aGris(c) };
  },
  madera(S) {
    const { c, g } = lienzo(S);
    const rnd = mulberry32(81), tablas = 4, tw = S / tablas;
    for (let i = 0; i < tablas; i++) {
      const t = rnd(); g.fillStyle = `rgb(${95 + t * 40},${68 + t * 28},${42 + t * 18})`; g.fillRect(0, i * tw, S, tw);
      for (let k = 0; k < 30; k++) {               // vetas
        g.strokeStyle = `rgba(40,25,12,${0.15 + rnd() * 0.25})`; g.lineWidth = Math.max(1, S / 600);
        const y = i * tw + rnd() * tw; g.beginPath(); g.moveTo(0, y);
        for (let x = 0; x <= S; x += S / 16) g.lineTo(x, y + Math.sin(x * 0.02 + k) * tw * 0.05);
        g.stroke();
      }
      g.fillStyle = 'rgba(15,10,5,0.9)'; g.fillRect(0, i * tw, S, Math.max(1, S / 256));
      g.fillStyle = '#2a2a2a';
      for (const x of [S * 0.06, S * 0.94]) { g.beginPath(); g.arc(x, i * tw + tw / 2, Math.max(1, S / 200), 0, 7); g.fill(); }
    }
    capaRuido(g, S, 5, 4, 82, 0.3);
    granulado(g, S, 14, 83);
    return { mapa: c, alto: aGris(c) };
  },
  pintura(S) {                                       // chapa de coche (se tiñe con el color del material)
    const { c, g } = lienzo(S);
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, S, S);
    capaRuido(g, S, 4, 4, 91, 0.25, 'multiply');
    const gr = g.createLinearGradient(0, S, 0, 0); gr.addColorStop(0, 'rgba(70,55,40,0.55)'); gr.addColorStop(0.4, 'rgba(70,55,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);       // barro abajo
    const rnd = mulberry32(92);
    g.strokeStyle = 'rgba(60,60,60,0.5)';
    for (let i = 0; i < 40; i++) { g.lineWidth = Math.max(1, S / 900); const x = rnd() * S, y = rnd() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * S * 0.1, y + (rnd() - 0.5) * S * 0.02); g.stroke(); }
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(110,55,25,0.6)'; g.beginPath(); g.arc(rnd() * S, S * (0.6 + rnd() * 0.4), S * 0.02 * (1 + rnd() * 2), 0, 7); g.fill(); }
    return { mapa: c, alto: aGris(c) };
  },
  quemado(S) {
    const { c, g } = lienzo(S);
    g.fillStyle = '#1b1a19'; g.fillRect(0, 0, S, S);
    capaRuido(g, S, 6, 5, 101, 0.8);
    const ox = ruidoFbm(Math.min(256, S), 4, 4, 102);
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.25; g.filter = 'sepia(1) saturate(3) brightness(0.6)'; g.drawImage(ox, 0, 0, S, S); g.restore();
    granulado(g, S, 30, 103);
    return { mapa: c, alto: aGris(c) };
  },
  neumatico(S) {
    const { c, g } = lienzo(S);
    g.fillStyle = '#181818'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#0c0c0c';
    for (let i = 0; i < 16; i++) g.fillRect(0, i * S / 16, S, S / 48);
    granulado(g, S, 14, 111);
    return { mapa: c, alto: aGris(c) };
  },
  valla(S) {                                        // malla romboidal con transparencia
    const { c, g } = lienzo(S);
    g.clearRect(0, 0, S, S);
    g.strokeStyle = '#9ea3a6'; g.lineWidth = Math.max(1.5, S / 110);
    const n = 6, t = S / n;
    for (let i = -n; i <= 2 * n; i++) {
      g.beginPath(); g.moveTo(i * t, 0); g.lineTo(i * t + S, S); g.stroke();
      g.beginPath(); g.moveTo(i * t, 0); g.lineTo(i * t - S, S); g.stroke();
    }
    return { mapa: c };
  },
  piel(S) {
    const { c, g } = lienzo(S);
    g.fillStyle = '#d8d8d0'; g.fillRect(0, 0, S, S);
    capaRuido(g, S, 6, 5, 121, 0.5);
    const rnd = mulberry32(122);
    for (let i = 0; i < 40; i++) {                  // venas
      g.strokeStyle = `rgba(60,70,90,${0.12 + rnd() * 0.2})`; g.lineWidth = Math.max(1, S / 400);
      let x = rnd() * S, y = rnd() * S, a = rnd() * 7; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { a += (rnd() - 0.5); x += Math.cos(a) * S * 0.02; y += Math.sin(a) * S * 0.02; g.lineTo(x, y); }
      g.stroke();
    }
    for (let i = 0; i < 10; i++) {                  // moratones y heridas
      const x = rnd() * S, y = rnd() * S, r = S * (0.02 + rnd() * 0.05);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const herida = rnd() > 0.55;
      gr.addColorStop(0, herida ? 'rgba(90,10,10,0.9)' : 'rgba(70,60,80,0.45)'); gr.addColorStop(1, 'rgba(70,60,80,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    granulado(g, S, 14, 123);
    return { mapa: c, alto: aGris(c) };
  },
  ropa(S) {
    const { c, g } = lienzo(S);
    g.fillStyle = '#cfcfcf'; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(0,0,0,0.07)'; g.lineWidth = 1;
    for (let i = 0; i < S; i += Math.max(2, S / 128)) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
    capaRuido(g, S, 5, 4, 131, 0.45);
    const rnd = mulberry32(132);
    for (let i = 0; i < 9; i++) {                   // manchas de sangre seca
      const x = rnd() * S, y = rnd() * S, r = S * (0.03 + rnd() * 0.08);
      g.fillStyle = `rgba(${70 + rnd() * 30},10,8,${0.5 + rnd() * 0.4})`;
      g.beginPath(); g.ellipse(x, y, r, r * (0.5 + rnd()), rnd() * 3, 0, 7); g.fill();
    }
    for (let i = 0; i < 6; i++) {                   // desgarros
      g.fillStyle = 'rgba(15,12,10,0.9)'; const x = rnd() * S, y = rnd() * S;
      g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) g.lineTo(x + (rnd() - 0.5) * S * 0.08, y + (rnd() - 0.5) * S * 0.08); g.fill();
    }
    granulado(g, S, 16, 133);
    return { mapa: c, alto: aGris(c) };
  },
  armaMetal(S) {
    const { c, g } = lienzo(S);
    g.fillStyle = '#5a5c60'; g.fillRect(0, 0, S, S);
    capaRuido(g, S, 8, 4, 141, 0.35);
    const rnd = mulberry32(142);
    for (let i = 0; i < 120; i++) { g.strokeStyle = `rgba(200,200,205,${rnd() * 0.15})`; g.lineWidth = 1; const x = rnd() * S, y = rnd() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd() * S * 0.05, y + (rnd() - 0.5) * 3); g.stroke(); }
    granulado(g, S, 10, 143);
    return { mapa: c, alto: aGris(c) };
  },
  letreros() {                                       // atlas 2x5 de rótulos originales
    const W = 1024, H = 1280, { c, g } = lienzo(W, H), { c: e, g: ge } = lienzo(W, H);
    const textos = [['FARMACIA', '#2fd26a'], ['BAR EL OCASO', '#ff4f6a'], ['TALLER', '#ffc24a'], ['ULTRAMARINOS', '#4ab8ff'], ['HOTEL SUR', '#ff8a3a'], ['GASOLINERA', '#e6e6e6'],
      ['HOSPITAL', '#ff3b3b'], ['URGENCIAS', '#f2f2f2'], ['PEAJE RUTA 9', '#ffd24a'], ['LOS ÁLAMOS', '#f0d9a0']];
    ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
    textos.forEach(([t, col], i) => {
      const x = (i % 2) * 512, y = Math.floor(i / 2) * 256;
      g.fillStyle = '#16181c'; g.fillRect(x, y, 512, 256);
      g.strokeStyle = '#2c3038'; g.lineWidth = 10; g.strokeRect(x + 8, y + 8, 496, 240);
      g.font = `bold ${t.length > 10 ? 62 : 84}px Impact, "Arial Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = col; g.fillText(t, x + 256, y + 128);
      ge.font = g.font; ge.textAlign = 'center'; ge.textBaseline = 'middle';
      // letras fundidas al azar: solo brillan algunas
      const rnd = mulberry32(150 + i), letras = [...t];
      const ancho = g.measureText(t).width; let cx = x + 256 - ancho / 2;
      for (const L of letras) {
        const w = g.measureText(L).width;
        ge.fillStyle = rnd() < 0.82 ? col : '#000'; ge.textAlign = 'left'; ge.fillText(L, cx, y + 128); cx += w;
      }
    });
    return { mapa: c, emis: e, fija: true };
  },
  sangre() {                                         // 4 variantes de salpicadura con alfa (atlas 2x2)
    const S = 512, { c, g } = lienzo(S), rnd = mulberry32(161);
    for (let v = 0; v < 4; v++) {
      const ox = (v % 2) * 256 + 128, oy = Math.floor(v / 2) * 256 + 128;
      g.fillStyle = 'rgba(90,6,6,0.95)';
      g.beginPath(); g.arc(ox, oy, 30 + rnd() * 25, 0, 7); g.fill();
      for (let i = 0; i < 30; i++) {
        const a = rnd() * 7, d = 20 + rnd() * 95, r = 2 + rnd() * 14 * (1 - d / 130);
        g.fillStyle = `rgba(${70 + rnd() * 40},${4 + rnd() * 8},6,${0.6 + rnd() * 0.35})`;
        g.beginPath(); g.ellipse(ox + Math.cos(a) * d, oy + Math.sin(a) * d, r * 1.6, r, a, 0, 7); g.fill();
      }
    }
    return { mapa: c, fija: true };
  },
  agujero() {
    const S = 64, { c, g } = lienzo(S);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.2, 'rgba(10,10,10,0.95)'); gr.addColorStop(0.45, 'rgba(40,38,35,0.6)'); gr.addColorStop(1, 'rgba(40,38,35,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return { mapa: c, fija: true };
  },
  acido() {
    const S = 256, { c, g } = lienzo(S), rnd = mulberry32(171);
    for (let i = 0; i < 26; i++) {
      const a = rnd() * 7, d = rnd() * 80, r = 10 + rnd() * 30;
      const gr = g.createRadialGradient(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 0, 128 + Math.cos(a) * d, 128 + Math.sin(a) * d, r);
      gr.addColorStop(0, 'rgba(170,255,60,0.9)'); gr.addColorStop(1, 'rgba(60,140,20,0)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    }
    return { mapa: c, fija: true };
  },
  fogonazo() {                                       // estrella del disparo
    const S = 128, { c, g } = lienzo(S);
    g.translate(64, 64);
    for (let i = 0; i < 6; i++) {
      g.rotate(Math.PI / 3);
      const gr = g.createLinearGradient(0, 0, 60, 0); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, -7); g.lineTo(60, 0); g.lineTo(0, 7); g.fill();
    }
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30); gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(1, 'rgba(255,150,50,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 30, 0, 7); g.fill();
    return { mapa: c, fija: true };
  },
};

// ---------------------------------------------------------------------------
// Definición de materiales del juego
// tex: textura base | tam: metros que cubre la textura | env: intensidad de reflejo
// ---------------------------------------------------------------------------
export const MATERIALES = {
  asfalto: { tex: 'asfalto', tam: 5, rough: 0.9, normal: 1.2, rugTex: true, env: 1.0 },
  acera: { tex: 'acera', tam: 2, rough: 0.92, normal: 1.0 },
  tierra: { tex: 'tierra', tam: 4, rough: 1, normal: 1.5 },
  ladrillo: { tex: 'ladrillo', tam: 2.4, rough: 0.92, normal: 2.5 },
  yesoOcre: { tex: 'yeso', tam: 3, color: 0xc2a984, rough: 0.95, normal: 1.2 },
  yesoGris: { tex: 'yeso', tam: 3, color: 0x9aa3a8, rough: 0.95, normal: 1.2 },
  yesoRosa: { tex: 'yeso', tam: 3, color: 0xb88a7a, rough: 0.95, normal: 1.2 },
  hormigon: { tex: 'hormigon', tam: 2, rough: 0.95, normal: 1.4 },
  metalOxido: { tex: 'metal', tam: 1.5, rough: 0.75, metal: 0.45, normal: 1.0, env: 0.6 },
  metalVerde: { tex: 'metal', tam: 1.5, color: 0x4d6b4a, rough: 0.7, metal: 0.4, normal: 1.0, env: 0.5 },
  metalAzul: { tex: 'metal', tam: 1.5, color: 0x3d5470, rough: 0.7, metal: 0.4, normal: 1.0, env: 0.5 },
  metalRojo: { tex: 'metal', tam: 1.5, color: 0x8a2a22, rough: 0.6, metal: 0.4, normal: 1.0, env: 0.5 },
  madera: { tex: 'madera', tam: 1.2, rough: 0.88, normal: 1.6 },
  cocheRojo: { tex: 'pintura', tam: 2, color: 0x7a1f1a, rough: 0.45, metal: 0.35, env: 1.2 },
  cocheAzul: { tex: 'pintura', tam: 2, color: 0x23395a, rough: 0.45, metal: 0.35, env: 1.2 },
  cocheBlanco: { tex: 'pintura', tam: 2, color: 0xb7b4aa, rough: 0.5, metal: 0.3, env: 1.2 },
  cocheVerde: { tex: 'pintura', tam: 2, color: 0x3a4a32, rough: 0.5, metal: 0.3, env: 1.2 },
  cocheQuemado: { tex: 'quemado', tam: 2, rough: 0.95, metal: 0.2, normal: 2 },
  neumatico: { tex: 'neumatico', tam: 0.8, rough: 0.95 },
  cristal: { color: 0x101a20, rough: 0.08, metal: 0.1, env: 1.5, opacidad: 0.82 },
  cristalOscuro: { color: 0x05070a, rough: 0.2, env: 0.8 },
  ventanaLuz: { color: 0x1c140c, emisivo: 0xffb45a, emisInt: 1.4, rough: 0.3 },
  ventanaFria: { color: 0x0c1418, emisivo: 0x7fb6ff, emisInt: 0.7, rough: 0.3 },
  valla: { tex: 'valla', tam: 2, rough: 0.5, metal: 0.7, alphaTest: 0.5, doble: true },
  farola: { color: 0x2b2f36, rough: 0.55, metal: 0.75, env: 0.6 },
  bombilla: { color: 0xfff1da, emisivo: 0xffcc88, emisInt: 4, basico: true },
  bombillaRota: { color: 0x332a20, rough: 0.5 },
  letreros: { tex: 'letreros', tam: 1, emisTex: 'letreros', emisivo: 0xffffff, emisInt: 1.6, rough: 0.5 },
  charco: { color: 0x0b0d10, rough: 0.04, metal: 0.5, env: 1.6 },
  pinturaVial: { color: 0xcfc7a8, rough: 0.75 },
  goma: { color: 0x141414, rough: 0.9 },
  cable: { color: 0x0c0c0c, rough: 0.8 },
  corteza: { tex: 'madera', tam: 0.8, color: 0x3a2f28, rough: 1, normal: 2 },
  sacos: { tex: 'yeso', tam: 0.9, color: 0x9a8862, rough: 1, normal: 1.5 },
  fuegoBrasas: { color: 0x200800, emisivo: 0xff5a10, emisInt: 2.5 },
  // Mapas adicionales
  yesoBlanco: { tex: 'yeso', tam: 3, color: 0xc7c4bb, rough: 0.95, normal: 1.2 },
  metalAmarillo: { tex: 'metal', tam: 1.5, color: 0xb08a22, rough: 0.6, metal: 0.4, normal: 1.0, env: 0.5 },
  lona: { tex: 'ropa', tam: 1.2, color: 0x5e6447, rough: 1, normal: 1.2 },
  lonaBlanca: { tex: 'ropa', tam: 1.2, color: 0xb3ae9f, rough: 1, normal: 1.2 },
  cruzRoja: { color: 0x8a1010, rough: 0.7 },
  ambulancia: { tex: 'pintura', tam: 2, color: 0xcfcbbd, rough: 0.5, metal: 0.3, env: 1.1 },
  faroAzul: { color: 0x0a1830, emisivo: 0x2a6aff, emisInt: 2.5 },
  pinturaHeli: { tex: 'pintura', tam: 2, color: 0x3a4636, rough: 0.55, metal: 0.3, env: 0.9 },
  cesped: { tex: 'tierra', tam: 4, color: 0x6f7f5a, rough: 1, normal: 1.3 },
  paja: { tex: 'madera', tam: 0.7, color: 0xd2b062, rough: 1, normal: 1.8 },
  maderaRoja: { tex: 'madera', tam: 1.6, color: 0x8c2e22, rough: 0.9, normal: 1.6 },
  tejado: { tex: 'metal', tam: 1.2, color: 0x5d6266, rough: 0.6, metal: 0.5, normal: 1.4, env: 0.5 },
  maiz: { color: 0x5e6a30, rough: 0.9, doble: true },
  follaje: { color: 0x1f2a1c, rough: 1 },
  // Botiquín
  botiquinRojo: { tex: 'armaMetal', tam: 0.3, color: 0xb0201a, rough: 0.45, metal: 0.1, env: 0.8 },
  botiquinCruz: { color: 0xf2efe6, rough: 0.5, emisivo: 0x404040, emisInt: 0.4 },
  // Zombis
  pielCaminante: { tex: 'piel', tam: 0.6, color: 0xa7ad97, rough: 0.75, normal: 1.2 },
  pielCorredor: { tex: 'piel', tam: 0.6, color: 0xc0b3a0, rough: 0.7, normal: 1.2 },
  pielAcorazado: { tex: 'piel', tam: 0.6, color: 0x95a08b, rough: 0.75, normal: 1.2 },
  pielEscupidor: { tex: 'piel', tam: 0.6, color: 0x9fb072, rough: 0.55, normal: 1.4 },
  pielColoso: { tex: 'piel', tam: 0.9, color: 0x96706a, rough: 0.6, normal: 2.0 },
  ropaAzul: { tex: 'ropa', tam: 0.7, color: 0x56657a, rough: 1, normal: 1 },
  ropaMarron: { tex: 'ropa', tam: 0.7, color: 0x7a5a45, rough: 1, normal: 1 },
  ropaVerde: { tex: 'ropa', tam: 0.7, color: 0x5f6648, rough: 1, normal: 1 },
  ropaBlanca: { tex: 'ropa', tam: 0.7, color: 0xa9a49a, rough: 1, normal: 1 },
  pantalon: { tex: 'ropa', tam: 0.7, color: 0x30384a, rough: 1, normal: 1 },
  zapato: { color: 0x1d1a17, rough: 0.8 },
  armadura: { tex: 'armaMetal', tam: 0.6, color: 0x3b4146, rough: 0.6, metal: 0.5, env: 0.6 },
  casco: { tex: 'armaMetal', tam: 0.5, color: 0x3c4436, rough: 0.55, metal: 0.4, env: 0.6 },
  visor: { color: 0x0a1014, rough: 0.05, metal: 0.2, env: 1.5, opacidad: 0.85 },
  ojos: { color: 0xffe6a0, emisivo: 0xffc040, emisInt: 3, basico: true },
  ojosRojos: { color: 0xff8070, emisivo: 0xff2a10, emisInt: 4, basico: true },
  pustula: { color: 0x9cff50, emisivo: 0x6aff20, emisInt: 1.6, rough: 0.2 },
  hueso: { color: 0xd8ceb4, rough: 0.6 },
  carne: { color: 0x6e1414, rough: 0.35, emisivo: 0x200000, emisInt: 1 },
  dientes: { color: 0xc9bf9a, rough: 0.4 },
  // Armas y brazos (vista en primera persona)
  armaMetal: { tex: 'armaMetal', tam: 0.25, color: 0x6a6d73, rough: 0.38, metal: 0.65, env: 1.4 },
  armaPolimero: { tex: 'armaMetal', tam: 0.3, color: 0x3a3c40, rough: 0.6, metal: 0.1, env: 0.8 },
  armaMadera: { tex: 'madera', tam: 0.35, color: 0x8a5a36, rough: 0.6, normal: 1.0 },
  armaLaton: { color: 0xc99a3a, rough: 0.35, metal: 1, env: 1 },
  lataBebida: { color: 0x1fb0e0, rough: 0.3, metal: 0.8, env: 1, emisivo: 0x0a3a4a, emisInt: 0.5 },   // lata de bebida energética
  lataTapa: { color: 0xb8bcc2, rough: 0.3, metal: 1, env: 1 },
  hoja: { color: 0xc8ccd2, rough: 0.25, metal: 1, env: 1.2 },
  guante: { color: 0x4a4038, rough: 0.8 },
  manga: { color: 0x56604a, rough: 0.95 },
  mira: { color: 0x40ff60, emisivo: 0x40ff60, emisInt: 3, basico: true },
  // Molotov
  vidrioBotella: { color: 0x3f6a3a, rough: 0.1, metal: 0.1, env: 1.2, opacidad: 0.7 },
  gasolina: { color: 0x8a6a20, rough: 0.2, opacidad: 0.8 },
  trapo: { tex: 'ropa', tam: 0.3, color: 0xb8ab90, rough: 1 },
  llama: { color: 0xffa040, emisivo: 0xff7a20, emisInt: 3, basico: true },
};

// Estilo cómic (2012): materiales de zombi con sombreado plano en tres tonos
const MATERIALES_COMIC = new Set(['pielCaminante', 'pielCorredor', 'pielAcorazado', 'pielEscupidor', 'pielColoso',
  'ropaAzul', 'ropaMarron', 'ropaVerde', 'ropaBlanca', 'pantalon', 'zapato', 'pustula', 'hueso', 'carne', 'dientes', 'armadura', 'casco']);

/** Color más apagado y algo más oscuro, como en el arte de cómic. */
function colorComic(hex) {
  const c = new THREE.Color(hex), hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s * 0.55, Math.min(0.85, hsl.l * 1.15 + 0.04));
  return c.getHex();
}

export class Recursos {
  constructor(renderer) {
    this.renderer = renderer;
    this.estilo = 'realista';     // 'realista' | 'comic'
    this.rampaToon = null;
    this.calTex = 2;
    this.calIlum = 2;
    this.texturas = new Map();   // nombre → { mapa, normal, rug, emis }
    this.mats = new Map();       // clave → material
    this.extra = new Map();      // materiales especiales (decals, partículas…)
  }

  tam(clave) { return MATERIALES[clave]?.tam || 1; }

  /** Genera (o regenera) todas las texturas para la calidad indicada. */
  generarTexturas(calidad) {
    this.calTex = calidad;
    const S = TAM_POR_CALIDAD[calidad];
    const aniso = Math.min(ANISO_POR_CALIDAD[calidad], this.renderer.capabilities.getMaxAnisotropy());
    const conNormal = calidad >= 3;
    const viejas = this.texturas;
    this.texturas = new Map();
    for (const [nombre, gen] of Object.entries(GEN)) {
      // las texturas "fijas" (rótulos, sangre…) no dependen de la calidad: se reutilizan
      if (viejas.has(nombre) && viejas.get(nombre).fija) { this.texturas.set(nombre, viejas.get(nombre)); viejas.delete(nombre); continue; }
      const tamGen = ['piel', 'ropa', 'armaMetal'].includes(nombre) ? Math.max(64, S / 2) : S;
      const r = gen(tamGen);
      const t = { fija: !!r.fija };
      t.mapa = this.aTextura(r.mapa, aniso, true);
      if (r.emis) t.emis = this.aTextura(r.emis, aniso, true);
      if (r.rug) t.rug = this.aTextura(r.rug, aniso, false);
      if (conNormal && r.alto) t.normal = this.aTextura(alturaANormal(r.alto, calidad >= 4 ? 3 : 2), aniso, false);
      this.texturas.set(nombre, t);
    }
    for (const t of viejas.values()) for (const k of ['mapa', 'normal', 'rug', 'emis']) t[k]?.dispose();
  }

  aTextura(canvas, aniso, color) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }

  textura(nombre) { return this.texturas.get(nombre)?.mapa; }

  /** Rampa de tres tonos para el sombreado plano del estilo cómic. */
  rampa() {
    if (!this.rampaToon) {
      this.rampaToon = new THREE.DataTexture(new Uint8Array([125, 200, 255]), 3, 1, THREE.RedFormat);
      this.rampaToon.minFilter = this.rampaToon.magFilter = THREE.NearestFilter;
      this.rampaToon.needsUpdate = true;
    }
    return this.rampaToon;
  }

  /** Crea un material según la calidad de iluminación actual. */
  crearMaterial(clave) {
    const d = MATERIALES[clave];
    const tex = d.tex ? this.texturas.get(d.tex) : null;
    const p = { color: d.color ?? 0xffffff };
    if (tex) p.map = tex.mapa;
    if (d.mapa) p.map = d.mapa;                      // textura propia (modelo .glb del zombi)
    if (d.emisivo !== undefined) { p.emissive = d.emisivo; p.emissiveIntensity = d.emisInt ?? 1; }
    if (d.emisTex) p.emissiveMap = this.texturas.get(d.emisTex)?.emis;
    if (d.alphaTest) p.alphaTest = d.alphaTest;
    if (d.doble) p.side = THREE.DoubleSide;
    if (d.opacidad) { p.transparent = true; p.opacity = d.opacidad; }
    let m;
    if (d.basico) { m = new THREE.MeshBasicMaterial({ color: d.emisivo ?? d.color }); if (p.transparent) { m.transparent = true; m.opacity = p.opacity; } }
    else if (this.estilo === 'comic' && (MATERIALES_COMIC.has(clave) || clave.startsWith('glb'))) {
      m = new THREE.MeshToonMaterial({ ...p, color: colorComic(p.color), gradientMap: this.rampa() });
    }
    else if (this.calIlum === 0) m = new THREE.MeshLambertMaterial(p);
    else {
      p.roughness = d.rough ?? 0.8; p.metalness = d.metal ?? 0;
      if (tex?.normal && d.normal) { p.normalMap = tex.normal; p.normalScale = new THREE.Vector2(d.normal, d.normal); }
      if (tex?.rug && d.rugTex) p.roughnessMap = tex.rug;
      p.envMapIntensity = d.env ?? 0.25;
      m = new THREE.MeshStandardMaterial(p);
    }
    m.name = clave;
    return m;
  }

  /** Material compartido por clave (se crea bajo demanda). */
  mat(clave) {
    if (!this.mats.has(clave)) {
      if (!MATERIALES[clave]) throw new Error('Material desconocido: ' + clave);
      this.mats.set(clave, this.crearMaterial(clave));
    }
    return this.mats.get(clave);
  }

  /** Malla con material registrado (se podrá reconstruir en caliente). */
  malla(geo, clave) {
    const m = new THREE.Mesh(geo, this.mat(clave));
    m.userData.mat = clave;
    return m;
  }

  /**
   * Reconstruye todos los materiales (cambio de iluminación o de texturas)
   * y los reasigna recorriendo las raíces indicadas.
   */
  reconstruir({ calTex, calIlum, estilo }, raices) {
    if (calIlum !== undefined) this.calIlum = calIlum;
    if (estilo !== undefined) this.estilo = estilo;
    if (calTex !== undefined && calTex !== this.calTex) this.generarTexturas(calTex);
    const viejos = this.mats;
    this.mats = new Map();
    for (const clave of viejos.keys()) this.mat(clave);
    for (const raiz of raices) raiz?.traverse(o => {
      if (!(o.isMesh || o.isInstancedMesh)) return;
      if (o.userData.mats) o.material = o.userData.mats.map(k => this.mat(o.userData.sust?.get(k) || k));   // mallas multimaterial (zombis)
      else if (o.userData.mat) o.material = this.mat(o.userData.mat);
    });
    for (const m of viejos.values()) m.dispose();
    this.eventosReconstruir?.();
  }
}

/**
 * Asigna UV en metros a una geometría ya posicionada (proyección por cara),
 * para que las texturas tengan una escala real constante al fusionar mallas.
 */
export function uvMundo(geo, tam) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; }
    else if (nx >= nz) { u = z; v = y; }
    else { u = x; v = y; }
    uv[i * 2] = u / tam; uv[i * 2 + 1] = v / tam;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
