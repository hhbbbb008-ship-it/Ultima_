/**
 * Audio 100 % procedural con Web Audio API (sin archivos de sonido):
 * - Efectos sintetizados al inicio con OfflineAudioContext (disparos, recargas,
 *   impactos, pasos, voces de zombi por formantes, ambiente).
 * - Sonido 3D con PannerNode (HRTF en calidad alta).
 * - Música generativa en tiempo real con intensidad dinámica.
 * - Buses independientes: maestro, música, efectos y ambiente.
 */

const SR = 44100;

// ---------------------------------------------------------------------------
// Utilidades de síntesis offline
// ---------------------------------------------------------------------------
function bufRuido(oc, dur, color = 'blanco') {
  const b = oc.createBuffer(1, Math.ceil(dur * oc.sampleRate), oc.sampleRate);
  const d = b.getChannelData(0);
  let ult = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'marron') { ult = (ult + 0.02 * w) / 1.02; d[i] = ult * 3.5; } else d[i] = w;
  }
  return b;
}
function ruido(oc, t0, dur, color) {
  const s = oc.createBufferSource(); s.buffer = bufRuido(oc, dur + 0.05, color); s.start(t0); return s;
}
function filtro(oc, tipo, f, q = 1) { const n = oc.createBiquadFilter(); n.type = tipo; n.frequency.value = f; n.Q.value = q; return n; }
/** Envolvente: ataque lineal y caída exponencial. */
function env(oc, t0, ataque, pico, caida, destino) {
  const g = oc.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(pico, t0 + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ataque + caida);
  if (destino) g.connect(destino);
  return g;
}
function cadena(...nodos) { for (let i = 0; i < nodos.length - 1; i++) nodos[i].connect(nodos[i + 1]); return nodos[nodos.length - 1]; }
function distorsion(oc, k) {
  const ws = oc.createWaveShaper(), n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
  ws.curve = c; return ws;
}
function osc(oc, tipo, f, t0, t1) { const o = oc.createOscillator(); o.type = tipo; o.frequency.setValueAtTime(f, t0); o.start(t0); o.stop(t1); return o; }
async function render(dur, fn) {
  const oc = new OfflineAudioContext(1, Math.ceil(dur * SR), SR);
  const salida = oc.createGain(); salida.connect(oc.destination);
  fn(oc, salida);
  return oc.startRendering();
}

