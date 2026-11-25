import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MATERIALES } from '../motor/Recursos.js';

/**
 * Cuerpo de zombi modelado en Blender (assets/modelos/zombi.glb, generado con
 * herramientas/zombi_caminante.py).
 *
 * Del .glb solo se usan la malla, los pesos y las texturas. Sus huesos tienen los
 * mismos nombres que el esqueleto del juego (cadera, columna, … brazo.L → brazoI),
 * así que la malla se monta sobre ese esqueleto y la animación por código del juego
 * (andar, atacar, aturdido, sacudidas, decapitación…) sigue funcionando igual.
 *
 * Si el archivo no carga, cuerpoGLB.listo queda en false y se usa el modelo clásico.
 */
const RUTA = './assets/modelos/zombi.glb';

export const cuerpoGLB = {
  listo: false,
  piezas: [],          // { geo, nombres, mat, extra } en metros, con la pose de reposo
  huesos: {},          // nombre del juego → posición de reposo (Vector3)
  cabezaY: 0.06,       // altura del centro de la cabeza sobre su hueso (impactos)
  camisas: 1,          // variantes de color de la camisa
  atlas: false,        // hay materiales 'glbAtlas0..n' (piel + camisa n + jeans)
};

// material del .glb → clave del juego. '*piel', '*camisa' y '*ojos' dependen del tipo.
const MAPA = {
  zc_piel: '*piel', zc_camisa: '*camisa', zc_jeans: 'glbJeans', zc_cuero: 'zapato', zc_botas: 'zapato',
  zc_suela: 'zapato', zc_pelo: 'glbPelo', zc_cuenca: 'glbBoca', zc_boca: 'glbBoca', zc_sangre: 'glbBoca',
  zc_dientes: 'dientes', zc_ojo: '*ojos',
};
// nivel de detalle mínimo de cada pieza (0 = siempre; ver Pieza.visible en ModeloZombi).
// Las piezas con extra ≠ 0 van a la malla de detalles, que no proyecta sombra.
const EXTRA = { glbBoca: 1, dientes: 2, '*ojos': 1 };
// piel, camisa y jeans comparten una textura (atlas): un solo material y una sola llamada de dibujo
const RANURA = { '*piel': 0, '*camisa': 1, glbJeans: 2 };
// variantes de la camisa: [tono destino (null = el original), saturación, luminosidad]
const VARIANTES = [[null, 1, 1], [0.0, 1.15, 1.15], [0.6, 0.9, 1.2], [null, 0.2, 1.7]];

/** 'brazo.L' o 'brazoL' (el cargador quita los puntos) → 'brazoI'. */
function nombreHueso(n) {
  const m = n.replace(/[^A-Za-z]/g, '');
  if (/L$/.test(m)) return m.slice(0, -1) + 'I';
  if (/R$/.test(m)) return m.slice(0, -1) + 'D';
  return m;
}

function texturaCanvas(canvas, base) {
  const t = new THREE.CanvasTexture(canvas);
  t.flipY = false;                                   // convención de UV de glTF
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = base.wrapS; t.wrapT = base.wrapT;
  t.needsUpdate = true;
  return t;
}

/** Copias de la textura de la camisa con otro color (franela roja, azul, gris…). */
function variantesCamisa(tex) {
  const img = tex.image;
  const w = img.width, h = img.height;
  const lienzo = document.createElement('canvas'); lienzo.width = w; lienzo.height = h;
  const g = lienzo.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const orig = g.getImageData(0, 0, w, h);
  const c = new THREE.Color(), hsl = {};
  // tono dominante de la tela: solo se recolorea lo que se parece a él (la sangre y el barro se quedan igual)
  const hist = new Float32Array(36);
  for (let k = 0; k < orig.data.length; k += 16) {
    c.setRGB(orig.data[k] / 255, orig.data[k + 1] / 255, orig.data[k + 2] / 255, THREE.SRGBColorSpace).getHSL(hsl, THREE.SRGBColorSpace);
    hist[Math.floor(hsl.h * 36) % 36] += hsl.s;
  }
  const base = (hist.indexOf(Math.max(...hist)) + 0.5) / 36;
  return VARIANTES.map(([destino, ks, kl], i) => {
    if (i === 0) return tex;
    const dh = destino === null ? 0 : destino - base;
    const datos = new ImageData(new Uint8ClampedArray(orig.data), w, h), p = datos.data;
    for (let k = 0; k < p.length; k += 4) {
      c.setRGB(p[k] / 255, p[k + 1] / 255, p[k + 2] / 255, THREE.SRGBColorSpace);
      c.getHSL(hsl, THREE.SRGBColorSpace);
      let dif = Math.abs(hsl.h - base); dif = Math.min(dif, 1 - dif);
      const wgt = hsl.s < 0.12 ? 1 : Math.max(0, Math.min(1, (0.16 - dif) / 0.06));   // grises (hilos) también
      if (wgt <= 0) continue;
      c.setHSL((hsl.h + dh * wgt + 1) % 1, Math.min(1, hsl.s * (1 + (ks - 1) * wgt)), Math.min(0.92, hsl.l * (1 + (kl - 1) * wgt)), THREE.SRGBColorSpace);
      c.getRGB(c, THREE.SRGBColorSpace);
      p[k] = c.r * 255; p[k + 1] = c.g * 255; p[k + 2] = c.b * 255;
    }
    const lv = document.createElement('canvas'); lv.width = w; lv.height = h;
    lv.getContext('2d').putImageData(datos, 0, 0);
    return texturaCanvas(lv, tex);
  });
}

