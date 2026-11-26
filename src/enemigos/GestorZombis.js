import * as THREE from 'three';
import { Zombi } from './Zombi.js';
import { mallasDe } from './ModeloZombi.js';
import { Navegacion } from './Navegacion.js';
import { TIPOS } from './TiposZombi.js';

/**
 * Gestor de zombis: reserva de objetos (pooling) por tipo, actualización,
 * rejilla espacial para vecinos, frustum para el LOD de animación y
 * consultas de impacto (rayos contra cabeza/torso/piernas).
 */
const LOD_BASE = [9, 20, 38];
const FACTOR_LOD = [0.55, 0.75, 1, 1.35, 1.9];
const LOD_MAX = [0, 1, 2, 2, 3];
const CELDA = 2;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _s = new THREE.Sphere();

function rayoEsfera(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return -1;
  return -b - Math.sqrt(h);
}
/** Intersección rayo-cápsula (segmento pa-pb con radio r). */
function rayoCapsula(o, d, pa, pb, r) {
  const bax = pb.x - pa.x, bay = pb.y - pa.y, baz = pb.z - pa.z;
  const oax = o.x - pa.x, oay = o.y - pa.y, oaz = o.z - pa.z;
  const baba = bax * bax + bay * bay + baz * baz, bard = bax * d.x + bay * d.y + baz * d.z;
  const baoa = bax * oax + bay * oay + baz * oaz, rdoa = d.x * oax + d.y * oay + d.z * oaz;
  const oaoa = oax * oax + oay * oay + oaz * oaz;
  const a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - r * r * baba;
  let h = b * b - a * c;
  if (h >= 0 && a > 1e-9) {
    const t = (-b - Math.sqrt(h)) / a, y = baoa + t * bard;
    if (y > 0 && y < baba) return t;
    const ocx = y <= 0 ? oax : o.x - pb.x, ocy = y <= 0 ? oay : o.y - pb.y, ocz = y <= 0 ? oaz : o.z - pb.z;
    const b2 = d.x * ocx + d.y * ocy + d.z * ocz, c2 = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
    h = b2 * b2 - c2;
    if (h > 0) return -b2 - Math.sqrt(h);
  }
  return -1;
}

export class GestorZombis {
  constructor(ctx) {
    this.ctx = ctx;
    this.nav = new Navegacion(ctx.colisiones);
    this.reserva = Object.fromEntries(Object.keys(TIPOS).map(t => [t, []]));
    this.todos = [];
    this.activos = [];
    this.hash = new Map();
    this.frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this.cuadro = 0;
    this.detalle = 2;
    this.sigId = 0;
    this.maxEnSala = 60;             // tope de zombis vivos a la vez en una sala (carga del anfitrión y de la red)
    this.porId = new Map();          // id estable (lo asigna el anfitrión en sala) → zombi
    const self = this;
    this.info = {
      detalle: 2,
      lodPara(d) { const f = FACTOR_LOD[self.detalle]; const l = d < LOD_BASE[0] * f ? 3 : d < LOD_BASE[1] * f ? 2 : d < LOD_BASE[2] * f ? 1 : 0; return Math.min(l, LOD_MAX[self.detalle]); },
      enCamara(z) { _s.center.set(z.pos.x, z.pos.y + 1 * z.def.escala, z.pos.z); _s.radius = 1.3 * z.def.escala; return self.frustum.intersectsSphere(_s); },
    };
    // precreación: evita tirones al crear modelos en mitad de la partida
    const precrear = { caminante: 12, corredor: 6, acorazado: 3, escupidor: 3, coloso: 1 };
    for (const [t, n] of Object.entries(precrear)) for (let i = 0; i < n; i++) { const z = new Zombi(this, t); this.todos.push(z); this.reserva[t].push(z); }
  }

  configurar(detalle) {
    this.detalle = detalle; this.info.detalle = detalle;
    for (const z of this.todos) z.lod = -1;
  }

