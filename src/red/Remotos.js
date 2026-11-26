import * as THREE from 'three';
import { T } from './protocolo.js';

/**
 * Jugadores remotos de la sala.
 *
 * Interpolación con búfer: cada estado recibido se guarda con su hora de llegada y el
 * remoto se dibuja RETRASO ms en el pasado, entre los dos estados que rodean ese instante.
 * Así el movimiento es suave aunque los mensajes lleguen a 15 Hz y con variaciones.
 * Nunca se extrapola: si dejan de llegar mensajes (pestaña en segundo plano, corte)
 * el remoto se queda en el último estado conocido. Un salto grande (reaparición) se
 * aplica de golpe en vez de "volar" por el mapa.
 */
const RETRASO = 110;           // ms de retraso de interpolación (~1,5 envíos a 15 Hz)
const ENVIO_HZ = 15;
const DESLIZ = 150;           // ms para llegar a la posición nueva tras un corte de mensajes
const SALTO = 6;               // m: más que esto entre dos estados = teletransporte
const COLORES = [0x3d8bfd, 0xf2a93b, 0x4cc38a, 0xd65db1];

const r2 = v => Math.round(v * 100) / 100;

export class Remotos {
  constructor(ctx) {
    this.ctx = ctx;
    this.lista = new Map();            // id → { raiz, cuerpo, etiqueta, bufer: [], arma, vivo }
    this.envioT = 0;
    const red = ctx.red;
    red.alMensaje(T.JUGADOR, m => this.aplicar(m));
    red.alMensaje(T.SALIO, m => this.quitar(m.id));
    ctx.eventos.on('red:caida', () => this.limpiar());
  }

  /** Estado de otro jugador. Los mensajes de presentación (solo nombre/skin) no traen posición. */
  aplicar(m) {
    if (!this.ctx.partida.modoSala || !Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(Number.isFinite)) return;
    let r = this.lista.get(m.de);
    if (!r) r = this.crear(m.de);
    const e = { t: performance.now(), x: m.p[0], y: m.p[1], z: m.p[2], yaw: +m.yaw || 0, pitch: +m.pitch || 0 };
    const ult = r.bufer.at(-1);
    if (ult && Math.hypot(e.x - ult.x, e.z - ult.z) > SALTO) r.bufer.length = 0;   // reaparición: sin interpolar
    else if (ult && e.t - ult.t > 400) { r.bufer.length = 0; r.bufer.push({ ...ult, t: e.t - DESLIZ }); }  // tras un corte: deslizar, no saltar
    r.bufer.push(e);
    if (r.bufer.length > 20) r.bufer.splice(0, r.bufer.length - 20);
    r.arma = typeof m.arma === 'string' ? m.arma : r.arma;
    r.vivo = m.vivo !== false;
  }

  crear(id) {
    const color = COLORES[(id - 1) % COLORES.length];
    const raiz = new THREE.Group();
    raiz.name = `remoto${id}`;
    const cuerpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.1, 4, 10), new THREE.MeshLambertMaterial({ color }));
    cuerpo.position.y = 0.9;
    raiz.add(cuerpo);
    const etiqueta = this.crearEtiqueta(this.nombre(id), color);
    etiqueta.position.y = 2.15;
    raiz.add(etiqueta);
    this.ctx.escena.add(raiz);
    const r = { id, raiz, cuerpo, etiqueta, bufer: [], arma: null, vivo: true, nombre: this.nombre(id) };
    this.lista.set(id, r);
    return r;
  }

  nombre(id) { return this.ctx.red.perfiles.get(id)?.n || `Jugador ${id}`; }

  crearEtiqueta(texto, color) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(texto, 128, 32);
    g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillText(texto, 128, 32);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(1.6, 0.4, 1); s.renderOrder = 10;
    return s;
  }

  quitar(id) {
    const r = this.lista.get(id);
    if (!r) return;
    this.ctx.escena.remove(r.raiz);
    r.raiz.traverse(o => { o.geometry?.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } });
    this.lista.delete(id);
  }

  limpiar() { for (const id of [...this.lista.keys()]) this.quitar(id); }

  actualizar(dt) {
    const ahora = performance.now() - RETRASO;
    for (const r of this.lista.values()) {
      const b = r.bufer;
      if (!b.length) continue;
      // nombre: puede llegar después del primer estado
      const n = this.nombre(r.id);
      if (n !== r.nombre) { r.nombre = n; r.raiz.remove(r.etiqueta); r.etiqueta.material.map.dispose(); r.etiqueta = this.crearEtiqueta(n, COLORES[(r.id - 1) % COLORES.length]); r.etiqueta.position.y = 2.15; r.raiz.add(r.etiqueta); }
      let a = b[0], c = b[0];
      for (let i = b.length - 1; i >= 0; i--) { if (b[i].t <= ahora) { a = b[i]; c = b[i + 1] || b[i]; break; } }
      const k = c === a ? 0 : Math.min(1, Math.max(0, (ahora - a.t) / (c.t - a.t)));
      r.raiz.position.set(a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k, a.z + (c.z - a.z) * k);
      let dy = c.yaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      r.raiz.rotation.y = a.yaw + dy * k;
      r.cuerpo.rotation.x = r.vivo ? 0 : Math.PI / 2;              // caído: tumbado
      r.cuerpo.position.y = r.vivo ? 0.9 : 0.35;
      // descartar estados ya pasados (deja uno anterior para interpolar)
      while (b.length > 2 && b[1].t <= ahora) b.shift();
    }
  }

  /** Envía el estado propio a ENVIO_HZ (se agrupa y sale en red.vaciar()). */
  enviarEstado(dt) {
    this.envioT -= dt;
    if (this.envioT > 0) return;
    this.envioT = 1 / ENVIO_HZ;
    const j = this.ctx.jugador;
    this.ctx.red.enviar(T.JUGADOR, {
      p: [r2(j.pos.x), r2(j.pos.y), r2(j.pos.z)], yaw: r2(j.yaw), pitch: r2(j.pitch),
      arma: this.ctx.armas.actual?.def.id || null, vivo: j.vivo,
    });
  }
}