/** Atlas de 3 casillas (piel | camisa | jeans), uno por variante de camisa. */
function crearAtlas(tex, camisas) {
  const img = (t) => t.image;
  const W = img(tex['*piel']).width, H = img(tex['*piel']).height;
  camisas.forEach((camisa, i) => {
    const lienzo = document.createElement('canvas'); lienzo.width = W * 3; lienzo.height = H;
    const g = lienzo.getContext('2d');
    g.drawImage(img(tex['*piel']), 0, 0, W, H);
    g.drawImage(img(camisa), W, 0, W, H);
    g.drawImage(img(tex.glbJeans), W * 2, 0, W, H);
    const t = texturaCanvas(lienzo, tex['*piel']);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    MATERIALES['glbAtlas' + i] = { mapa: t, color: 0xffffff, rough: 0.85 };
  });
}

/** Copia de la geometría con las UV llevadas a su casilla del atlas. */
function uvAtlas(geo, ranura) {
  const g = geo.clone(), uv = g.attributes.uv;
  if (!uv) return g;
  for (let i = 0; i < uv.count; i++) {
    const u = Math.min(0.995, Math.max(0.005, uv.getX(i)));
    uv.setX(i, (ranura + u) / 3);
  }
  return g;
}

/** Deja solo los atributos que usa el juego, con los mismos tipos que las piezas clásicas. */
function normalizar(geo) {
  for (const n of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(n)) geo.deleteAttribute(n);
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const idx = new Uint16Array(si.count * 4), pes = new Float32Array(sw.count * 4);
  for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) {
    idx[i * 4 + k] = si.getComponent(i, k);
    pes[i * 4 + k] = sw.getComponent(i, k);           // getComponent ya desnormaliza
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(pes, 4));
  if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);
  return geo;
}

export async function cargarCuerpoZombi() {
  try {
    const gltf = await new GLTFLoader().loadAsync(RUTA);
    gltf.scene.updateMatrixWorld(true);
    const huesos = {}, mallas = [];
    gltf.scene.traverse(o => {
      if (o.isBone) huesos[nombreHueso(o.name)] = o.getWorldPosition(new THREE.Vector3());
      if (o.isSkinnedMesh) mallas.push(o);
    });
    const necesarios = ['cadera', 'columna', 'pecho', 'cuello', 'cabeza', 'mandibula',
      ...['hombro', 'brazo', 'antebrazo', 'mano', 'muslo', 'pierna', 'pie'].flatMap(b => [b + 'I', b + 'D'])];
    const faltan = necesarios.filter(n => !huesos[n]);
    if (faltan.length || !mallas.length) throw new Error('al modelo le faltan huesos: ' + faltan.join(', '));

    const piezas = [], texturas = {};
    let camisas = 1, varCamisa = null;
    for (const m of mallas) {
      const nombre = m.material.name;
      let mat = MAPA[nombre];
      if (!mat) { console.warn('[zombi.glb] material sin asignar:', nombre); mat = 'glbPelo'; }
      const mapa = m.material.map;
      if (mapa && RANURA[mat] !== undefined) texturas[mat] = mapa;
      if (mat === '*piel' && mapa) MATERIALES.glbPiel = { mapa, color: 0xffffff, rough: 0.75 };
      if (mat === '*camisa' && mapa) {
        varCamisa = variantesCamisa(mapa);
        varCamisa.forEach((t, i) => { MATERIALES['glbCamisa' + i] = { mapa: t, color: 0xffffff, rough: 0.95 }; });
        camisas = varCamisa.length;
      }
      if (mat === 'glbJeans') MATERIALES.glbJeans = mapa ? { mapa, color: 0xffffff, rough: 0.95 } : { color: m.material.color.getHex(), rough: 0.95 };
      if (mat === 'glbPelo') {
        const c = m.material.color;
        if (c.r + c.g + c.b < 0.12) mat = 'zapato';      // pelo oscuro: comparte material con las botas
        else MATERIALES.glbPelo ??= { color: c.getHex(), rough: 1 };
      }
      const geo = normalizar(m.geometry.clone());
      geo.applyMatrix4(m.matrixWorld);                   // pose de reposo en metros
      piezas.push({ geo, nombres: m.skeleton.bones.map(b => nombreHueso(b.name)), mat, extra: EXTRA[mat] ?? 0, ranura: RANURA[mat] });
    }
    const atlas = !!(texturas['*piel'] && texturas['*camisa'] && texturas.glbJeans && varCamisa);
    if (atlas) {
      crearAtlas(texturas, varCamisa);
      for (const p of piezas) if (p.ranura !== undefined) p.geoAtlas = uvAtlas(p.geo, p.ranura);
    }
    MATERIALES.glbBoca ??= { color: 0x1c0d0b, rough: 0.6 };
    MATERIALES.glbPelo ??= { color: 0x1a1614, rough: 1 };

    // centro de la cabeza respecto a su hueso (para los disparos a la cabeza)
    const caja = new THREE.Box3();
    for (const p of piezas) {
      const pos = p.geo.attributes.position, si = p.geo.attributes.skinIndex, sw = p.geo.attributes.skinWeight;
      const iCab = p.nombres.indexOf('cabeza');
      for (let i = 0; i < pos.count; i++) if (si.getX(i) === iCab && sw.getX(i) > 0.99) caja.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, i));
    }
    if (!caja.isEmpty()) cuerpoGLB.cabezaY = (caja.min.y + caja.max.y) / 2 - huesos.cabeza.y;

    Object.assign(cuerpoGLB, { listo: true, piezas, huesos, camisas, atlas });
    return true;
  } catch (e) {
    console.warn('[zombi.glb] no se pudo cargar; se usa el zombi clásico.', e);
    return false;
  }
}