// ---------------------------------------------------------------------------
// Recetas de sonidos
// ---------------------------------------------------------------------------
function receta_disparo({ cuerpo, caida, corte, cola, chasquido, grave = 1 }) {
  return render(cola + 0.3, (oc, o) => {
    // chasquido inicial (onda de choque)
    cadena(ruido(oc, 0, 0.02), filtro(oc, 'highpass', 2500), env(oc, 0, 0.0005, chasquido, 0.02, o));
    // estallido principal
    const lp = filtro(oc, 'lowpass', corte, 0.7);
    lp.frequency.setValueAtTime(corte, 0); lp.frequency.exponentialRampToValueAtTime(900, caida * 1.5);
    cadena(ruido(oc, 0, caida * 3), lp, env(oc, 0, 0.001, 1, caida, o));
    // cuerpo grave con caída de tono
    const s = osc(oc, 'sine', cuerpo, 0, 0.5);
    s.frequency.exponentialRampToValueAtTime(cuerpo * 0.35, 0.12);
    cadena(s, env(oc, 0, 0.002, 0.9 * grave, caida * 1.4, o));
    // cola reverberante (eco urbano)
    const lp2 = filtro(oc, 'lowpass', 700);
    cadena(ruido(oc, 0.02, cola, 'marron'), lp2, env(oc, 0.02, 0.03, 0.35, cola, o));
  });
}
function receta_mecanico(clicks) {
  // clicks: [[t, frecuencia, duración, volumen]]
  const dur = Math.max(...clicks.map(c => c[0] + c[2])) + 0.1;
  return render(dur, (oc, o) => {
    for (const [t, f, d, v] of clicks) {
      cadena(ruido(oc, t, d), filtro(oc, 'bandpass', f, 3), env(oc, t, 0.001, v, d, o));
      const s = osc(oc, 'triangle', f * 0.5, t, t + d); cadena(s, env(oc, t, 0.001, v * 0.3, d * 0.6, o));
    }
  });
}
function receta_barrido(f0, f1, dur, vol, q = 2) {
  return render(dur + 0.05, (oc, o) => {
    const bp = filtro(oc, 'bandpass', f0, q); bp.frequency.exponentialRampToValueAtTime(f1, dur);
    cadena(ruido(oc, 0, dur), bp, env(oc, 0, dur * 0.3, vol, dur * 0.7, o));
  });
}
function receta_impacto(tipo) {
  return render(0.6, (oc, o) => {
    if (tipo === 'carne' || tipo === 'cabeza') {
      const s = osc(oc, 'sine', 110, 0, 0.2); s.frequency.exponentialRampToValueAtTime(40, 0.1);
      cadena(s, env(oc, 0, 0.002, 0.9, 0.12, o));
      cadena(ruido(oc, 0, 0.12), filtro(oc, 'lowpass', 1400), env(oc, 0, 0.002, 0.6, 0.09, o));
      if (tipo === 'cabeza') {
        for (let i = 0; i < 6; i++) { const t = 0.005 + Math.random() * 0.05; cadena(ruido(oc, t, 0.015), filtro(oc, 'bandpass', 1500 + Math.random() * 2500, 4), env(oc, t, 0.001, 0.5, 0.015, o)); }
      }
    } else if (tipo === 'metal') {
      for (const f of [1750, 2630, 4100]) cadena(osc(oc, 'sine', f * (0.95 + Math.random() * 0.1), 0, 0.5), env(oc, 0, 0.001, 0.18, 0.35, o));
      cadena(ruido(oc, 0, 0.02), filtro(oc, 'highpass', 3000), env(oc, 0, 0.001, 0.5, 0.02, o));
    } else if (tipo === 'madera') {
      cadena(ruido(oc, 0, 0.1), filtro(oc, 'bandpass', 650, 3), env(oc, 0, 0.001, 0.9, 0.08, o));
    } else {
      cadena(ruido(oc, 0, 0.12), filtro(oc, 'lowpass', tipo === 'tierra' ? 1200 : 3200), env(oc, 0, 0.001, 0.7, 0.07, o));
      // silbido de rebote ocasional
      if (Math.random() < 0.5) { const s = osc(oc, 'sine', 3800, 0.01, 0.25); s.frequency.exponentialRampToValueAtTime(1800, 0.22); cadena(s, env(oc, 0.01, 0.01, 0.08, 0.2, o)); }
    }
  });
}
function receta_paso(pesado) {
  return render(0.25, (oc, o) => {
    cadena(ruido(oc, 0, 0.1), filtro(oc, 'lowpass', 700 + Math.random() * 400), env(oc, 0, 0.004, pesado ? 0.7 : 0.45, 0.07, o));
    cadena(ruido(oc, 0.02, 0.05), filtro(oc, 'bandpass', 2400, 2), env(oc, 0.02, 0.002, 0.12, 0.04, o));
    const s = osc(oc, 'sine', 70, 0, 0.12); cadena(s, env(oc, 0, 0.003, pesado ? 0.5 : 0.25, 0.08, o));
  });
}
/** Voz de zombi por síntesis de formantes. */
function receta_voz(tipo, clase) {
  const P = {
    caminante: { f0: [70, 115], dur: [1.1, 1.9], ruido: 0.25, form: [[520, 900, 2400], [420, 780, 2500]], dist: 3 },
    corredor: { f0: [180, 320], dur: [0.5, 0.9], ruido: 0.5, form: [[750, 1300, 2800], [650, 1700, 3000]], dist: 6 },
    acorazado: { f0: [60, 90], dur: [1.2, 1.8], ruido: 0.2, form: [[400, 700, 2200]], dist: 2, apagado: 900 },
    escupidor: { f0: [85, 120], dur: [1.0, 1.6], ruido: 0.6, form: [[350, 650, 2300]], dist: 4, gorgoteo: 24 },
    coloso: { f0: [38, 58], dur: [1.4, 2.2], ruido: 0.35, form: [[300, 600, 1900], [380, 700, 2100]], dist: 12 },
  }[tipo];
  const r = (a) => a[0] + Math.random() * (a[1] - a[0]);
  let dur = r(P.dur), f0 = r(P.f0);
  if (clase === 'ataque') { dur *= 0.6; f0 *= 1.25; }
  if (clase === 'dolor') { dur *= 0.35; f0 *= 1.4; }
  if (clase === 'muerte') { dur *= 1.1; }
  return render(dur + 0.3, (oc, o) => {
    const fuente = oc.createOscillator(); fuente.type = 'sawtooth';
    // contorno de tono con temblor
    const n = 24, curva = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let k = clase === 'muerte' ? 1.1 - t * 0.55 : clase === 'ataque' ? 0.85 + Math.sin(t * Math.PI) * 0.45 : 1 + Math.sin(t * 3 + Math.random()) * 0.12;
      curva[i] = f0 * k * (1 + (Math.random() - 0.5) * 0.12);
    }
    fuente.frequency.setValueCurveAtTime(curva, 0, dur);
    fuente.start(0); fuente.stop(dur + 0.1);
    const mezcla = oc.createGain(); mezcla.gain.value = 1;
    fuente.connect(mezcla);
    cadena(ruido(oc, 0, dur), filtro(oc, 'highpass', 400), (() => { const g = oc.createGain(); g.gain.value = P.ruido; return g; })(), mezcla);
    // gorgoteo (modulación de amplitud)
    let previo = mezcla;
    if (P.gorgoteo) {
      const am = oc.createGain(); am.gain.value = 0.5;
      const lfo = osc(oc, 'sine', P.gorgoteo, 0, dur + 0.1); const lg = oc.createGain(); lg.gain.value = 0.5;
      lfo.connect(lg); lg.connect(am.gain); mezcla.connect(am); previo = am;
    }
    const sum = oc.createGain(); sum.gain.value = 0.5;
    const form = P.form[Math.floor(Math.random() * P.form.length)];
    for (let i = 0; i < 3; i++) {
      const f = form[i] * (clase === 'ataque' ? 1.15 : 1) * (0.92 + Math.random() * 0.16);
      const bp = filtro(oc, 'bandpass', f, 6 + i * 2);
      const g = oc.createGain(); g.gain.value = [1, 0.6, 0.25][i];
      previo.connect(bp); bp.connect(g); g.connect(sum);
    }
    let fin = cadena(sum, distorsion(oc, P.dist));
    if (P.apagado) fin = cadena(fin, filtro(oc, 'lowpass', P.apagado));
    const v = clase === 'ataque' ? 0.9 : clase === 'dolor' ? 0.7 : 0.6;
    const e = oc.createGain();
    e.gain.setValueAtTime(0.0001, 0);
    e.gain.linearRampToValueAtTime(v, Math.min(0.12, dur * 0.2));
    e.gain.setValueAtTime(v, dur * 0.6);
    e.gain.exponentialRampToValueAtTime(0.0001, dur + 0.2);
    fin.connect(e); e.connect(o);
    if (tipo === 'coloso') { const s = osc(oc, 'sine', f0 * 0.5, 0, dur); cadena(s, env(oc, 0, 0.1, 0.5, dur, o)); }
  });
}
function receta_ambiente_viento() {
  return render(12, (oc, o) => {
    const lp = filtro(oc, 'lowpass', 500, 0.5);
    for (let i = 0; i < 12; i++) lp.frequency.linearRampToValueAtTime(250 + Math.random() * 700, i);
    const g = oc.createGain(); g.gain.value = 0.8;
    for (let i = 0; i < 12; i++) g.gain.linearRampToValueAtTime(0.4 + Math.random() * 0.6, i);
    cadena(ruido(oc, 0, 12.2, 'marron'), lp, g, o);
  });
}
function receta_sirena() {
  return render(9, (oc, o) => {
    const s = osc(oc, 'sawtooth', 600, 0, 9);
    for (let i = 0; i < 9; i += 1.5) { s.frequency.linearRampToValueAtTime(900, i + 0.75); s.frequency.linearRampToValueAtTime(600, i + 1.5); }
    cadena(s, filtro(oc, 'lowpass', 1200), filtro(oc, 'bandpass', 800, 0.8), env(oc, 0, 2.5, 0.25, 6, o));
  });
}
function receta_trueno() {
  return render(5, (oc, o) => cadena(ruido(oc, 0, 5, 'marron'), filtro(oc, 'lowpass', 180), env(oc, 0, 0.4, 1.2, 4.2, o)));
}
function receta_fuego() {
  return render(4, (oc, o) => {
    cadena(ruido(oc, 0, 4, 'marron'), filtro(oc, 'lowpass', 600), (() => { const g = oc.createGain(); g.gain.value = 0.5; return g; })(), o);
    for (let i = 0; i < 70; i++) { const t = Math.random() * 3.9; cadena(ruido(oc, t, 0.01), filtro(oc, 'bandpass', 2000 + Math.random() * 3000, 3), env(oc, t, 0.001, 0.25 + Math.random() * 0.4, 0.01, o)); }
  });
}
function receta_tono(notas, tipo = 'sine', vol = 0.3) {
  const dur = Math.max(...notas.map(n => n[0] + n[2])) + 0.1;
  return render(dur, (oc, o) => { for (const [t, f, d] of notas) cadena(osc(oc, tipo, f, t, t + d + 0.05), env(oc, t, 0.005, vol, d, o)); });
}

