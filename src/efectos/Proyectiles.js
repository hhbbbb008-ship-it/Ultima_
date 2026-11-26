import * as THREE from 'three';

/**
 * Proyectiles de ácido del Escupidor: trayectoria balística, estela de
 * partículas, daño por salpicadura y charco corrosivo al impactar.
 */
const G = 9.8;

export class Proyectiles {
  constructor(ctx) {
    this.ctx = ctx;
    this.reserva = [];
    this.activos = [];
    const geo = new THREE.SphereGeometry(0.11, 10, 8);
    this.mat = new THREE.MeshBasicMaterial({ color: 0x9dff40 });
    this.matHalo = new THREE.MeshBasicMaterial({ color: 0x5aff10, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(geo, this.mat);
      const halo = new THREE.Mesh(geo, this.matHalo); halo.scale.setScalar(2.2); m.add(halo);
      m.visible = false; ctx.escena.add(m);
      this.reserva.push({ m, v: new THREE.Vector3(), dano: 0, vida: 0, estela: 0 });
    }
    this._o = new THREE.Vector3(); this._d = new THREE.Vector3();
  }

  /** Lanza un proyectil que cae sobre 'objetivo' (tiempo de vuelo según la distancia). */
  lanzar(origen, objetivo, dano) {
    const p = this.reserva.pop(); if (!p) return;
    const dist = origen.distanceTo(objetivo);
    const t = Math.max(0.5, dist / 13);
    p.v.set((objetivo.x - origen.x) / t, (objetivo.y - origen.y) / t + 0.5 * G * t, (objetivo.z - origen.z) / t);
    p.m.position.copy(origen); p.m.visible = true;
    p.dano = dano; p.vida = 4;
    this.activos.push(p);
  }

  actualizar(dt) {
    const ctx = this.ctx, j = ctx.jugador;
    for (let i = this.activos.length - 1; i >= 0; i--) {
      const p = this.activos[i], m = p.m;
      p.v.y -= G * dt;
      const paso = p.v.length() * dt;
      this._d.copy(p.v).normalize();
      const h = ctx.colisiones.rayo(m.position, this._d, paso + 0.1);
      m.position.addScaledVector(p.v, dt);
      p.vida -= dt;
      p.estela += dt;
      if (p.estela > 0.02) { p.estela = 0; ctx.particulas.emitir('acidoEstela', m.position, null, 1); }
      let tocaJugador = false;
      for (const o of (p.dano > 0 ? ctx.zombis.objetivos() : [j])) {
        const djx = o.pos.x - m.position.x, djy = o.pos.y + 1.0 - m.position.y, djz = o.pos.z - m.position.z;
        if (djx * djx + djy * djy * 0.4 + djz * djz < 0.5) { tocaJugador = true; break; }
      }
      if (h || tocaJugador || p.vida <= 0 || m.position.y < 0) {
        const pos = h ? new THREE.Vector3(h.x, h.y, h.z) : m.position.clone();
        this.impacto(pos, p.dano);
        m.visible = false;
        this.activos.splice(i, 1); this.reserva.push(p);
      }
    }
  }

  impacto(pos, dano) {
    const ctx = this.ctx, j = ctx.jugador;
    ctx.particulas.emitir('acido', pos, { x: 0, y: 1, z: 0 }, 1.5);
    ctx.audio.reproducir('acido_impacto', { pos, vol: 0.8, ref: 3 });
    // dano 0: proyectil solo visual (cliente de sala; el daño lo decide el anfitrión)
    if (dano > 0) for (const o of ctx.zombis.objetivos()) {
      const d = Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z, (o.pos.y + 1) - pos.y);
      if (d < 1.8) o.recibirDano(dano * (1 - d / 2.4), pos, 'escupitajo');
    }
    const suelo = ctx.colisiones.alturaSuelo(pos.x, pos.z, 0.2, pos.y + 0.3);
    if (pos.y - suelo < 1.2) ctx.calcas.charcoAcido({ x: pos.x, z: pos.z }, 1.3, 11, 5);
  }

  limpiar() { for (const p of this.activos) { p.m.visible = false; this.reserva.push(p); } this.activos = []; }
}
