/**
 * Sistema de colisiones del mundo estático.
 * - Cajas AABB indexadas en una rejilla espacial (consultas rápidas).
 * - Cuerpos cilíndricos (jugador y zombis) empujados fuera de las cajas.
 * - Altura del suelo (permite subir bordillos y saltar sobre cajas bajas).
 * - Rayos contra cajas y el plano del suelo (disparos, línea de visión).
 */
const CELDA = 4;

export class Colisiones {
  constructor() {
    this.cajas = [];
    this.rejilla = new Map();
    this.marca = 0;            // para no repetir cajas en una misma consulta
  }

  /** Vacía todas las cajas (al cambiar de mapa). */
  limpiar() { this.cajas = []; this.rejilla = new Map(); this.marca = 0; }

  /**
   * Añade una caja. opciones.soloJugador: solo bloquea al jugador (límites del mapa).
   * opciones.superficie: 'hormigon' | 'metal' | 'madera' | 'tierra' (para efectos de impacto)
   */
  agregar(minX, minY, minZ, maxX, maxY, maxZ, opciones = {}) {
    const c = {
      min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ },
      soloJugador: !!opciones.soloJugador, superficie: opciones.superficie || 'hormigon',
      bloqueaVista: opciones.bloqueaVista !== false, _m: 0,
    };
    this.cajas.push(c);
    for (let ix = Math.floor(minX / CELDA); ix <= Math.floor(maxX / CELDA); ix++)
      for (let iz = Math.floor(minZ / CELDA); iz <= Math.floor(maxZ / CELDA); iz++) {
        const k = ix * 10007 + iz;
        if (!this.rejilla.has(k)) this.rejilla.set(k, []);
        this.rejilla.get(k).push(c);
      }
    return c;
  }

  /** Caja centrada (utilidad). */
  agregarCentro(x, y, z, sx, sy, sz, opciones) {
    return this.agregar(x - sx / 2, y, z - sz / 2, x + sx / 2, y + sy, z + sz / 2, opciones);
  }

  /** Cajas cuyo rectángulo XZ toca el rectángulo dado. */
  consultar(minX, minZ, maxX, maxZ, salida = []) {
    salida.length = 0;
    const m = ++this.marca;
    for (let ix = Math.floor(minX / CELDA); ix <= Math.floor(maxX / CELDA); ix++)
      for (let iz = Math.floor(minZ / CELDA); iz <= Math.floor(maxZ / CELDA); iz++) {
        const lista = this.rejilla.get(ix * 10007 + iz);
        if (!lista) continue;
        for (const c of lista) if (c._m !== m) { c._m = m; salida.push(c); }
      }
    return salida;
  }

  /**
   * Empuja un cilindro (pies en p.y) fuera de las cajas que lo intersecan.
   * Devuelve true si hubo contacto. 'paso' es la altura que se puede subir sin chocar.
   */
  resolverCilindro(p, radio, altura, esJugador, paso = 0.45) {
    const lista = this.consultar(p.x - radio, p.z - radio, p.x + radio, p.z + radio, this._tmp || (this._tmp = []));
    let contacto = false;
    for (let it = 0; it < 2; it++) {
      for (const c of lista) {
        if (c.soloJugador && !esJugador) continue;
        if (c.max.y <= p.y + paso || c.min.y >= p.y + altura) continue;
        const cx = Math.max(c.min.x, Math.min(p.x, c.max.x));
        const cz = Math.max(c.min.z, Math.min(p.z, c.max.z));
        let dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radio * radio) continue;
        contacto = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), emp = radio - d;
          p.x += dx / d * emp; p.z += dz / d * emp;
        } else {
          // centro dentro de la caja: salir por el lado de menor penetración
          const izq = p.x - c.min.x, der = c.max.x - p.x, fon = p.z - c.min.z, fre = c.max.z - p.z;
          const m = Math.min(izq, der, fon, fre);
          if (m === izq) p.x = c.min.x - radio; else if (m === der) p.x = c.max.x + radio;
          else if (m === fon) p.z = c.min.z - radio; else p.z = c.max.z + radio;
        }
      }
    }
    return contacto;
  }

  /** Altura del suelo bajo un cilindro: la cara superior más alta alcanzable. */
  alturaSuelo(x, z, radio, yPies, paso = 0.45) {
    const lista = this.consultar(x - radio, z - radio, x + radio, z + radio, this._tmp2 || (this._tmp2 = []));
    let h = 0;
    const r = radio * 0.7;
    for (const c of lista) {
      if (c.soloJugador) continue;
      if (c.max.y > yPies + paso || c.max.y <= h) continue;
      if (x + r < c.min.x || x - r > c.max.x || z + r < c.min.z || z - r > c.max.z) continue;
      h = c.max.y;
    }
    return h;
  }

  /**
   * Rayo contra cajas y suelo. dir debe estar normalizada.
   * Devuelve { dist, x, y, z, nx, ny, nz, superficie } o null.
   */
  rayo(o, d, max, incluirSoloJugador = false) {
    let mejor = max, res = null;
    // recorre la rejilla en una caja envolvente del rayo (rayos cortos en este juego)
    const ex = o.x + d.x * max, ez = o.z + d.z * max;
    const lista = this.consultar(Math.min(o.x, ex), Math.min(o.z, ez), Math.max(o.x, ex), Math.max(o.z, ez), this._tmp3 || (this._tmp3 = []));
    for (const c of lista) {
      if (c.soloJugador && !incluirSoloJugador) continue;
      let tmin = 0, tmax = mejor, eje = -1, signo = 0;
      let ok = true;
      for (let a = 0; a < 3 && ok; a++) {
        const k = a === 0 ? 'x' : a === 1 ? 'y' : 'z';
        const od = o[k], dd = d[k];
        if (Math.abs(dd) < 1e-9) { if (od < c.min[k] || od > c.max[k]) ok = false; continue; }
        let t1 = (c.min[k] - od) / dd, t2 = (c.max[k] - od) / dd, s = -1;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
        if (t1 > tmin) { tmin = t1; eje = a; signo = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) ok = false;
      }
      if (ok && eje >= 0 && tmin < mejor) {
        mejor = tmin;
        res = { dist: tmin, nx: eje === 0 ? signo : 0, ny: eje === 1 ? signo : 0, nz: eje === 2 ? signo : 0, superficie: c.superficie };
      }
    }
    if (d.y < -1e-6) {                              // plano del suelo
      const t = -o.y / d.y;
      if (t > 0 && t < mejor) { mejor = t; res = { dist: t, nx: 0, ny: 1, nz: 0, superficie: 'suelo' }; }
    }
    if (res) { res.x = o.x + d.x * res.dist; res.y = o.y + d.y * res.dist; res.z = o.z + d.z * res.dist; }
    return res;
  }

  /** ¿Hay línea de visión libre entre dos puntos? */
  lineaVista(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const L = Math.hypot(dx, dy, dz);
    if (L < 1e-4) return true;
    const h = this.rayo(a, { x: dx / L, y: dy / L, z: dz / L }, L);
    return !h || h.dist >= L - 0.05;
  }
}