// ---------------------------------------------------------------------------
// Música generativa
// ---------------------------------------------------------------------------
const ACORDES = [[146.83, 174.61, 220.0], [116.54, 146.83, 174.61], [98.0, 116.54, 146.83], [110.0, 138.59, 164.81]]; // Rem, Sib, Solm, La
const BAJO = [73.42, 73.42, 87.31, 73.42, 65.41, 73.42, 98.0, 82.41];
const ESCALA_CAMPANA = [587.33, 698.46, 783.99, 880.0, 1046.5, 1174.66];

class Musica {
  constructor(ac, salida) {
    this.ac = ac; this.salida = salida;
    this.modo = 'menu'; this.intensidad = 0; this.intObjetivo = 0;
    this.bpm = 92; this.siguiente = ac.currentTime + 0.1; this.paso = 0;
    // pad: tres voces de sierra desafinadas
    this.padFiltro = ac.createBiquadFilter(); this.padFiltro.type = 'lowpass'; this.padFiltro.frequency.value = 500;
    this.padGain = ac.createGain(); this.padGain.gain.value = 0.0;
    this.padFiltro.connect(this.padGain); this.padGain.connect(salida);
    this.pad = [];
    for (let i = 0; i < 6; i++) {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.detune.value = (i % 2 ? 1 : -1) * 9;
      o.frequency.value = ACORDES[0][i % 3]; o.connect(this.padFiltro); o.start(); this.pad.push(o);
    }
    this.lfo = ac.createOscillator(); this.lfo.frequency.value = 0.07;
    const lg = ac.createGain(); lg.gain.value = 160; this.lfo.connect(lg); lg.connect(this.padFiltro.frequency); this.lfo.start();
    // capa de tensión (ruido filtrado con trémolo)
    this.tension = ac.createGain(); this.tension.gain.value = 0; this.tension.connect(salida);
    const fuente = ac.createBufferSource(); fuente.buffer = this.bufRuido(4); fuente.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 6;
    const trem = ac.createGain(); trem.gain.value = 0.5;
    const lfo2 = ac.createOscillator(); lfo2.frequency.value = 6; const lg2 = ac.createGain(); lg2.gain.value = 0.5;
    lfo2.connect(lg2); lg2.connect(trem.gain); lfo2.start();
    fuente.connect(bp); bp.connect(trem); trem.connect(this.tension); fuente.start();
  }

