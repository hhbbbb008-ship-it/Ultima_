import * as THREE from 'three';
import { ConstructorArmas } from '../armas/ModelosArmas.js';
import { ARMAS, CAJA_MUNICION } from '../armas/DefArmas.js';

/**
 * Cajas de munición que sueltan los zombis al morir.
 * - Cae una cada 5-8 bajas (media: 1 de cada 6-7). El Coloso siempre suelta una.
 * - Se recoge pasando por encima. El arma en la mano recibe su cantidad completa
 *   (p. ej. 90 balas de subfusil o fusil, 24 cartuchos de escopeta) y las demás
 *   armas que llevas, el 60 %. Nunca supera la reserva máxima de cada arma.
 * - Al superar cada oleada, reabastecimiento: 2 cargadores para cada arma.
 * - Si todas tus armas están llenas, la caja se queda en el suelo.
 * - Desaparece a los 40 s (parpadea los últimos 6).
 */
const MAX_CAJAS = 8;

export class Municion {
  constructor(ctx) {
    this.ctx = ctx;
    this.activas = [];
    this.fabrica = new ConstructorArmas(ctx.recursos);
    this.matHalo = new THREE.MeshBasicMaterial({ color: 0xffc23a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.geoHalo = new THREE.RingGeometry(0.3, 0.6, 24).rotateX(-Math.PI / 2);
    this.reiniciarContador();
    ctx.eventos.on('zombi:muerto', d => { if (!d.autor) this.alMorir(d); });   // autor: baja de otro jugador o réplica
    ctx.eventos.on('oleada:fin', () => this.reabastecer());
  }

  reiniciarContador() {
    const [a, b] = CAJA_MUNICION.cada;
    this.bajas = 0; this.umbral = a + Math.floor(Math.random() * (b - a + 1));
  }

  alMorir({ tipo, pos }) {
    if (!this.ctx.partida?.jugando) return;
    this.bajas++;
    const toca = this.bajas >= this.umbral;
    if (toca) this.reiniciarContador();
    if ((toca || tipo === 'coloso') && this.activas.length < MAX_CAJAS)
      this.crear({ x: pos.x + 0.45, z: pos.z - 0.3 });            // un poco al lado (por si cae también un botiquín)
  }

  crear(pos) {
    const g = new THREE.Group();
    const m = this.fabrica.cajaMunicion(); m.scale.setScalar(2); m.position.y = 0.05;
    g.add(m);
    const halo = new THREE.Mesh(this.geoHalo, this.matHalo); halo.position.y = 0.03; g.add(halo);
    g.position.set(pos.x, this.ctx.colisiones.alturaSuelo(pos.x, pos.z, 0.25, 2), pos.z);
    g.rotation.y = Math.random() * Math.PI * 2;
    this.ctx.escena.add(g);
    const c = { g, m, pos: g.position, vida: CAJA_MUNICION.vida, t: Math.random() * 6 };
    this.activas.push(c);
    return c;
  }

  quitar(c) { this.ctx.escena.remove(c.g); this.activas.splice(this.activas.indexOf(c), 1); }
  limpiar() { while (this.activas.length) this.quitar(this.activas[0]); this.reiniciarContador(); }

  /** Reparte la munición de una caja. Devuelve el texto del aviso o null si no cabía nada. */
  repartir() {
    const A = this.ctx.armas, actual = A.actual?.def.id;
    let principal = 0; const otras = [];
    for (const [id, e] of Object.entries(A.inventario)) {
      const def = ARMAS[id], base = CAJA_MUNICION.balas[id] ?? def.cargador;
      const cant = Math.min(id === actual ? base : Math.ceil(base * CAJA_MUNICION.otras), def.reservaMax - e.reserva);
      if (cant <= 0) continue;
      e.reserva += cant;
      if (id === actual) principal = cant; else otras.push(def.corto);
    }
    if (!principal && !otras.length) return null;
    const nombre = ARMAS[actual]?.corto || '';
    return principal ? `+${principal} BALAS ${nombre.toUpperCase()}${otras.length ? ' · y para ' + otras.join(', ') : ''}` : `MUNICIÓN para ${otras.join(', ')}`;
  }

  /** Al superar una oleada: 2 cargadores para cada arma que llevas. */
  reabastecer() {
    let algo = false;
    for (const [id, e] of Object.entries(this.ctx.armas.inventario)) {
      const def = ARMAS[id], cant = Math.min(Math.max(def.cargador, 8) * CAJA_MUNICION.oleada, def.reservaMax - e.reserva);
      if (cant > 0) { e.reserva += cant; algo = true; }
    }
    if (algo) this.ctx.eventos.emit('municion:recogida', { texto: 'REABASTECIMIENTO: munición para todas tus armas' });
  }

  actualizar(dt) {
    const j = this.ctx.jugador;
    for (let i = this.activas.length - 1; i >= 0; i--) {
      const c = this.activas[i];
      c.t += dt; c.vida -= dt;
      c.m.rotation.y += dt * 1.2;
      c.m.position.y = 0.05 + Math.max(0, Math.sin(c.t * 2.6)) * 0.05;
      c.g.visible = c.vida > 6 || Math.sin(c.vida * 14) > -0.2;
      if (c.vida <= 0) { this.quitar(c); continue; }
      if (!j.vivo) continue;
      if (Math.hypot(j.pos.x - c.pos.x, j.pos.z - c.pos.z) < 1.8 && Math.abs(j.pos.y - c.pos.y) < 1.2) {
        const texto = this.repartir();
        if (texto) {
          this.ctx.audio.reproducir('cargador_dentro', { bus: 'interfaz', vol: 0.8, reverb: 0 });
          this.ctx.audio.reproducir('recoger', { bus: 'interfaz', vol: 0.5, reverb: 0 });
          this.ctx.eventos.emit('municion:recogida', { texto });
          this.quitar(c);
        } else if (!c.avisado) { c.avisado = true; this.ctx.interfaz.notificar('Munición al máximo'); }
      } else c.avisado = false;
    }
  }
}