  /** Raíces de todos los zombis (incluidos los de reserva) para reconstruir materiales. */
  raices() { return this.todos.flatMap(z => [z.raiz, ...mallasDe(z.modelo)]); }

  aparecer(tipo, pos, mods, id = ++this.sigId) {
    let z = this.reserva[tipo].pop();
    if (!z) { z = new Zombi(this, tipo); this.todos.push(z); }
    z.activar(pos, mods);
    z.id = id; z.replica = false; z.autor = null; z.obj = this.ctx.jugador;
    this.porId.set(id, z);
    this.activos.push(z);
    return z;
  }

  /** Cliente de sala: zombi controlado por el anfitrión (sin IA). */
  crearReplica(id, tipo, pos) {
    const z = this.aparecer(tipo, pos, { vida: 1, dano: 1, vel: 1 }, id);
    z.replica = true; z.objX = pos.x; z.objZ = pos.z; z.objYaw = z.yaw;
    return z;
  }

  /** Jugadores a los que pueden atacar los zombis de este equipo (en sala, el anfitrión incluye a los remotos). */
  objetivos() {
    const l = this._obj || (this._obj = []);
    l.length = 0; l.push(this.ctx.jugador);
    const P = this.ctx.partida;
    if (P?.modoSala && this.ctx.red.esAnfitrion) for (const r of this.ctx.remotos.lista.values()) l.push(r.obj);
    return l;
  }

  /** Jugador vivo más cercano (si no queda ninguno vivo, el local). */
  objetivoPara(z) {
    const l = this.objetivos();
    if (l.length === 1) return l[0];
    let mejor = null, md = Infinity;
    for (const o of l) {
      if (!o.vivo) continue;
      const d = (o.pos.x - z.pos.x) ** 2 + (o.pos.z - z.pos.z) ** 2;
      if (d < md) { md = d; mejor = o; }
    }
    return mejor || this.ctx.jugador;
  }

  get esReplica() { const P = this.ctx.partida; return !!(P?.modoSala && this.ctx.red.activa && !this.ctx.red.esAnfitrion); }

  reciclar(z) {
    if (this.porId.get(z.id) === z) this.porId.delete(z.id);
    z.desactivar();
    const i = this.activos.indexOf(z);
    if (i >= 0) this.activos.splice(i, 1);
    this.reserva[z.tipo].push(z);
  }

  /** Zombi atascado lejos del jugador: reaparece en otro punto de entrada. */
  reubicar(z) {
    const p = this.ctx.oleadas.puntoAparicion();
    if (!p) return;
    z.pos.copy(p); z.atascoT = 0; z.estado = 'emerger'; z.t = 0;
  }

  contarVivos() { let n = 0; for (const z of this.activos) if (z.vivo) n++; return n; }