  bufRuido(d) { const b = this.ac.createBuffer(1, this.ac.sampleRate * d, this.ac.sampleRate); const x = b.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1; return b; }

  nota(tipo, f, t, dur, vol, corte = 2000) {
    const ac = this.ac, o = ac.createOscillator(); o.type = tipo; o.frequency.value = f;
    const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = corte;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(this.salida); o.start(t); o.stop(t + dur + 0.05);
  }
  bombo(t, vol) {
    const ac = this.ac, o = ac.createOscillator(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g); g.connect(this.salida); o.start(t); o.stop(t + 0.4);
  }

  setModo(m) {
    this.modo = m;
    if (m === 'derrota') {
      const t = this.ac.currentTime + 0.05;
      [293.66, 261.63, 233.08, 220.0, 146.83].forEach((f, i) => this.nota('sawtooth', f, t + i * 0.45, 1.2, 0.08, 900));
    }
  }

  actualizar(dt) {
    const ac = this.ac, ahora = ac.currentTime;
    const objetivo = this.modo === 'combate' || this.modo === 'jefe' ? this.intObjetivo : this.modo === 'menu' ? 0.12 : this.modo === 'derrota' ? 0 : 0.05;
    this.intensidad += (objetivo - this.intensidad) * Math.min(1, dt * 0.8);
    const I = this.intensidad;
    const padVol = this.modo === 'derrota' ? 0 : 0.035 + I * 0.025;
    this.padGain.gain.setTargetAtTime(padVol, ahora, 0.5);
    this.padFiltro.frequency.setTargetAtTime(380 + I * 1400, ahora, 0.4);
    this.tension.gain.setTargetAtTime(I > 0.55 ? (I - 0.55) * 0.05 : 0, ahora, 0.6);
    const negra = 60 / (this.bpm + I * 30);
    while (this.siguiente < ahora + 0.2) {
      const t = this.siguiente, p = this.paso;
      if (p % 8 === 0) {                        // cambio de acorde cada 2 compases
        const ac3 = ACORDES[(p / 8) % 4];
        this.pad.forEach((o, i) => o.frequency.setTargetAtTime(ac3[i % 3] * (i >= 3 ? 0.5 : 1), t, 0.25));
      }
      const combate = this.modo === 'combate' || this.modo === 'jefe';
      if (combate) {
        if (I > 0.2 && p % 2 === 0) this.bombo(t, 0.25 + I * 0.25);
        if (I > 0.45 && p % 2 === 1) this.bombo(t, 0.12);
        this.nota('sawtooth', BAJO[p % 8], t, negra * 0.9, 0.05 + I * 0.05, 300 + I * 500);
        if (this.modo === 'jefe' && p % 8 === 0) {
          [73.42, 77.78, 110].forEach(f => this.nota('square', f, t, negra * 3, 0.05, 700));
        }
      } else if (this.modo !== 'derrota' && Math.random() < 0.18) {
        this.nota('sine', ESCALA_CAMPANA[Math.floor(Math.random() * ESCALA_CAMPANA.length)], t, 3.5, 0.035, 5000);
      }
      this.siguiente += negra; this.paso++;
    }
  }
}

