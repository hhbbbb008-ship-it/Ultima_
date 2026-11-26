import * as THREE from 'three';
import { T } from './protocolo.js';
import { TIPOS } from '../enemigos/TiposZombi.js';

/**
 * Replicación de zombis y oleadas en una sala (modelo "anfitrión autoritativo").
 *
 *  Anfitrión: simula todo como en solitario y envía una instantánea compacta a 10 Hz
 *             (+ eventos puntuales: bajas, daño a jugadores, cambios de oleada).
 *  Cliente:   no tiene IA; sus zombis son réplicas que siguen la instantánea.
 *             Los impactos se calculan en el cliente contra las réplicas (respuesta
 *             inmediata: sangre, marcador, muerte prevista) y se envían agrupados al
 *             anfitrión, que aplica el daño real con la misma fórmula y confirma la baja.
 *  Recompensas (puntos, monedas, objetos que caen) solo para quien hizo la baja.
 */
const TIPOS_L = Object.keys(TIPOS);
const ESTADOS = ['emerger', 'perseguir', 'atacar', 'aturdido', 'escupir', 'preparaCarga', 'cargando', 'muerto'];
const OLEADA = ['inactiva', 'preparacion', 'activa', 'completada'];
const ZOMBIS_HZ = 10;
const DANO_HZ = 10;
const MAX_DANOS = 150;          // entradas por mensaje (cada una ~40 bytes, muy por debajo de 16 KB)
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const _v = new THREE.Vector3();

export class Replicacion {
  constructor(ctx) {
    this.ctx = ctx;
    this.zombisT = 0; this.danoT = 0;
    this.danos = [];
    const red = ctx.red, ev = ctx.eventos;
    red.alMensaje(T.ZOMBIS, m => { if (this.cliente) this.aplicarInstantanea(m); });
    red.alMensaje(T.DANO, m => { if (this.anfitrion) this.aplicarDanos(m); });
    red.alMensaje(T.EVENTO, m => this.evento(m));
    // anfitrión → todos: sucesos que no pueden perderse entre instantáneas
    ev.on('zombi:muerto', d => {
      if (!this.anfitrion || d.autor === 'replica') return;
      red.enviar(T.EVENTO, { e: 'baja', zid: d.zombi.id, a: d.autor ?? red.id, parte: d.parte, fuente: d.fuente, dx: r2(d.dir?.x || 0), dz: r2(d.dir?.z || 1) });
    });
    ev.on('oleada:preparacion', d => { if (this.anfitrion) red.enviar(T.EVENTO, { e: 'oleada', f: 'preparacion', n: d.n, espera: d.espera }); });
    ev.on('oleada:inicio', d => { if (this.anfitrion) red.enviar(T.EVENTO, { e: 'oleada', f: 'inicio', n: d.n, total: d.total, jefe: d.jefe }); });
    ev.on('oleada:fin', d => { if (this.anfitrion) red.enviar(T.EVENTO, { e: 'oleada', f: 'fin', n: d.n }); });
    ev.on('oleada:jefe', () => { if (this.anfitrion) red.enviar(T.EVENTO, { e: 'oleada', f: 'jefe' }); });
  }

  get anfitrion() { return this.ctx.partida.modoSala && this.ctx.red.esAnfitrion; }
  get cliente() { return this.ctx.partida.modoSala && this.ctx.red.activa && !this.ctx.red.esAnfitrion; }

  actualizar(dt) {
    if (this.anfitrion) {
      this.zombisT -= dt;
      if (this.zombisT <= 0) { this.zombisT = 1 / ZOMBIS_HZ; this.ctx.red.enviar(T.ZOMBIS, this.instantanea()); }
    } else if (this.cliente) {
      this.danoT -= dt;
      if (this.danoT <= 0 && this.danos.length) { this.danoT = 1 / DANO_HZ; this.vaciarDanos(); }
    }
  }

