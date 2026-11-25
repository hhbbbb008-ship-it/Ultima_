import * as THREE from 'three';
import { ConstructorArmas } from '../armas/ModelosArmas.js';

/**
 * Granadas y bebidas energéticas que sueltan los zombis al morir.
 * - Cae un suministro cada 7-11 bajas (media: 1 de cada 9): granada o bebida, al azar.
 * - El Coloso siempre suelta una granada y una bebida.
 * - Se recogen pasando por encima si no llevas el máximo (4 granadas, 3 bebidas).
 *   Si vas lleno, se queda en el suelo.
 * - Desaparecen a los 40 s (parpadean los últimos 6). Como mucho hay 8 a la vez.
 */
export const SUMINISTRO_CAIDA = { cada: [7, 11], vida: 40, max: 8 };

const TIPOS = {
  granada: { halo: 0x8cff5a, texto: '+1 GRANADA', campo: 'granadas', max: 'granadasMax', lleno: 'Granadas al máximo' },
  bebida: { halo: 0x3ad8ff, texto: '+1 BEBIDA ENERGÉTICA', campo: 'bebidas', max: 'bebidasMax', lleno: 'Bebidas al máximo' },
};

export class Suministros {
  constructor(ctx) {
    this.ctx = ctx;
    this.activos = [];
    this.fabrica = new ConstructorArmas(ctx.recursos);
    this.geoHalo = new THREE.RingGeometry(0.22, 0.42, 24).rotateX(-Math.PI / 2);
    this.matHalo = {};
    for (const [k, t] of Object.entries(TIPOS))
      this.matHalo[k] = new THREE.MeshBasicMaterial({ color: t.halo, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.reiniciarContador();
    ctx.eventos.on('zombi:muerto', d => this.alMorir(d));
  }

  reiniciarContador() {
    const [a, b] = SUMINISTRO_CAIDA.cada;
    this.bajas = 0; this.umbral = a + Math.floor(Math.random() * (b - a + 1));
  }

  alMorir({ tipo, pos }) {
    if (!this.ctx.partida?.jugando) return;
    if (tipo === 'coloso') {
      this.crear('granada', { x: pos.x - 0.5, z: pos.z + 0.35 });
      this.crear('bebida', { x: pos.x - 0.1, z: pos.z + 0.6 });
      return;
    }
    if (++this.bajas < this.umbral) return;
    this.reiniciarContador();
    // un poco al otro lado que la caja de munición, por si caen juntas
    this.crear(Math.random() < 0.5 ? 'granada' : 'bebida', { x: pos.x - 0.45, z: pos.z + 0.3 });
  }

  crear(tipo, pos) {
    if (this.activos.length >= SUMINISTRO_CAIDA.max) return null;
    const g = new THREE.Group();
    const m = tipo === 'granada' ? this.fabrica.granada(false) : this.fabrica.lataBebida();
    m.scale.setScalar(tipo === 'granada' ? 3.2 : 2.4); m.position.y = tipo === 'granada' ? 0.3 : 0.05;
    g.add(m);
    const halo = new THREE.Mesh(this.geoHalo, this.matHalo[tipo]); halo.position.y = 0.03; g.add(halo);
    g.position.set(pos.x, this.ctx.colisiones.alturaSuelo(pos.x, pos.z, 0.25, 2), pos.z);
    this.ctx.escena.add(g);
    const s = { tipo, g, m, pos: g.position, vida: SUMINISTRO_CAIDA.vida, t: Math.random() * 6, y0: m.position.y };
    this.activos.push(s);
    return s;
  }

  quitar(s) { this.ctx.escena.remove(s.g); this.activos.splice(this.activos.indexOf(s), 1); }
  limpiar() { while (this.activos.length) this.quitar(this.activos[0]); this.reiniciarContador(); }

  actualizar(dt) {
    const j = this.ctx.jugador;
    for (let i = this.activos.length - 1; i >= 0; i--) {
      const s = this.activos[i];
      s.t += dt; s.vida -= dt;
      s.m.rotation.y += dt * 1.4;
      s.m.position.y = s.y0 + Math.max(0, Math.sin(s.t * 2.6)) * 0.06;
      s.g.visible = s.vida > 6 || Math.sin(s.vida * 14) > -0.2;
      if (s.vida <= 0) { this.quitar(s); continue; }
      if (!j.vivo) continue;
      if (Math.hypot(j.pos.x - s.pos.x, j.pos.z - s.pos.z) < 1.6 && Math.abs(j.pos.y - s.pos.y) < 1.2) {
        const T = TIPOS[s.tipo];
        if (j[T.campo] < j[T.max]) {
          j[T.campo]++;
          this.ctx.audio.reproducir('recoger', { bus: 'interfaz', vol: 0.6, reverb: 0 });
          this.ctx.eventos.emit('municion:recogida', { texto: T.texto });
          this.quitar(s);
        } else if (!s.avisado) { s.avisado = true; this.ctx.interfaz.notificar(T.lleno); }
      } else s.avisado = false;
    }
  }
}
