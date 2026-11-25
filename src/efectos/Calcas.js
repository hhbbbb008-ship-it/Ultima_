import * as THREE from 'three';

/**
 * Calcas (decals) con reserva circular: salpicaduras de sangre, agujeros de bala
 * y charcos de ácido. Al llegar al límite se reutiliza la más antigua.
 */
const CAP_SANGRE = [16, 36, 70, 140, 240];
const CAP_AGUJEROS = [10, 24, 48, 96, 180];

export class Calcas {
  constructor(ctx) {
    this.ctx = ctx;
    this.grupo = new THREE.Group(); this.grupo.name = 'calcas';
    ctx.escena.add(this.grupo);
    const rec = ctx.recursos;
    const base = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 };
    this.matSangre = new THREE.MeshStandardMaterial({ ...base, map: rec.textura('sangre'), roughness: 0.25, metalness: 0.1, color: 0xaa8888 });
    this.matAgujero = new THREE.MeshStandardMaterial({ ...base, map: rec.textura('agujero'), roughness: 0.9 });
    this.matQuemado = new THREE.MeshStandardMaterial({ ...base, map: rec.textura('agujero'), roughness: 1, color: 0x2a2622, opacity: 0.9 });
    this.quemaduras = []; this.iQuemadura = 0;
    this.matAcido = new THREE.MeshBasicMaterial({ ...base, map: rec.textura('acido'), blending: THREE.AdditiveBlending, color: 0x88ff55 });
    // 4 geometrías de sangre, una por celda del atlas 2x2
    this.geoSangre = [0, 1, 2, 3].map(v => {
      const g = new THREE.PlaneGeometry(1, 1); const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + (v % 2)) / 2, (uv.getY(i) + Math.floor(v / 2)) / 2);
      return g;
    });
    this.geoPlano = new THREE.PlaneGeometry(1, 1);
    this.sangre = []; this.iSangre = 0;
    this.agujeros = []; this.iAgujero = 0;
    this.acidos = [];
    this.configurar(2);
    this._v = new THREE.Vector3();
  }

  configurar(nivel) {
    this.capSangre = CAP_SANGRE[nivel];
    this.capAgujeros = CAP_AGUJEROS[nivel];
    for (const [lista, cap] of [[this.sangre, this.capSangre], [this.agujeros, this.capAgujeros]])
      while (lista.length > cap) this.grupo.remove(lista.pop());
    this.iSangre %= Math.max(1, this.capSangre); this.iAgujero %= Math.max(1, this.capAgujeros);
  }

  colocar(m, pos, normal, tam) {
    m.position.set(pos.x + normal.x * 0.012, pos.y + normal.y * 0.012 + Math.random() * 0.002, pos.z + normal.z * 0.012);
    m.lookAt(this._v.set(pos.x + normal.x, pos.y + normal.y, pos.z + normal.z));
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.set(tam, tam, 1);
    m.visible = true;
  }

  manchaSangre(pos, normal, tam = 1) {
    if (!this.ctx.ajustes.gen.gore) return;
    let m;
    if (this.sangre.length < this.capSangre) {
      m = new THREE.Mesh(this.geoSangre[this.sangre.length % 4], this.matSangre);
      m.renderOrder = 2; this.sangre.push(m); this.grupo.add(m);
    } else { m = this.sangre[this.iSangre]; this.iSangre = (this.iSangre + 1) % this.capSangre; }
    this.colocar(m, pos, normal, tam * (0.6 + Math.random() * 0.8));
  }

  /** Marca chamuscada de una explosión (reserva circular de 12). */
  quemadura(pos, tam = 3.2) {
    let m;
    if (this.quemaduras.length < 12) { m = new THREE.Mesh(this.geoPlano, this.matQuemado); m.renderOrder = 1; this.quemaduras.push(m); this.grupo.add(m); }
    else { m = this.quemaduras[this.iQuemadura]; this.iQuemadura = (this.iQuemadura + 1) % 12; }
    this.colocar(m, pos, { x: 0, y: 1, z: 0 }, tam);
  }

  agujero(pos, normal) {
    let m;
    if (this.agujeros.length < this.capAgujeros) {
      m = new THREE.Mesh(this.geoPlano, this.matAgujero);
      m.renderOrder = 2; this.agujeros.push(m); this.grupo.add(m);
    } else { m = this.agujeros[this.iAgujero]; this.iAgujero = (this.iAgujero + 1) % this.capAgujeros; }
    this.colocar(m, pos, normal, 0.09 + Math.random() * 0.04);
  }

  /** Charco de ácido: daña al jugador mientras está encima y se desvanece. */
  charcoAcido(pos, radio, dps, duracion) {
    const m = new THREE.Mesh(this.geoPlano, this.matAcido.clone());
    this.colocar(m, { x: pos.x, y: 0.03, z: pos.z }, { x: 0, y: 1, z: 0 }, radio * 2.2);
    m.renderOrder = 3;
    this.grupo.add(m);
    this.acidos.push({ m, x: pos.x, z: pos.z, radio, dps, vida: duracion, max: duracion, emitir: 0 });
  }

  actualizar(dt, jugador) {
    for (let i = this.acidos.length - 1; i >= 0; i--) {
      const a = this.acidos[i];
      a.vida -= dt;
      a.m.material.opacity = Math.min(1, a.vida / 1.2) * (0.75 + 0.25 * Math.sin(a.vida * 9));
      a.emitir += dt;
      if (a.emitir > 0.15) { a.emitir = 0; this.ctx.particulas.emitir('vapor', { x: a.x + (Math.random() - 0.5) * a.radio, y: 0.05, z: a.z + (Math.random() - 0.5) * a.radio }); }
      if (jugador && jugador.vivo && jugador.enSuelo && Math.hypot(jugador.pos.x - a.x, jugador.pos.z - a.z) < a.radio)
        jugador.recibirDano(a.dps * dt, null, 'acido');
      if (a.vida <= 0) { this.grupo.remove(a.m); a.m.material.dispose(); this.acidos.splice(i, 1); }
    }
  }

  limpiar() {
    for (const m of [...this.sangre, ...this.agujeros, ...this.quemaduras]) m.visible = false;
    for (const a of this.acidos) { this.grupo.remove(a.m); a.m.material.dispose(); }
    this.acidos = [];
  }
}