// ---------------------------------------------------------------------------
// Gestor de audio
// ---------------------------------------------------------------------------
export class Audio {
  constructor(ajustes, eventos) {
    this.ajustes = ajustes; this.eventos = eventos;
    this.ac = null; this.listo = false;
    this.sonidos = new Map();
    this.vocesActivas = 0;
    this.hrtf = true;
    eventos.on('ajustes:generales', () => this.aplicarVolumenes());
  }

  /** Debe llamarse tras un gesto del usuario (política de autoplay). */
  async iniciar(progreso) {
    if (this.ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ac = new AC();
    const ac = this.ac;
    this.maestro = ac.createGain(); this.maestro.connect(ac.destination);
    // compresor final para evitar saturación con muchos disparos
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4;
    this.maestro.disconnect(); this.maestro.connect(comp); comp.connect(ac.destination);
    this.bus = {};
    for (const b of ['musica', 'efectos', 'ambiente', 'interfaz']) { this.bus[b] = ac.createGain(); this.bus[b].connect(this.maestro); }
    // reverberación por convolución (respuesta de impulso generada)
    this.reverb = ac.createConvolver();
    const ir = ac.createBuffer(2, ac.sampleRate * 2.2, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3.2); }
    this.reverb.buffer = ir;
    this.envioReverb = ac.createGain(); this.envioReverb.gain.value = 0.35;
    this.envioReverb.connect(this.reverb); this.reverb.connect(this.bus.efectos);
    this.aplicarVolumenes();
    await this.generar(progreso);
    this.musica = new Musica(ac, this.bus.musica);
    this.iniciarAmbiente();
    this.listo = true;
  }

  aplicarVolumenes() {
    if (!this.ac) return;
    const g = this.ajustes.gen, t = this.ac.currentTime;
    this.maestro.gain.setTargetAtTime(g.volMaestro, t, 0.05);
    this.bus.musica.gain.setTargetAtTime(g.volMusica, t, 0.05);
    this.bus.efectos.gain.setTargetAtTime(g.volEfectos, t, 0.05);
    this.bus.interfaz.gain.setTargetAtTime(g.volEfectos, t, 0.05);
    this.bus.ambiente.gain.setTargetAtTime(g.volAmbiente, t, 0.05);
  }

