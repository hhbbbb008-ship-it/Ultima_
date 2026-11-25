/**
 * Navegación por campo de flujo (flow field).
 * Una rejilla de 1 m marca las celdas bloqueadas por obstáculos (inflados por
 * el radio de un zombi). Desde la celda del jugador se calcula la distancia
 * (Dijkstra con 8 vecinos) a todas las celdas; cada zombi solo tiene que
 * moverse hacia la vecina con menor coste. Así cientos de zombis comparten
 * un único cálculo de rutas y rodean edificios y coches sin atascarse.
 */
const INF = 1e9;

export class Navegacion {
  constructor(colisiones, limite = 48, celda = 1) {
    this.lim = limite; this.cel = celda;
    this.n = Math.round(limite * 2 / celda);
    this.bloq = new Uint8Array(this.n * this.n);
    this.dist = new Float32Array(this.n * this.n).fill(INF);
    this.heap = new Int32Array(this.n * this.n * 4); this.heapP = new Float32Array(this.n * this.n * 4);
    this.objetivoCelda = -1; this.temporizador = 0;
    this.construir(colisiones);
  }

  construir(col) {
    const n = this.n, inflado = 0.32;
    for (const c of col.cajas) {
      if (c.soloJugador || c.max.y < 0.5 || c.min.y > 1.6) continue;   // bordillos y techos no bloquean
      const x0 = Math.floor((c.min.x - inflado + this.lim) / this.cel), x1 = Math.floor((c.max.x + inflado + this.lim) / this.cel);
      const z0 = Math.floor((c.min.z - inflado + this.lim) / this.cel), z1 = Math.floor((c.max.z + inflado + this.lim) / this.cel);
      for (let x = Math.max(0, x0); x <= Math.min(n - 1, x1); x++)
        for (let z = Math.max(0, z0); z <= Math.min(n - 1, z1); z++) this.bloq[z * n + x] = 1;
    }
  }

  celda(x, z) {
    const cx = Math.floor((x + this.lim) / this.cel), cz = Math.floor((z + this.lim) / this.cel);
    if (cx < 0 || cz < 0 || cx >= this.n || cz >= this.n) return -1;
    return cz * this.n + cx;
  }

  /** Recalcula el campo si el jugador cambió de celda (como mucho cada 0,25 s). */
  actualizar(dt, pos) {
    this.temporizador -= dt;
    let c = this.celda(pos.x, pos.z);
    if (c < 0) return;
    if (this.bloq[c]) c = this.libreCercana(c);
    if (c === this.objetivoCelda || this.temporizador > 0) return;
    this.objetivoCelda = c; this.temporizador = 0.25;
    this.dijkstra(c);
  }

  libreCercana(c) {
    const n = this.n, cx = c % n, cz = (c / n) | 0;
    for (let r = 1; r < 4; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, z = cz + dz;
      if (x >= 0 && z >= 0 && x < n && z < n && !this.bloq[z * n + x]) return z * n + x;
    }
    return c;
  }

  dijkstra(origen) {
    const n = this.n, D = this.dist, B = this.bloq, H = this.heap, P = this.heapP;
    D.fill(INF);
    let tam = 0;
    const push = (i, p) => { let k = tam++; while (k > 0) { const pa = (k - 1) >> 1; if (P[pa] <= p) break; H[k] = H[pa]; P[k] = P[pa]; k = pa; } H[k] = i; P[k] = p; };
    const pop = () => {
      const r = H[0], ul = H[--tam], up = P[tam]; let k = 0;
      while (true) { let h = 2 * k + 1; if (h >= tam) break; if (h + 1 < tam && P[h + 1] < P[h]) h++; if (P[h] >= up) break; H[k] = H[h]; P[k] = P[h]; k = h; }
      H[k] = ul; P[k] = up; return r;
    };
    D[origen] = 0; push(origen, 0);
    while (tam > 0) {
      const p0 = P[0], i = pop();
      if (p0 > D[i]) continue;
      const x = i % n, z = (i / n) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const j = nz * n + nx;
        if (B[j]) continue;
        if (dx && dz && (B[z * n + nx] || B[nz * n + x])) continue;    // sin cortar esquinas
        const nd = D[i] + (dx && dz ? 1.4142 : 1);
        if (nd < D[j]) { D[j] = nd; push(j, nd); }
      }
    }
  }

  /** Dirección (x, z) recomendada desde una posición. Devuelve false si no hay ruta. */
  direccion(x, z, out) {
    const n = this.n;
    let c = this.celda(x, z);
    if (c < 0) { out.x = -x; out.z = -z; const l = Math.hypot(out.x, out.z) || 1; out.x /= l; out.z /= l; return true; }
    const cx = c % n, cz = (c / n) | 0;
    let mejor = this.bloq[c] ? INF : this.dist[c], bx = 0, bz = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const j = nz * n + nx;
      if (this.bloq[j]) continue;
      if (dx && dz && (this.bloq[cz * n + nx] || this.bloq[nz * n + cx])) continue;
      if (this.dist[j] < mejor) { mejor = this.dist[j]; bx = dx; bz = dz; }
    }
    if (!bx && !bz) return false;
    // apunta al centro de la celda elegida (suaviza el recorrido)
    const tx = (cx + bx + 0.5) * this.cel - this.lim, tz = (cz + bz + 0.5) * this.cel - this.lim;
    out.x = tx - x; out.z = tz - z;
    const l = Math.hypot(out.x, out.z) || 1; out.x /= l; out.z /= l;
    return true;
  }

  /** Línea libre en la rejilla (para decidir si ir en línea recta hacia el jugador). */
  lineaLibre(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), pasos = Math.ceil(d / (this.cel * 0.5));
    for (let i = 1; i < pasos; i++) {
      const t = i / pasos, c = this.celda(ax + (bx - ax) * t, az + (bz - az) * t);
      if (c >= 0 && this.bloq[c]) return false;
    }
    return true;
  }
}