  // ------------------------------------------------------------------ anfitrión
  /** [id, tipo, x, z, yaw, estado, vida, armadura+casco] por zombi vivo, más el estado de la oleada. */
  instantanea() {
    const z = [];
    for (const o of this.ctx.zombis.activos) {
      if (!o.vivo) continue;
      z.push([o.id, TIPOS_L.indexOf(o.tipo), r1(o.pos.x), r1(o.pos.z), r2(o.yaw), ESTADOS.indexOf(o.estado), Math.ceil(o.vida), (o.armadura ? 1 : 0) | (o.cascoVida > 0 ? 2 : 0)]);
    }
    const ol = this.ctx.oleadas;
    return { z, o: [ol.n, OLEADA.indexOf(ol.estado), ol.restantes, Math.ceil(ol.cuenta || 0)] };
  }

  aplicarDanos(m) {
    if (!Array.isArray(m.l)) return;
    const Z = this.ctx.zombis;
    for (const e of m.l.slice(0, MAX_DANOS)) {
      if (!Array.isArray(e)) continue;
      let [zid, dano, parte, fuente, dx, dz] = e;
      const z = Z.porId.get(zid);
      if (!z || !z.vivo || !(dano >= 0)) continue;
      dano = Math.min(dano, 4000);           // límite de cordura (el mayor golpe del juego queda muy por debajo)
      const dir = _v.set(+dx || 0, 0, +dz || 1).normalize();
      z.autor = m.de;
      if (fuente === 'fuego') z.quemar(dano);
      else if (fuente === '!arm') z.quitarArmadura(dir.clone(), true);
      else z.recibirImpacto(dano, z.puntoTorso(), dir.clone(), ['torso', 'cabeza', 'piernas'].includes(parte) ? parte : 'torso', String(fuente).slice(0, 20));
      z.autor = null;
    }
  }

  // ------------------------------------------------------------------ cliente
  /** Lo llama Zombi cuando una réplica recibe daño en este equipo. */
  registrarDano(z, dano, parte, fuente, dir) {
    this.danos.push([z.id, r1(dano), parte, fuente, dir ? r2(dir.x) : 0, dir ? r2(dir.z) : 1]);
    if (this.danos.length >= MAX_DANOS) this.vaciarDanos();
  }

  vaciarDanos() {
    if (!this.danos.length) return;
    this.ctx.red.enviar(T.DANO, { l: this.danos });
    this.danos = [];
  }

  aplicarInstantanea(m) {
    const Z = this.ctx.zombis, ahora = performance.now();
    if (!Array.isArray(m.z)) return;
    const vistos = new Set();
    for (const e of m.z) {
      if (!Array.isArray(e) || e.length < 8) continue;
      const [id, ti, x, zz, yaw, ei, vida, bits] = e;
      const tipo = TIPOS_L[ti];
      if (!tipo || !Number.isFinite(x) || !Number.isFinite(zz)) continue;
      vistos.add(id);
      let z = Z.porId.get(id);
      if (!z) { z = Z.crearReplica(id, tipo, new THREE.Vector3(x, 0, zz)); z.vidaMax = z.vida = vida; z.creadoT = ahora; }
      if (z.estado === 'muerto') {
        // muerte prevista que el anfitrión no confirmó: el zombi sigue vivo, se levanta
        if (z.previstoT && ahora - z.previstoT > 1500) z.revivir(vida);
        continue;
      }
      // velocidad estimada entre instantáneas (para la zancada y para suavizar)
      const dt = Math.max(0.05, (ahora - (z.instT || ahora - 100)) / 1000);
      z.vel.set((x - z.objX) / dt, 0, (zz - z.objZ) / dt).clampLength(0, 9);
      z.objX = x; z.objZ = zz; z.objYaw = yaw; z.instT = ahora;
      const est = ESTADOS[ei] || 'perseguir';
      if (est !== z.estado && est !== 'muerto') { z.estado = est; z.t = 0; }
      z.vida = Math.min(z.vida, vida);
      if (!(bits & 1) && z.armadura) z.quitarArmadura(new THREE.Vector3(0, 0, 1), true);
      if (!(bits & 2) && z.cascoVida > 0) { z.cascoVida = 0; z.perderCasco(new THREE.Vector3(0, 1, 0)); }
    }
    // zombis que el anfitrión ya no tiene (y no están muriendo aquí): fuera
    for (const z of [...Z.activos]) if (z.replica && z.vivo && !vistos.has(z.id) && ahora - (z.creadoT || 0) > 400) Z.reciclar(z);
    // oleada
    if (Array.isArray(m.o)) {
      const ol = this.ctx.oleadas;
      ol.n = m.o[0]; ol.estado = OLEADA[m.o[1]] || ol.estado; ol.restRemoto = m.o[2]; ol.cuenta = m.o[3];
    }
  }