  async generar(progreso) {
    const tareas = [];
    const add = (nombre, fn, n = 1) => { for (let i = 0; i < n; i++) tareas.push(async () => { const b = await fn(); if (!this.sonidos.has(nombre)) this.sonidos.set(nombre, []); this.sonidos.get(nombre).push(b); }); };
    add('disparo_pistola', () => receta_disparo({ cuerpo: 150, caida: 0.09, corte: 9000, cola: 0.7, chasquido: 0.8 }), 2);
    add('disparo_subfusil', () => receta_disparo({ cuerpo: 180, caida: 0.06, corte: 7000, cola: 0.45, chasquido: 0.6, grave: 0.7 }), 3);
    add('disparo_escopeta', () => receta_disparo({ cuerpo: 75, caida: 0.2, corte: 5000, cola: 1.3, chasquido: 1, grave: 1.4 }), 2);
    add('disparo_fusil', () => receta_disparo({ cuerpo: 115, caida: 0.11, corte: 10000, cola: 0.9, chasquido: 1 }), 3);
    add('disparo_toro', () => receta_disparo({ cuerpo: 105, caida: 0.13, corte: 8000, cola: 1.0, chasquido: 1, grave: 1.25 }), 2);
    add('disparo_recortada', () => receta_disparo({ cuerpo: 62, caida: 0.25, corte: 4400, cola: 1.55, chasquido: 1, grave: 1.7 }), 2);
    add('disparo_martillo', () => receta_disparo({ cuerpo: 82, caida: 0.17, corte: 5600, cola: 1.15, chasquido: 0.9, grave: 1.35 }), 3);
    add('disparo_halcon', () => receta_disparo({ cuerpo: 98, caida: 0.14, corte: 11000, cola: 1.25, chasquido: 1.1, grave: 1.15 }), 2);
    add('basculante_abrir', () => receta_mecanico([[0, 900, 0.08, 0.7], [0.06, 2600, 0.03, 0.5]]));
    add('basculante_cerrar', () => receta_mecanico([[0, 1300, 0.06, 0.9], [0.03, 700, 0.1, 0.8]]));
    add('botiquin_abrir', () => receta_mecanico([[0, 1800, 0.05, 0.4], [0.1, 1200, 0.08, 0.4], [0.22, 2400, 0.03, 0.3]]));
    add('botiquin_cura', () => receta_tono([[0, 523.25, 0.18], [0.12, 659.25, 0.2], [0.24, 783.99, 0.35]], 'sine', 0.25));
    add('explosion', () => render(3.2, (oc, o) => {
      cadena(ruido(oc, 0, 3, 'marron'), filtro(oc, 'lowpass', 1400), env(oc, 0, 0.004, 1.6, 2.8, o));
      cadena(ruido(oc, 0, 0.5), filtro(oc, 'highpass', 1800), env(oc, 0, 0.001, 1.0, 0.35, o));
      const s = osc(oc, 'sine', 70, 0, 1.4); s.frequency.exponentialRampToValueAtTime(26, 1.2); cadena(s, env(oc, 0, 0.003, 1.5, 1.2, o));
      cadena(ruido(oc, 0.15, 2.6, 'marron'), filtro(oc, 'bandpass', 380, 0.7), env(oc, 0.15, 0.3, 0.35, 2.2, o));
    }), 2);
    add('granada_rebote', () => receta_tono([[0, 2900, 0.03], [0.02, 1900, 0.05]], 'triangle', 0.25), 2);
    add('granada_lanzar', () => receta_barrido(500, 1400, 0.22, 0.4));
    add('granada_anilla', () => receta_mecanico([[0, 3400, 0.02, 0.6], [0.05, 2600, 0.03, 0.4]]));
    // nuevos: bebida, chaleco, armas cuerpo a cuerpo, molotov, lanzagranadas
    add('beber', () => receta_tono([[0, 320, 0.08], [0.12, 290, 0.08], [0.24, 270, 0.1], [0.4, 900, 0.12]], 'sine', 0.3));
    add('chaleco', () => receta_mecanico([[0, 900, 0.12, 0.5], [0.15, 700, 0.14, 0.5], [0.32, 2400, 0.03, 0.6]]));
    add('golpe_romo', () => render(0.5, (oc, o) => { const s = osc(oc, 'sine', 120, 0, 0.25); s.frequency.exponentialRampToValueAtTime(50, 0.2); cadena(s, env(oc, 0, 0.002, 1.2, 0.2, o)); cadena(ruido(oc, 0, 0.2, 'marron'), filtro(oc, 'lowpass', 1200), env(oc, 0, 0.002, 1, 0.15, o)); }), 2);
    add('golpe_filo', () => render(0.4, (oc, o) => { cadena(ruido(oc, 0, 0.25), filtro(oc, 'bandpass', 2600, 1.5), env(oc, 0, 0.002, 0.9, 0.18, o)); cadena(ruido(oc, 0, 0.2, 'marron'), filtro(oc, 'lowpass', 700), env(oc, 0, 0.002, 0.8, 0.12, o)); }), 2);
    add('barrido', () => receta_barrido(400, 4200, 0.28, 0.6, 1.8));
    add('arma_pesada_aire', () => receta_barrido(250, 1200, 0.32, 0.6, 1.2));
    add('vidrio_roto', () => render(0.9, (oc, o) => { cadena(ruido(oc, 0, 0.8), filtro(oc, 'highpass', 3500), env(oc, 0, 0.001, 1, 0.7, o)); for (const f of [3100, 4400, 5200]) cadena(osc(oc, 'triangle', f, 0, 0.3), env(oc, Math.random() * 0.1, 0.001, 0.15, 0.25, o)); }));
    add('disparo_lanzagranadas', () => render(0.8, (oc, o) => { const s = osc(oc, 'sine', 95, 0, 0.4); s.frequency.exponentialRampToValueAtTime(40, 0.3); cadena(s, env(oc, 0, 0.002, 1.3, 0.35, o)); cadena(ruido(oc, 0, 0.3, 'marron'), filtro(oc, 'lowpass', 900), env(oc, 0, 0.002, 1, 0.25, o)); }));
    add('moneda', () => receta_tono([[0, 1318.5, 0.06], [0.05, 1975.5, 0.12]], 'square', 0.08));
    add('recoger', () => receta_tono([[0, 700, 0.08], [0.07, 1050, 0.14]], 'triangle', 0.25));
    add('vacio', () => receta_mecanico([[0, 3200, 0.02, 0.7]]));
    add('cargador_fuera', () => receta_mecanico([[0, 2200, 0.03, 0.6], [0.05, 1400, 0.06, 0.4]]));
    add('cargador_dentro', () => receta_mecanico([[0, 1600, 0.05, 0.6], [0.06, 2600, 0.03, 0.8]]));
    add('corredera', () => receta_mecanico([[0, 1800, 0.08, 0.5], [0.12, 3000, 0.03, 0.9]]));
    add('bomba', () => receta_mecanico([[0, 1200, 0.1, 0.6], [0.18, 1500, 0.08, 0.8]]));
    add('cartucho', () => receta_mecanico([[0, 2400, 0.025, 0.5], [0.04, 900, 0.05, 0.5]]));
    add('cambio_arma', () => receta_barrido(600, 1800, 0.25, 0.4));
    add('cuchillo_aire', () => receta_barrido(700, 3500, 0.18, 0.5, 1.5));
    add('casquillo', () => receta_tono([[0, 4200, 0.05], [0.09, 3900, 0.04], [0.16, 4100, 0.03]], 'triangle', 0.06));
    for (const t of ['carne', 'cabeza', 'metal', 'madera', 'hormigon', 'tierra', 'suelo']) add('impacto_' + t, () => receta_impacto(t), 3);
    add('paso', () => receta_paso(false), 4);
    add('paso_zombi', () => receta_paso(true), 3);
    add('aterrizaje', () => receta_paso(true));
    add('latido', () => receta_tono([[0, 55, 0.12], [0.22, 50, 0.14]], 'sine', 0.8));
    add('dano_jugador', () => render(0.5, (oc, o) => { cadena(ruido(oc, 0, 0.3, 'marron'), filtro(oc, 'lowpass', 500), env(oc, 0, 0.005, 1.2, 0.25, o)); const s = osc(oc, 'sine', 90, 0, 0.3); s.frequency.exponentialRampToValueAtTime(45, 0.25); cadena(s, env(oc, 0, 0.003, 0.8, 0.25, o)); }));
    add('marca', () => receta_tono([[0, 2900, 0.04]], 'square', 0.12));
    add('marca_baja', () => receta_tono([[0, 2200, 0.05], [0.06, 3300, 0.07]], 'square', 0.14));
    add('compra', () => receta_tono([[0, 880, 0.12], [0.1, 1318.5, 0.25]], 'triangle', 0.3));
    add('sin_puntos', () => receta_tono([[0, 140, 0.25]], 'square', 0.18));
    add('oleada_inicio', () => render(4, (oc, o) => { for (const f of [73.42, 110, 146.83, 77.78]) { const s = osc(oc, 'sawtooth', f, 0, 3.5); cadena(s, filtro(oc, 'lowpass', 700), env(oc, 0, 0.05, 0.12, 3.4, o)); } cadena(ruido(oc, 0, 3, 'marron'), filtro(oc, 'lowpass', 120), env(oc, 0, 0.02, 1.5, 2.5, o)); }));
    add('oleada_fin', () => receta_tono([[0, 587.33, 1.2], [0.2, 880, 1.4], [0.4, 1174.66, 1.8]], 'sine', 0.2));
    add('escupir', () => render(0.5, (oc, o) => { cadena(ruido(oc, 0, 0.3), filtro(oc, 'bandpass', 1100, 2), env(oc, 0, 0.02, 0.8, 0.25, o)); }));
    add('acido_impacto', () => render(1.4, (oc, o) => { cadena(ruido(oc, 0, 1.3), filtro(oc, 'highpass', 2500), env(oc, 0, 0.01, 0.5, 1.2, o)); cadena(ruido(oc, 0, 0.2), filtro(oc, 'lowpass', 600), env(oc, 0, 0.003, 0.8, 0.15, o)); }));
    add('golpe_suelo', () => render(1.6, (oc, o) => { const s = osc(oc, 'sine', 70, 0, 0.8); s.frequency.exponentialRampToValueAtTime(25, 0.6); cadena(s, env(oc, 0, 0.005, 1.4, 0.7, o)); cadena(ruido(oc, 0, 1.2, 'marron'), filtro(oc, 'lowpass', 900), env(oc, 0, 0.01, 1.2, 1.1, o)); }));
    add('emerger', () => render(1.2, (oc, o) => { cadena(ruido(oc, 0, 1.1, 'marron'), filtro(oc, 'lowpass', 800), env(oc, 0, 0.3, 0.8, 0.8, o)); }));
    for (const tipo of ['caminante', 'corredor', 'acorazado', 'escupidor', 'coloso']) {
      add(`voz_${tipo}_gemido`, () => receta_voz(tipo, 'gemido'), 3);
      add(`voz_${tipo}_ataque`, () => receta_voz(tipo, 'ataque'), 2);
      add(`voz_${tipo}_dolor`, () => receta_voz(tipo, 'dolor'), 2);
      add(`voz_${tipo}_muerte`, () => receta_voz(tipo, 'muerte'), 2);
    }
    add('viento', receta_ambiente_viento);
    add('sirena', receta_sirena);
    add('trueno', receta_trueno);
    add('fuego', receta_fuego);
    let hechas = 0;
    // en lotes para no bloquear el hilo principal
    for (let i = 0; i < tareas.length; i += 8) {
      await Promise.all(tareas.slice(i, i + 8).map(t => t()));
      hechas = Math.min(tareas.length, i + 8);
      progreso?.(hechas / tareas.length);
    }
  }

