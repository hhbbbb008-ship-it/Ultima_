import * as THREE from 'three';
import { T, RED_HZ } from './protocolo.js';
import { ARMAS } from '../armas/DefArmas.js';
import { crearCuerpoJugador, sanearSkin, SKIN_DEFECTO } from '../jugador/CuerpoJugador.js';

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
const RETRASO = 130;           // ms de retraso de interpolación (~1,5 envíos a RED_HZ)
const DESLIZ = 150;           // ms para llegar a la posición nueva tras un corte de mensajes
const SALTO = 6;               // m: más que esto entre dos estados = teletransporte
const COLORES = [0x3d8bfd, 0xf2a93b, 0x4cc38a, 0xd65db1];

const r2 = v => Math.round(v * 100) / 100;

export class Remotos {
  constructor(ctx) {
    this.ctx = ctx;
    this.lista = new Map();            // id → { raiz, cuerpo, etiqueta, bufer: [], arma, vivo }
    this.envioT = 0;
    this.disparos = 0;                 // disparos propios desde el último estado enviado
    this.disparosVistos = 0;           // disparos de otros reproducidos aquí
    this.skinPorDefecto = SKIN_DEFECTO;
    ctx.eventos.on('arma:disparo', () => { if (ctx.partida.modoSala) this.disparos++; });
    const red = ctx.red;
    red.alTick(() => { if (ctx.partida.emitiendoSala) this.enviarEstado(); });
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
    // disparos desde el último estado: se reproducen repartidos en el intervalo de envío
    const ds = Math.min(20, Math.max(0, m.ds | 0));
    if (ds) { r.pend += ds; r.pendInt = (1 / RED_HZ) / ds; }
    // objetivo para la IA del anfitrión: último estado recibido (sin el retraso de interpolación)
    const o = r.obj, dtv = ult ? Math.max(0.03, (e.t - ult.t) / 1000) : 1;
    if (ult) o.vel.set((e.x - o.pos.x) / dtv, 0, (e.z - o.pos.z) / dtv).clampLength(0, 8);
    o.pos.set(e.x, e.y, e.z); o.vivo = r.vivo;
  }

  crear(id) {
    const color = COLORES[(id - 1) % COLORES.length];
    const raiz = new THREE.Group();
    raiz.name = `remoto${id}`;
    const skin = this.skin(id);
    const cuerpo = crearCuerpoJugador(skin);
    raiz.add(cuerpo.raiz);
    const etiqueta = this.crearEtiqueta(this.nombre(id), color);
    etiqueta.position.y = 2.15;
    raiz.add(etiqueta);
    this.ctx.escena.add(raiz);
    const red = this.ctx.red;
    // "jugador" remoto tal como lo ve la IA de zombis del anfitrión: el daño y los empujones se le envían
    const obj = {
      id, remoto: true, pos: new THREE.Vector3(), vel: new THREE.Vector3(), vivo: true,
      recibirDano: (c, desde, tipo) => red.enviar(T.EVENTO, { e: 'dano', a: id, c: r2(c), x: r2(desde?.x || 0), z: r2(desde?.z || 0), tipo: tipo || null }),
      empujar: (x, y, z) => red.enviar(T.EVENTO, { e: 'emp', a: id, x: r2(x), y: r2(y), z: r2(z) }),
      sacudir: () => {},
    };
    const r = { id, raiz, cuerpo, etiqueta, bufer: [], arma: null, vivo: true, nombre: this.nombre(id), obj, pend: 0, pendInt: 0, pendT: 0, skinClave: JSON.stringify(skin), velVista: 0 };
    this.lista.set(id, r);
    return r;
  }

  nombre(id) { return this.ctx.red.perfiles.get(id)?.n || `Jugador ${id}`; }
  skin(id) { return sanearSkin(this.ctx.red.perfiles.get(id)?.skin); }

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
    r.cuerpo.liberar();
    r.etiqueta.material.map.dispose(); r.etiqueta.material.dispose();
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
      // aspecto: puede llegar (o cambiar) después de crear el cuerpo
      const sk = this.skin(r.id), clave = JSON.stringify(sk);
      if (clave !== r.skinClave) { r.raiz.remove(r.cuerpo.raiz); r.cuerpo.liberar(); r.cuerpo = crearCuerpoJugador(sk); r.raiz.add(r.cuerpo.raiz); r.skinClave = clave; }
      const px = r.raiz.position.x, pz = r.raiz.position.z;
      let a = b[0], c = b[0];
      for (let i = b.length - 1; i >= 0; i--) { if (b[i].t <= ahora) { a = b[i]; c = b[i + 1] || b[i]; break; } }
      const k = c === a ? 0 : Math.min(1, Math.max(0, (ahora - a.t) / (c.t - a.t)));
      r.raiz.position.set(a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k, a.z + (c.z - a.z) * k);
      let dy = c.yaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      r.raiz.rotation.y = a.yaw + dy * k;
      if (dt > 0) r.velVista += (Math.hypot(r.raiz.position.x - px, r.raiz.position.z - pz) / dt - r.velVista) * Math.min(1, dt * 8);
      r.cuerpo.animar(dt, r.velVista, r.vivo);
      if (r.pend > 0) { r.pendT -= dt; while (r.pend > 0 && r.pendT <= 0) { r.pend--; r.pendT += r.pendInt; this.disparoRemoto(r); } }
      // descartar estados ya pasados (deja uno anterior para interpolar)
      while (b.length > 2 && b[1].t <= ahora) b.shift();
    }
  }

  /** Sonido y fogonazo del disparo de otro jugador; en el anfitrión además alerta a los zombis. */
  disparoRemoto(r) {
    this.disparosVistos++;
    const def = ARMAS[r.arma];
    const p = r.raiz.position, yaw = r.raiz.rotation.y;
    const boca = { x: p.x - Math.sin(yaw) * 0.5, y: p.y + 1.45, z: p.z - Math.cos(yaw) * 0.5 };
    if (def?.sonido) this.ctx.audio.reproducir(def.sonido, { pos: boca, vol: 0.8, ref: 6, reverb: 0.45 });
    this.ctx.particulas.emitir('humoCanon', boca, { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) }, 0.8);
    if (this.ctx.red.esAnfitrion) this.ctx.zombis.alertar(p, 38);
  }

  /** Estado propio para el próximo paquete (lo llama la red en cada tick). */
  enviarEstado() {
    const j = this.ctx.jugador;
    this.ctx.red.enviar(T.JUGADOR, {
      p: [r2(j.pos.x), r2(j.pos.y), r2(j.pos.z)], yaw: r2(j.yaw), pitch: r2(j.pitch),
      arma: this.ctx.armas.actual?.def.id || null, vivo: j.vivo, ds: this.disparos,
    });
    this.disparos = 0;
  }
}