  evento(m) {
    const ctx = this.ctx, red = ctx.red, yo = red.id;
    if (m.e === 'dano' && m.a === yo) ctx.jugador.recibirDano(+m.c || 0, new THREE.Vector3(+m.x || 0, 0, +m.z || 0), m.tipo || undefined);
    else if (m.e === 'emp' && m.a === yo) ctx.jugador.empujar(+m.x || 0, +m.y || 0, +m.z || 0);
    else if (m.e === 'baja' && this.cliente) {
      const z = ctx.zombis.porId.get(m.zid);
      if (!z) return;
      const dir = new THREE.Vector3(+m.dx || 0, 0, +m.dz || 1);
      if (z.vivo) z.morir(dir, m.parte, m.fuente);                       // visual; recompensas: abajo
      z.previstoT = 0;
      if (m.a === yo) ctx.eventos.emit('zombi:muerto', { zombi: z, tipo: z.tipo, parte: m.parte, fuente: m.fuente, pos: z.pos.clone(), dir, autor: null, confirmado: true });
    } else if (m.e === 'oleada' && this.cliente) this.oleada(m);
    else if (m.e === 'proy' && this.cliente && Array.isArray(m.o) && Array.isArray(m.d)) {
      ctx.proyectiles.lanzar(new THREE.Vector3(...m.o.map(Number)), new THREE.Vector3(...m.d.map(Number)), 0);
      ctx.audio.reproducir('escupir', { pos: new THREE.Vector3(...m.o.map(Number)), vol: 0.9, ref: 3 });
    }
  }

  /** Cambios de oleada en el cliente: mismos avisos, música y bono que en solitario. */
  oleada(m) {
    const ctx = this.ctx, ol = ctx.oleadas, ev = ctx.eventos;
    if (m.f === 'preparacion') {
      ol.n = m.n; ol.estado = 'preparacion'; ol.cuenta = m.espera;
      ctx.audio.setMusica('calma');
      ev.emit('oleada:preparacion', { n: m.n, espera: m.espera });
    } else if (m.f === 'inicio') {
      ol.n = m.n; ol.estado = 'activa'; ol.restRemoto = m.total;
      ctx.audio.setMusica(m.jefe ? 'jefe' : 'combate');
      ctx.audio.reproducir('oleada_inicio', { bus: 'interfaz', vol: 0.9, reverb: 0.5 });
      ev.emit('oleada:inicio', { n: m.n, total: m.total, jefe: m.jefe });
    } else if (m.f === 'fin') {
      ol.estado = 'completada'; ol.restRemoto = 0;
      const bono = ctx.puntuacion.bonoOleada(m.n);
      ctx.audio.reproducir('oleada_fin', { bus: 'interfaz', vol: 0.8, reverb: 0.4 });
      ev.emit('oleada:fin', { n: m.n, bono });
    } else if (m.f === 'jefe') ev.emit('oleada:jefe');
  }
}