  actualizar(dt) {
    const ctx = this.ctx;
    this.cuadro++;
    const replica = this.esReplica;
    if (!replica) {
      // campo de flujo desde todos los jugadores vivos: cada zombi baja hacia el más cercano
      const pos = this._pos || (this._pos = []);
      pos.length = 0;
      for (const o of this.objetivos()) if (o.vivo) pos.push(o.pos);
      this.nav.actualizar(dt, pos.length ? pos : [ctx.jugador.pos]);
    }
    // rejilla espacial
    this.hash.clear();
    for (const z of this.activos) {
      if (!z.vivo) continue;
      const k = Math.floor(z.pos.x / CELDA) * 4099 + Math.floor(z.pos.z / CELDA);
      let l = this.hash.get(k); if (!l) this.hash.set(k, l = []); l.push(z);
    }
    const cam = ctx.camara;
    this._m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this._m);
    for (let i = this.activos.length - 1; i >= 0; i--) {
      const z = this.activos[i];
      if (!z) continue;
      if (z.replica) z.actualizarReplica(dt, this.info); else z.actualizar(dt, this.info);
    }
  }

  vecinos(x, z, r, salida = this._vec || (this._vec = [])) {
    salida.length = 0;
    for (let ix = Math.floor((x - r) / CELDA); ix <= Math.floor((x + r) / CELDA); ix++)
      for (let iz = Math.floor((z - r) / CELDA); iz <= Math.floor((z + r) / CELDA); iz++) {
        const l = this.hash.get(ix * 4099 + iz);
        if (l) for (const o of l) salida.push(o);
      }
    return salida;
  }

  /** Impactos de un rayo contra los zombis, ordenados por distancia (uno por zombi). */
  rayo(o, d, max) {
    const res = [];
    for (const z of this.activos) {
      if (!z.vivo) continue;
      const e = z.def.escala;
      // descarte rápido con esfera envolvente
      _c.set(z.pos.x, z.pos.y + 0.95 * e, z.pos.z);
      const tc = (_c.x - o.x) * d.x + (_c.y - o.y) * d.y + (_c.z - o.z) * d.z;
      if (tc < -1.5 * e || tc > max + 1.5 * e) continue;
      const px = o.x + d.x * tc - _c.x, py = o.y + d.y * tc - _c.y, pz = o.z + d.z * tc - _c.z;
      if (px * px + py * py + pz * pz > (1.3 * e) * (1.3 * e)) continue;
      if (z._mw !== this.cuadro) { z.raiz.updateMatrixWorld(true); z._mw = this.cuadro; }
      const H = z.h;
      let mejor = Infinity, parte = null;
      if (H.cabeza.visible) {
        H.cabeza.getWorldPosition(_a); _a.y += z.modelo.cabezaY * e;
        const t = rayoEsfera(o, d, _a, 0.15 * e);
        if (t > 0 && t < mejor) { mejor = t; parte = 'cabeza'; }
      }
      H.cadera.getWorldPosition(_a); H.cuello.getWorldPosition(_b);
      let t = rayoCapsula(o, d, _a, _b, (z.tipo === 'escupidor' ? 0.27 : z.def.delgado ? 0.19 : 0.23) * e);
      if (t > 0 && t < mejor) { mejor = t; parte = 'torso'; }
      for (const l of ['I', 'D']) {
        H['muslo' + l].getWorldPosition(_a); H['pie' + l].getWorldPosition(_b);
        t = rayoCapsula(o, d, _a, _b, 0.085 * e);
        if (t > 0 && t < mejor) { mejor = t; parte = 'piernas'; }
        H['brazo' + l].getWorldPosition(_a); H['mano' + l].getWorldPosition(_b);
        t = rayoCapsula(o, d, _a, _b, (z.tipo === 'coloso' && l === 'D' ? 0.13 : 0.06) * e);
        if (t > 0 && t < mejor) { mejor = t; parte = 'torso'; }
      }
      if (parte && mejor <= max) res.push({ zombi: z, parte, dist: mejor, punto: new THREE.Vector3(o.x + d.x * mejor, o.y + d.y * mejor, o.z + d.z * mejor) });
    }
    return res.sort((a, b) => a.dist - b.dist);
  }

  /** Zombi más cercano dentro de un cono frente al jugador (cuchillo). */
  cuerpoACuerpo(o, d, alcance, angulo) {
    let mejor = null, md = Infinity;
    const L = Math.hypot(d.x, d.z) || 1, fx = d.x / L, fz = d.z / L;
    for (const z of this.activos) {
      if (!z.vivo) continue;
      const dx = z.pos.x - o.x, dz = z.pos.z - o.z, dist = Math.hypot(dx, dz);
      if (dist > alcance + z.def.radio || dist >= md) continue;
      if (dist > 0.3 && (dx * fx + dz * fz) / dist < Math.cos(angulo)) continue;
      md = dist; mejor = z;
    }
    return mejor;
  }

  alertar(pos, radio) {
    for (const z of this.activos) if (z.vivo && !z.alerta && Math.hypot(z.pos.x - pos.x, z.pos.z - pos.z) < radio) z.alerta = true;
  }

  limpiar() { for (const z of [...this.activos]) this.reciclar(z); this.porId.clear(); this.sigId = 0; }
}