  iniciarAmbiente() {
    const ac = this.ac;
    const v = ac.createBufferSource(); v.buffer = this.sonidos.get('viento')[0]; v.loop = true;
    const g = ac.createGain(); g.gain.value = 0.5; v.connect(g); g.connect(this.bus.ambiente); v.start();
    this.proxEvento = 8;
  }

  setCalidad(nivelEfectos) { this.hrtf = nivelEfectos >= 3; }

  actualizarOyente(camara, dt) {
    if (!this.listo) return;
    const l = this.ac.listener, p = camara.position;
    const f = camara.getWorldDirection(this._f || (this._f = camara.position.clone()));
    if (l.positionX) {
      const t = this.ac.currentTime;
      l.positionX.setTargetAtTime(p.x, t, 0.01); l.positionY.setTargetAtTime(p.y, t, 0.01); l.positionZ.setTargetAtTime(p.z, t, 0.01);
      l.forwardX.setTargetAtTime(f.x, t, 0.01); l.forwardY.setTargetAtTime(f.y, t, 0.01); l.forwardZ.setTargetAtTime(f.z, t, 0.01);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
    this.musica.actualizar(dt);
    // eventos ambientales aleatorios (sirenas, truenos lejanos)
    this.proxEvento -= dt;
    if (this.proxEvento <= 0) {
      this.proxEvento = 18 + Math.random() * 30;
      const a = Math.random() * Math.PI * 2;
      this.reproducir(Math.random() < 0.5 ? 'sirena' : 'trueno', { bus: 'ambiente', pos: { x: p.x + Math.cos(a) * 70, y: 10, z: p.z + Math.sin(a) * 70 }, vol: 0.6, ref: 40, reverb: 0.4 });
    }
  }

  /**
   * Reproduce un sonido. op: { pos, vol, tono, bus, reverb, ref (distancia de referencia), voz }
   * Devuelve el nodo fuente (o null).
   */
  reproducir(nombre, op = {}) {
    if (!this.listo) return null;
    const lista = this.sonidos.get(nombre); if (!lista) return null;
    if (op.voz) { if (this.vocesActivas >= 8) return null; this.vocesActivas++; }
    const ac = this.ac;
    const s = ac.createBufferSource(); s.buffer = lista[Math.floor(Math.random() * lista.length)];
    s.playbackRate.value = (op.tono || 1) * (0.96 + Math.random() * 0.08);
    const g = ac.createGain(); g.gain.value = op.vol ?? 1;
    s.connect(g);
    let ult = g;
    if (op.pos) {
      const pan = ac.createPanner();
      pan.panningModel = this.hrtf ? 'HRTF' : 'equalpower';
      pan.distanceModel = 'inverse'; pan.refDistance = op.ref || 2.5; pan.rolloffFactor = 1.1; pan.maxDistance = 90;
      if (pan.positionX) { pan.positionX.value = op.pos.x; pan.positionY.value = op.pos.y; pan.positionZ.value = op.pos.z; }
      else pan.setPosition(op.pos.x, op.pos.y, op.pos.z);
      g.connect(pan); ult = pan;
    }
    ult.connect(this.bus[op.bus || 'efectos']);
    if (op.reverb !== 0) { const r = ac.createGain(); r.gain.value = op.reverb ?? 0.25; ult.connect(r); r.connect(this.envioReverb); }
    s.onended = () => { if (op.voz) this.vocesActivas--; s.disconnect(); };
    s.start(ac.currentTime + (op.retraso || 0));
    return s;
  }

  /** Fuente en bucle posicional (fuegos). */
  bucle(nombre, pos, vol = 0.6) {
    if (!this.listo) return null;
    const ac = this.ac, s = ac.createBufferSource(); s.buffer = this.sonidos.get(nombre)[0]; s.loop = true;
    const g = ac.createGain(); g.gain.value = vol;
    const pan = ac.createPanner(); pan.distanceModel = 'inverse'; pan.refDistance = 2; pan.rolloffFactor = 1.4; pan.panningModel = 'equalpower';
    if (pan.positionX) { pan.positionX.value = pos.x; pan.positionY.value = pos.y; pan.positionZ.value = pos.z; } else pan.setPosition(pos.x, pos.y, pos.z);
    s.connect(g); g.connect(pan); pan.connect(this.bus.ambiente); s.start(ac.currentTime + Math.random());
    (this.bucles || (this.bucles = [])).push(s);
    return s;
  }

  /** Detiene todos los bucles posicionales (al cambiar de mapa). */
  detenerBucles() {
    for (const s of this.bucles || []) { try { s.stop(); s.disconnect(); } catch (e) { /* ya parado */ } }
    this.bucles = [];
  }

  setMusica(modo) { this.musica?.setModo(modo); }
  setIntensidad(v) { if (this.musica) this.musica.intObjetivo = v; }
  suspender() { this.ac?.suspend(); }
  reanudar() { this.ac?.resume(); }
}
