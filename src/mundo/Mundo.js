import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { uvMundo } from '../motor/Recursos.js';
import { Cielo } from './Cielo.js';

/**
 * Escenario: constructor genérico de mapas.
 *
 * Cada mapa (src/mundo/mapas/*.js) describe su trazado usando las herramientas
 * de esta clase (cajas, edificios, coches, vallas, farolas, estaciones de compra…).
 * Toda la geometría estática se fusiona por sector (rejilla de 24 m) y material,
 * lo que reduce drásticamente las llamadas de dibujo y permite ocultar sectores
 * enteros por distancia (culling) además del frustum culling.
 *
 * Un mapa se puede descargar (destruir) y cargar otro en caliente.
 */

export const SECTOR = 24;           // tamaño de sector en metros

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export function matriz(x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  return new THREE.Matrix4().compose(V(x, y, z), q, V(sx, sy, sz));
}
export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Geometrías base reutilizables
export const G = {
  caja: new THREE.BoxGeometry(1, 1, 1),
  plano: new THREE.PlaneGeometry(1, 1),
  cil8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cil12: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  cil20: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
  esfera: new THREE.SphereGeometry(0.5, 10, 8),
  toro: new THREE.TorusGeometry(0.35, 0.14, 8, 16),
  dodeca: new THREE.DodecahedronGeometry(0.5, 0),
  cono: new THREE.ConeGeometry(0.5, 1, 12),
};

export class Mundo {
  constructor(ctx) {
    this.ctx = ctx;
    this.escena = ctx.escena;
    this.rec = ctx.recursos;
    this.cielo = new Cielo();
    this.escena.add(this.cielo.malla);
    this.crearBruma();
    this.raiz = null;
  }

  get col() { return this.ctx.colisiones; }

  // -------------------------------------------------------------------------
  // Carga / descarga de mapas
  // -------------------------------------------------------------------------
  /** Construye el mapa indicado (definición de src/mundo/mapas). */
  construir(def) {
    this.def = def;
    this.lim = def.limite || 48;
    this.raiz = new THREE.Group(); this.raiz.name = 'mundo';
    this.escena.add(this.raiz);
    this.lotes = new Map();
    this.sectores = new Map();       // id → { grupo, cx, cz, detalle: [grupos por nivel] }
    this.global = new THREE.Group(); this.raiz.add(this.global);
    this.candidatosLuz = [];         // farolas, focos y fuegos (los usa Iluminacion)
    this.fuegos = [];
    this.aparicion = [];             // puntos de aparición de zombis
    this.estaciones = [];            // puntos de compra en paredes
    this.puntosBotiquin = [];        // lugares donde aparecen botiquines
    this.charcos = [];
    this.rnd = mulberry32(def.semilla || 2024);
    def.construir(this);
    this.crearCharcos(def.charcos || []);
    this.fusionar();
    if (def.luna) this.cielo.uniforms.uLuna.value.set(...def.luna).normalize();
  }

  /** Descarga el mapa actual y libera su geometría. */
  destruir() {
    if (!this.raiz) return;
    if (this.reflector) { this.reflector.parent?.remove(this.reflector); this.reflector.dispose(); this.reflector = null; }
    this.raiz.traverse(o => { if (o.isMesh && o.geometry && !Object.values(G).includes(o.geometry)) o.geometry.dispose(); });
    this.escena.remove(this.raiz);
    this.geoCharcos?.dispose();
    this.raiz = null;
  }

  // -------------------------------------------------------------------------
  // Lotes de geometría estática
  // -------------------------------------------------------------------------
  agregar(geo, m4, mat, op = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m4);
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    if (op.uvPropia) { if (!g.attributes.uv) uvMundo(g, this.rec.tam(mat)); }
    else uvMundo(g, this.rec.tam(mat));
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(V());
    const L = this.lim;
    const sector = op.global ? 'global' : `${Math.floor((c.x + L * 2) / SECTOR)}_${Math.floor((c.z + L * 2) / SECTOR)}`;
    const clave = `${sector}|${mat}|${op.detalle || 0}|${op.sombra === false ? 0 : 1}|${op.recibe === false ? 0 : 1}`;
    if (!this.lotes.has(clave)) this.lotes.set(clave, []);
    this.lotes.get(clave).push(g);
  }

  /** Caja sólida: geometría + colisión opcional. */
  caja(x, y, z, sx, sy, sz, mat, op = {}) {
    this.agregar(G.caja, matriz(x, y + sy / 2, z, op.ry || 0, 0, 0, sx, sy, sz), mat, op);
    if (op.colision !== false) this.colisionGirada(x, y, z, sx, sy, sz, op.ry || 0, { superficie: op.superficie, bloqueaVista: op.bloqueaVista });
  }

  /** Colisión AABB que envuelve una caja girada en Y. */
  colisionGirada(x, y, z, sx, sy, sz, ry, op = {}) {
    if (ry && Math.abs(ry) > 0.01) {
      const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
      const ex = (sx * c + sz * s) / 2, ez = (sx * s + sz * c) / 2;
      this.col.agregar(x - ex, y, z - ez, x + ex, y + sy, z + ez, op);
    } else this.col.agregarCentro(x, y, z, sx, sy, sz, op);
  }

  fusionar() {
    const L = this.lim;
    for (const [clave, geos] of this.lotes) {
      const [sector, mat, det, sombra, recibe] = clave.split('|');
      const geo = mergeGeometries(geos, false);
      geos.forEach(g => g.dispose());
      const malla = this.rec.malla(geo, mat);
      malla.castShadow = sombra === '1';
      malla.receiveShadow = recibe === '1';
      malla.matrixAutoUpdate = false; malla.updateMatrix();
      if (sector === 'global') { this.global.add(malla); continue; }
      if (!this.sectores.has(sector)) {
        const [ix, iz] = sector.split('_').map(Number);
        const grupo = new THREE.Group(); grupo.name = 'sector ' + sector;
        const detalle = [0, 1, 2, 3, 4].map(() => new THREE.Group());
        detalle.forEach(d => grupo.add(d));
        this.raiz.add(grupo);
        this.sectores.set(sector, { grupo, detalle, cx: ix * SECTOR - L * 2 + SECTOR / 2, cz: iz * SECTOR - L * 2 + SECTOR / 2 });
      }
      this.sectores.get(sector).detalle[+det].add(malla);
    }
    this.lotes.clear();
    this.configurarDetalle(this.ctx.ajustes.g.detalle);
  }

  // -------------------------------------------------------------------------
  // Herramientas de construcción reutilizables por los mapas
  // -------------------------------------------------------------------------
  /** Suelo base y una calzada rectangular. */
  terreno(mat = 'tierra', tam = 260) {
    this.agregar(G.plano, matriz(0, 0, 0, 0, -Math.PI / 2, 0, tam, tam, 1), mat, { global: true, sombra: false });
  }
  losa(x, z, sx, sz, mat, y = -0.04, op = {}) {
    this.agregar(G.caja, matriz(x, y, z, op.ry || 0, 0, 0, sx, 0.05, sz), mat, { global: op.global ?? true, sombra: false });
  }
  /** Bordillo/acera transitable (colisión baja: se sube andando). */
  acera(x, z, sx, sz, alto = 0.3, mat = 'acera') {
    this.agregar(G.caja, matriz(x, 0, z, 0, 0, 0, sx, alto, sz), mat, { sombra: false });
    this.col.agregarCentro(x, -alto / 2, z, sx, alto, sz, { superficie: 'hormigon' });
  }

  /** Paredes invisibles solo para el jugador: área jugable [-b, b]² (los zombis entran desde fuera). */
  limiteJugador(b) {
    const L = this.lim;
    for (const s of [-1, 1]) {
      this.col.agregar(-L, 0, s > 0 ? b : -L, L, 6, s > 0 ? L : -b, { soloJugador: true });
      this.col.agregar(s > 0 ? b : -L, 0, -L, s > 0 ? L : -b, 6, L, { soloJugador: true });
    }
  }

  /** Posiciona un elemento sobre una fachada. u: desplazamiento horizontal; v: altura del centro. */
  fachada(e, lado, u, v, ancho, alto, prof, mat, op = {}) {
    let x, z, ry;
    if (lado === 's') { x = e.x + u; z = e.z + e.d / 2 + prof / 2; ry = 0; }
    else if (lado === 'n') { x = e.x - u; z = e.z - e.d / 2 - prof / 2; ry = Math.PI; }
    else if (lado === 'e') { x = e.x + e.w / 2 + prof / 2; z = e.z - u; ry = Math.PI / 2; }
    else { x = e.x - e.w / 2 - prof / 2; z = e.z + u; ry = -Math.PI / 2; }
    if (op.plano) this.agregar(G.plano, matriz(x, v, z, ry, 0, 0, ancho, alto, 1), mat, op);
    else this.agregar(G.caja, matriz(x, v, z, ry, op.rx || 0, 0, ancho, alto, Math.max(prof, 0.001)), mat, op);
  }

  /**
   * Edificio con ventanas, cornisas, azotea y (en su frente) comercio con toldo y rótulo.
   * e: { x, z, w, d, h, mat, frente: 'n'|'s'|'e'|'w', letrero?, garaje?, sinComercio?, ventanas? }
   */
  edificio(e) {
    const rnd = this.rnd;
    this.caja(e.x, 0, e.z, e.w, e.h, e.d, e.mat, { superficie: 'hormigon' });
    // pretil de la azotea
    for (const [sx, sz, px, pz] of [[e.w, 0.3, 0, -e.d / 2 + 0.15], [e.w, 0.3, 0, e.d / 2 - 0.15], [0.3, e.d, -e.w / 2 + 0.15, 0], [0.3, e.d, e.w / 2 - 0.15, 0]])
      this.agregar(G.caja, matriz(e.x + px, e.h + 0.35, e.z + pz, 0, 0, 0, sx, 0.7, sz), e.matPretil || 'hormigon', { detalle: 1 });
    // maquinaria en la azotea
    this.agregar(G.caja, matriz(e.x + e.w * 0.2, e.h + 0.5, e.z - e.d * 0.15, 0.3, 0, 0, 1.6, 1, 1.2), 'metalOxido', { detalle: 2 });
    if (e.h > 9) this.agregar(G.cil12, matriz(e.x - e.w * 0.25, e.h + 1.2, e.z + e.d * 0.2, 0, 0, 0, 1.8, 2.4, 1.8), 'metalOxido', { detalle: 3 });

    const pisos = Math.floor((e.h - 1) / 3);
    const luces = e.luces ?? 0.18;
    for (const lado of ['n', 's', 'e', 'w']) {
      const L = lado === 'n' || lado === 's' ? e.w : e.d;
      const esFrente = lado === e.frente && !e.sinComercio;
      for (let p = 1; p <= pisos; p++) this.fachada(e, lado, 0, p * 3, L + 0.2, 0.2, 0.15, e.matPretil || 'hormigon', { detalle: 1 });
      const n = Math.max(2, Math.floor(L / 3));
      for (let p = 0; p < pisos; p++) {
        for (let i = 0; i < n; i++) {
          const u = -L / 2 + (i + 0.5) * (L / n);
          if (p === 0 && esFrente) continue;          // la planta baja del frente es un comercio
          const v = p * 3 + 1.75;
          const r = rnd();
          const mat = r < luces ? 'ventanaLuz' : r < luces + 0.07 ? 'ventanaFria' : 'cristalOscuro';
          this.fachada(e, lado, u, v, 1.1, 1.5, 0.02, mat, { plano: true, sombra: false });
          this.fachada(e, lado, u, v + 0.8, 1.35, 0.12, 0.12, 'hormigon');
          this.fachada(e, lado, u, v - 0.8, 1.45, 0.14, 0.18, 'hormigon');
          this.fachada(e, lado, u - 0.62, v, 0.1, 1.6, 0.1, 'hormigon', { detalle: 1 });
          this.fachada(e, lado, u + 0.62, v, 0.1, 1.6, 0.1, 'hormigon', { detalle: 1 });
          if (p === 0 && rnd() < 0.5) {               // tablones clavados en planta baja
            for (let k = 0; k < 3; k++) this.fachada(e, lado, u, v - 0.5 + k * 0.5, 1.4, 0.22, 0.06, 'madera', { rx: 0, detalle: 1 });
          }
        }
      }
      if (esFrente) {
        this.fachada(e, lado, -L * 0.18, 1.5, L * 0.42, 2.2, 0.02, rnd() < 0.5 ? 'cristalOscuro' : 'ventanaFria', { plano: true, sombra: false });
        this.fachada(e, lado, -L * 0.18, 0.3, L * 0.46, 0.6, 0.2, 'hormigon');
        this.fachada(e, lado, L * 0.22, 1.2, 1.4, 2.4, 0.08, e.garaje ? 'metalOxido' : 'madera');
        if (e.garaje) this.fachada(e, lado, -L * 0.18, 1.6, L * 0.44, 2.6, 0.06, 'metalAzul');
        this.fachada(e, lado, -L * 0.18, 2.95, L * 0.5, 0.08, 1.3, e.toldo || 'ropaVerde', { detalle: 2, rx: 0 });
      }
      if (lado === e.frente && e.letrero !== undefined) this.rotulo(e, lado, e.letrero);
    }
  }

  /** Rótulo luminoso (celda del atlas de letreros) sobre una fachada. */
  rotulo(e, lado, idx, altura = 3.9, maxAncho = 6) {
    const g = new THREE.PlaneGeometry(1, 1);
    const cx = idx % 2, cy = Math.floor(idx / 2), FILAS = 5;
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i)) / 2, 1 - (cy + 1 - uv.getY(i)) / FILAS);
    const L = lado === 'n' || lado === 's' ? e.w : e.d;
    let x, z, ry; const off = 0.25;
    if (lado === 's') { x = e.x; z = e.z + e.d / 2 + off; ry = 0; }
    else if (lado === 'n') { x = e.x; z = e.z - e.d / 2 - off; ry = Math.PI; }
    else if (lado === 'e') { x = e.x + e.w / 2 + off; z = e.z; ry = Math.PI / 2; }
    else { x = e.x - e.w / 2 - off; z = e.z; ry = -Math.PI / 2; }
    const a = Math.min(maxAncho, L * 0.6);
    this.agregar(g, matriz(x, altura, z, ry, 0, 0, a, a / 2, 1), 'letreros', { uvPropia: true, sombra: false });
  }

  valla(x, z, largo, ry, rota = false) {
    const n = Math.round(largo / 2.4);
    for (let i = 0; i < n; i++) {
      const k = -largo / 2 + (i + 0.5) * (largo / n);
      const px = x + Math.cos(ry) * k, pz = z - Math.sin(ry) * k;
      if (rota && i === Math.floor(n / 2)) continue;       // hueco por donde entran los zombis
      this.agregar(G.plano, matriz(px, 1.1, pz, ry, 0, 0, largo / n, 2.2, 1), 'valla', { sombra: true });
    }
    for (let i = 0; i <= n; i++) {
      const k = -largo / 2 + i * (largo / n);
      this.agregar(G.cil8, matriz(x + Math.cos(ry) * k, 1.15, z - Math.sin(ry) * k, 0, 0, 0, 0.07, 2.3, 0.07), 'farola');
    }
  }

  /** Valla con colisión (bloquea a jugador y zombis; no bloquea la vista). */
  vallaSolida(x, z, largo, ry, rota = false) {
    this.valla(x, z, largo, ry, rota);
    const c = Math.cos(ry), s = Math.sin(ry);
    const n = Math.round(largo / 2.4), tramo = largo / n;
    for (let i = 0; i < n; i++) {
      if (rota && i === Math.floor(n / 2)) continue;
      const k = -largo / 2 + (i + 0.5) * tramo;
      this.colisionGirada(x + c * k, 0, z - s * k, tramo, 2.2, 0.1, ry, { superficie: 'metal', bloqueaVista: false });
    }
  }

  barreraJersey(x, z, ry, mat = 'hormigon') {
    const forma = new THREE.Shape();
    forma.moveTo(-0.3, 0); forma.lineTo(0.3, 0); forma.lineTo(0.16, 0.3); forma.lineTo(0.1, 0.85); forma.lineTo(-0.1, 0.85); forma.lineTo(-0.16, 0.3); forma.closePath();
    const geo = new THREE.ExtrudeGeometry(forma, { depth: 2, bevelEnabled: false });
    geo.translate(0, 0, -1);
    this.agregar(geo, matriz(x, 0, z, ry + Math.PI / 2), mat);
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    const ex = (2 * c + 0.6 * s) / 2, ez = (2 * s + 0.6 * c) / 2;
    this.col.agregar(x - ex, 0, z - ez, x + ex, 0.85, z + ez, { superficie: 'hormigon' });
  }

  /** Farola con brazo orientado según ry (hacia +Z local girado). */
  farola(x, z, ry, op = {}) {
    const alto = op.alto || 6.4;
    this.agregar(G.cil8, matriz(x, alto / 2, z, 0, 0, 0, 0.16, alto, 0.16), 'farola');
    this.agregar(G.cil8, matriz(x, 0.4, z, 0, 0, 0, 0.3, 0.8, 0.3), 'farola');
    this.col.agregarCentro(x, 0, z, 0.3, alto, 0.3, { superficie: 'metal' });
    const dx = Math.sin(ry), dz = Math.cos(ry);
    this.agregar(G.caja, matriz(x + dx * 0.7, alto - 0.1, z + dz * 0.7, ry, 0, 0, 0.1, 0.1, 1.5), 'farola');
    this.agregar(G.caja, matriz(x + dx * 1.45, alto - 0.2, z + dz * 1.45, ry, 0, 0, 0.45, 0.18, 0.7), 'farola');
    this.agregar(G.caja, matriz(x + dx * 1.45, alto - 0.3, z + dz * 1.45, ry, 0, 0, 0.32, 0.05, 0.5), op.rota ? 'bombillaRota' : 'bombilla', { sombra: false });
    if (!op.rota) this.candidatosLuz.push({ tipo: 'farola', pos: V(x + dx * 1.45, alto - 0.4, z + dz * 1.45), color: new THREE.Color(op.color ?? 0xffb46b), intensidad: op.intensidad ?? 60, parpadeo: op.parpadea ? 1 : 0, fase: this.rnd() * 10 });
  }

  /** Torre de focos (iluminación de obra/militar) apuntando hacia un punto. */
  torreFocos(x, z, haciaX, haciaZ, op = {}) {
    const alto = op.alto || 7;
    for (const [px, pz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]])
      this.agregar(G.cil8, matriz(x + px * 0.7, alto / 2, z + pz * 0.7, 0, 0, 0, 0.08, alto, 0.08), 'metalAmarillo');
    for (let h = 1.5; h < alto; h += 1.8) this.agregar(G.caja, matriz(x, h, z, 0, 0, 0, 0.8, 0.06, 0.8), 'metalAmarillo', { detalle: 1 });
    this.col.agregarCentro(x, 0, z, 0.9, alto, 0.9, { superficie: 'metal', bloqueaVista: false });
    const ry = Math.atan2(haciaX - x, haciaZ - z);
    this.agregar(G.caja, matriz(x, alto + 0.35, z, ry, 0, 0, 1.6, 0.9, 0.3), 'farola');
    this.agregar(G.caja, matriz(x + Math.sin(ry) * 0.16, alto + 0.35, z + Math.cos(ry) * 0.16, ry, 0, 0, 1.4, 0.7, 0.04), op.rota ? 'bombillaRota' : 'bombilla', { sombra: false });
    if (!op.rota) this.candidatosLuz.push({ tipo: 'farola', pos: V(x + Math.sin(ry) * 0.4, alto + 0.2, z + Math.cos(ry) * 0.4), apunta: V(haciaX, 0, haciaZ), color: new THREE.Color(op.color ?? 0xe8f0ff), intensidad: op.intensidad ?? 90, parpadeo: op.parpadea ? 1 : 0, fase: this.rnd() * 10 });
  }

  /** Coche procedural: carrocería extruida, cabina acristalada, ruedas y faros. */
  coche(x, z, ry, mat, quemado = false) {
    const perfil = new THREE.Shape();
    perfil.moveTo(-2.15, 0.35); perfil.lineTo(2.15, 0.35); perfil.lineTo(2.2, 0.75); perfil.lineTo(1.9, 0.95);
    perfil.lineTo(-1.9, 0.98); perfil.lineTo(-2.2, 0.8); perfil.closePath();
    const cuerpo = new THREE.ExtrudeGeometry(perfil, { depth: 1.7, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
    cuerpo.translate(0, 0, -0.85);
    const cabina = new THREE.Shape();
    cabina.moveTo(-1.35, 0.95); cabina.lineTo(1.0, 0.95); cabina.lineTo(0.45, 1.5); cabina.lineTo(-1.1, 1.5); cabina.closePath();
    const vid = new THREE.ExtrudeGeometry(cabina, { depth: 1.5, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 });
    vid.translate(0, 0, -0.75);
    const base = matriz(x, 0, z, ry);
    this.agregar(cuerpo, base, quemado ? 'cocheQuemado' : mat);
    this.agregar(vid, base, quemado ? 'cocheQuemado' : 'cristal');
    if (!quemado) this.agregar(G.caja, base.clone().multiply(matriz(-0.3, 1.52, 0, 0, 0, 0, 1.4, 0.05, 1.45)), mat);
    for (const [wx, wz] of [[-1.35, -0.85], [1.35, -0.85], [-1.35, 0.85], [1.35, 0.85]]) {
      this.agregar(G.cil12, base.clone().multiply(matriz(wx, 0.36, wz, 0, Math.PI / 2, 0, 0.72, 0.28, 0.72)), quemado ? 'metalOxido' : 'neumatico');
    }
    if (!quemado) for (const s of [-1, 1]) {
      this.agregar(G.caja, base.clone().multiply(matriz(2.22, 0.62, s * 0.6, 0, 0, 0, 0.04, 0.14, 0.32)), 'ventanaFria', { sombra: false });
      this.agregar(G.caja, base.clone().multiply(matriz(-2.22, 0.62, s * 0.6, 0, 0, 0, 0.04, 0.14, 0.32)), 'fuegoBrasas', { sombra: false });
    }
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    const ex = (4.4 * c + 1.8 * s) / 2, ez = (4.4 * s + 1.8 * c) / 2;
    this.col.agregar(x - ex, 0, z - ez, x + ex, 1.05, z + ez, { superficie: 'metal' });
    this.col.agregarCentro(x - Math.cos(ry) * 0.2, 1.0, z + Math.sin(ry) * 0.2, Math.max(1.6, 2.4 * c + 1.4 * s), 0.55, Math.max(1.4, 2.4 * s + 1.4 * c), { superficie: 'metal' });
    if (quemado) this.fuego(V(x, 1.2, z), 1.4, 'coche');
  }

  /** Camión / furgón: cabina + caja de carga (largo según tipo). */
  camion(x, z, ry, matCabina, matCaja, op = {}) {
    const L = op.largo || 7, A = op.ancho || 2.4, H = op.alto || 3;
    const base = matriz(x, 0, z, ry);
    const caja = (px, py, pz, sx, sy, sz, mat, o = {}) => this.agregar(G.caja, base.clone().multiply(matriz(px, py + sy / 2, pz, 0, 0, 0, sx, sy, sz)), mat, o);
    caja(-L / 2 + 1.1, 0.55, 0, 2.2, 2.0, A, matCabina);
    caja(-L / 2 + 0.02, 1.55, 0, 0.06, 0.8, A * 0.85, 'cristal', { sombra: false });
    caja(1.1, 0.75, 0, L - 2.3, H - 0.75, A, matCaja);
    caja(0, 0.35, 0, L, 0.4, A * 0.9, 'metalOxido');
    for (const px of [-L / 2 + 1.1, L / 2 - 2.2, L / 2 - 0.9]) for (const s of [-1, 1])
      this.agregar(G.cil12, base.clone().multiply(matriz(px, 0.5, s * (A / 2 - 0.1), 0, Math.PI / 2, 0, 1.0, 0.36, 1.0)), 'neumatico');
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    const ex = (L * c + A * s) / 2, ez = (L * s + A * c) / 2;
    this.col.agregar(x - ex, 0, z - ez, x + ex, H, z + ez, { superficie: 'metal' });
    if (op.quemado) this.fuego(V(x, H, z), 1.6, 'camion');
  }

  fuego(pos, tam, tipo) {
    this.fuegos.push({ pos, tam, tipo, acum: 0 });
    this.candidatosLuz.push({ tipo: 'fuego', pos: pos.clone().add(V(0, 0.8, 0)), color: new THREE.Color(0xff7a2a), intensidad: 26 * tam, parpadeo: 2, fase: this.rnd() * 10 });
  }

  /** Muro de sacos terreros. */
  muroSacos(cx, cz, largo, vertical, filas = 3) {
    for (let fila = 0; fila < filas; fila++) {
      const n = Math.floor(largo / 0.62);
      for (let i = 0; i < n; i++) {
        const k = -largo / 2 + (i + 0.5 + (fila % 2) * 0.5) * (largo / n);
        if (Math.abs(k) > largo / 2) continue;
        const x = vertical ? cx : cx + k, z = vertical ? cz + k : cz;
        this.agregar(G.esfera, matriz(x, 0.14 + fila * 0.26, z, vertical ? Math.PI / 2 : 0, 0, (this.rnd() - 0.5) * 0.1, 0.6, 0.3, 0.38), 'sacos', { detalle: 0 });
      }
    }
    const alto = 0.15 + filas * 0.26;
    if (vertical) this.col.agregarCentro(cx, 0, cz, 0.45, alto, largo, { superficie: 'tierra' });
    else this.col.agregarCentro(cx, 0, cz, largo, alto, 0.45, { superficie: 'tierra' });
  }

  arbolMuerto(x, z, alto) {
    const rnd = this.rnd;
    this.agregar(G.cil8, matriz(x, alto / 2, z, 0, 0, 0, 0.35, alto, 0.35), 'corteza');
    this.col.agregarCentro(x, 0, z, 0.4, alto, 0.4, { superficie: 'madera' });
    const rama = (ox, oy, oz, largo, ang, giro, nivel) => {
      const dx = Math.sin(ang) * Math.cos(giro), dy = Math.cos(ang), dz = Math.sin(ang) * Math.sin(giro);
      const m = new THREE.Matrix4().lookAt(V(0, 0, 0), V(dx, dy, dz), V(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(m).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
      const grosor = 0.2 / (nivel + 1);
      this.agregar(G.cil8, new THREE.Matrix4().compose(V(ox + dx * largo / 2, oy + dy * largo / 2, oz + dz * largo / 2), q, V(grosor, largo, grosor)), 'corteza', { detalle: nivel });
      if (nivel < 2) for (let i = 0; i < 2; i++) rama(ox + dx * largo, oy + dy * largo, oz + dz * largo, largo * 0.6, ang + (rnd() - 0.3) * 0.9, giro + (rnd() - 0.5) * 2, nivel + 1);
    };
    for (let i = 0; i < 4; i++) rama(x, alto * (0.6 + rnd() * 0.3), z, 1.5 + rnd(), 0.5 + rnd() * 0.6, rnd() * 6.3, 0);
  }

  barril(x, z, ardiendo) {
    this.agregar(G.cil12, matriz(x, 0.45, z, 0, 0, 0, 0.6, 0.9, 0.6), ardiendo ? 'metalOxido' : (this.rnd() < 0.5 ? 'metalAzul' : 'metalRojo'));
    this.col.agregarCentro(x, 0, z, 0.6, 0.9, 0.6, { superficie: 'metal' });
    if (ardiendo) this.fuego(V(x, 0.9, z), 0.6, 'barril');
  }

  cajaMadera(x, z, y = 0, tam = 0.95) { this.caja(x, y, z, tam, tam, tam, 'madera', { superficie: 'madera' }); }

  contenedor(x, z, ry, mat = 'metalVerde') { this.caja(x, 0, z, 1.6, 1.4, 1.0, mat, { ry, superficie: 'metal' }); }

  /** Contenedor marítimo (6 m) con nervaduras. */
  contenedorMaritimo(x, z, ry, mat, y = 0) {
    this.caja(x, y, z, 6, 2.6, 2.44, mat, { ry, superficie: 'metal' });
    const c = Math.cos(ry), s = Math.sin(ry);
    for (let k = -2.7; k <= 2.7; k += 0.6) this.agregar(G.caja, matriz(x + c * k, y + 1.3, z - s * k, ry, 0, 0, 0.08, 2.5, 2.5), mat, { detalle: 2 });
  }

  /** Objetos pequeños sin colisión dispersos (neumáticos, bolsas, cascotes, papeles). */
  escombros(n, radio, excluir = () => false) {
    const rnd = this.rnd;
    for (let i = 0; i < n; i++) {
      const x = (rnd() - 0.5) * radio * 2, z = (rnd() - 0.5) * radio * 2;
      if (excluir(x, z)) continue;
      const nivel = i < n * 0.3 ? 2 : i < n * 0.65 ? 3 : 4;
      const t = rnd();
      if (t < 0.15) this.agregar(G.toro, matriz(x, 0.14, z, rnd() * 6, Math.PI / 2 + (rnd() - 0.5) * 0.4, 0, 1, 1, 1), 'neumatico', { detalle: nivel });
      else if (t < 0.35) this.agregar(G.esfera, matriz(x, 0.2, z, rnd() * 6, 0, 0, 0.7, 0.45, 0.6), 'goma', { detalle: nivel });
      else if (t < 0.7) this.agregar(G.dodeca, matriz(x, 0.08, z, rnd() * 6, rnd(), rnd(), 0.25 + rnd() * 0.3, 0.2, 0.3), rnd() < 0.5 ? 'hormigon' : 'ladrillo', { detalle: nivel });
      else this.agregar(G.plano, matriz(x, 0.02, z, rnd() * 6, -Math.PI / 2, 0, 0.3, 0.4, 1), 'ropaBlanca', { detalle: nivel, sombra: false });
    }
  }

  /** Cable combado entre dos puntos. */
  cable(a, b, comba = 1.2) {
    const puntos = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24; puntos.push(V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * comba, a.z + (b.z - a.z) * t)); }
    const tubo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(puntos), 32, 0.025, 4, false);
    this.agregar(tubo, new THREE.Matrix4(), 'cable', { detalle: 2, sombra: false, uvPropia: true });
  }

  /**
   * Estación de compra. Si op.panel, se crea un tablón de madera con postes que la sostiene
   * (para colocarla en cualquier sitio, no solo en paredes).
   * normal: dirección hacia la que mira (desde donde se compra).
   */
  estacion(tipo, precio, x, y, z, nx, nz, op = {}) {
    const normal = V(nx, 0, nz).normalize();
    if (op.panel) {
      const ry = Math.atan2(nx, nz);
      const px = x - nx * 0.06, pz = z - nz * 0.06;
      this.agregar(G.caja, matriz(px, y + 0.25, pz, ry, 0, 0, 1.6, 1.5, 0.08), 'madera');
      for (const k of [-0.7, 0.7]) this.agregar(G.caja, matriz(px + Math.cos(ry) * k - nx * 0.06, (y + 1.0) / 2, pz - Math.sin(ry) * k - nz * 0.06, ry, 0, 0, 0.1, y + 1.0, 0.1), 'madera');
      this.colisionGirada(px - nx * 0.04, 0, pz - nz * 0.04, 1.6, y + 1.0, 0.2, ry, { superficie: 'madera' });
    }
    if (tipo === 'botiquin') this.estaciones.push({ tipo: 'botiquin', precio, pos: V(x, y, z), normal });
    else this.estaciones.push({ tipo: 'arma', arma: tipo, precio, pos: V(x, y, z), normal });
  }

  // -------------------------------------------------------------------------
  // Charcos con reflejo, bruma y detalle
  // -------------------------------------------------------------------------
  crearCharcos(lista) {
    const geos = [];
    const rnd = mulberry32(77);
    for (const [x, z, r] of lista) {
      const g = new THREE.CircleGeometry(r, 24);
      const p = g.attributes.position;
      for (let i = 1; i < p.count; i++) {
        const a = Math.atan2(p.getY(i), p.getX(i));
        const k = 1 + 0.18 * Math.sin(a * 3 + rnd() * 6) + 0.1 * Math.sin(a * 7 + rnd() * 6);
        p.setXY(i, p.getX(i) * k * 1.3, p.getY(i) * k * 0.8);
      }
      g.translate(x, -z, 0);       // plano XY: tras rotar -90° en X, y local = -z mundial
      geos.push(g);
      this.charcos.push({ x, z, r });
    }
    if (!geos.length) { this.geoCharcos = null; this.charcoSimple = null; return; }
    this.geoCharcos = mergeGeometries(geos);
    geos.forEach(g => g.dispose());
    this.charcoSimple = this.rec.malla(this.geoCharcos, 'charco');
    this.charcoSimple.rotation.x = -Math.PI / 2;
    this.charcoSimple.position.y = 0.016;
    this.charcoSimple.receiveShadow = true;
    this.global.add(this.charcoSimple);
  }

  /**
   * Charcos con reflejo planar real. Optimizado: la textura de reflejo usa una fracción
   * de la resolución (el agua la difumina), sin MSAA, y durante su render se ocultan
   * calcas, partículas, bruma y los objetos de detalle menudo (invisibles en un reflejo).
   * Además se desactiva cuando no hay ningún charco cerca y delante de la cámara.
   */
  configurarReflejos(nivel, ancho, alto) {
    const f = nivel >= 3 ? 0.7 : 0.45;
    if (this.reflector && this.nivelReflejos === nivel) {        // solo cambia el tamaño de pantalla
      this.reflector.getRenderTarget().setSize(Math.max(256, Math.floor(ancho * f)), Math.max(256, Math.floor(alto * f)));
      return;
    }
    if (this.reflector) { this.reflector.parent?.remove(this.reflector); this.reflector.dispose(); this.reflector = null; }
    this.nivelReflejos = nivel;
    if (!this.charcoSimple) return;
    this.charcoSimple.visible = nivel < 2;
    if (nivel >= 2) {
      this.reflector = new Reflector(this.geoCharcos, {
        textureWidth: Math.max(256, Math.floor(ancho * f)), textureHeight: Math.max(256, Math.floor(alto * f)),
        color: 0x6a7078, clipBias: 0.003, multisample: 0,
      });
      this.reflector.rotation.x = -Math.PI / 2;
      this.reflector.position.y = 0.017;
      const orig = this.reflector.onBeforeRender;
      let cuadro = 0;
      this.reflector.onBeforeRender = (...a) => {
        // el reflejo se recalcula cada dos fotogramas (la textura anterior sigue valiendo): ahorra
        // la mitad de las llamadas de dibujo del reflejo, y un fotograma de retraso en un charco no se nota
        if (++cuadro & 1) return;
        const c = this.ctx, ocultar = [c.calcas?.grupo, c.particulas?.sis.n.puntos, c.particulas?.sis.a.puntos, this.bruma];
        for (const s of this.sectores.values()) for (let i = 2; i < 5; i++) ocultar.push(s.detalle[i]);
        const antes = ocultar.map(o => o?.visible);
        ocultar.forEach(o => { if (o) o.visible = false; });
        orig.apply(this.reflector, a);
        ocultar.forEach((o, i) => { if (o) o.visible = antes[i]; });
      };
      this.global.add(this.reflector);
    }
  }

  /** Capas de bruma a ras de suelo (shader con ruido animado). */
  crearBruma() {
    this.brumaUniforms = { uTiempo: { value: 0 }, uDensidad: { value: 0.5 }, uCamara: { value: V() }, uColor: { value: new THREE.Color(0.16, 0.19, 0.24) } };
    this.bruma = new THREE.Group();
    const geo = new THREE.PlaneGeometry(130, 130, 1, 1).rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...this.brumaUniforms, uCapa: { value: i } },
        transparent: true, depthWrite: false, fog: false,
        vertexShader: `varying vec3 vMundo; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vMundo = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `
          uniform float uTiempo, uDensidad, uCapa; uniform vec3 uCamara; uniform vec3 uColor; varying vec3 vMundo;
          float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
          float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
          void main(){
            vec2 p = vMundo.xz * 0.06 + vec2(uTiempo * 0.02 * (1.0 + uCapa), uTiempo * 0.013);
            float v = n(p) * 0.6 + n(p * 2.3 + 7.0) * 0.4;
            float d = distance(vMundo.xz, uCamara.xz);
            float cerca = smoothstep(1.5, 7.0, d);               // no tapa la vista del jugador
            float lejos = 1.0 - smoothstep(35.0, 60.0, d);
            float a = smoothstep(0.35, 0.85, v) * uDensidad * cerca * lejos * (0.22 - uCapa * 0.04);
            gl_FragColor = vec4(uColor, a);
          }`,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.y = 0.25 + i * 0.45;
      m.renderOrder = 10;
      m.frustumCulled = false;
      this.bruma.add(m);
    }
    this.bruma.visible = false;
    this.escena.add(this.bruma);
  }

  configurarBruma(nivel) {
    this.bruma.visible = nivel >= 3;
    this.bruma.children.forEach((m, i) => { m.visible = nivel >= 4 || i < 2; });
    const k = this.def?.bruma ?? 1;
    this.brumaUniforms.uDensidad.value = (nivel >= 4 ? 1.0 : 0.6) * k;
    if (this.def?.colorBruma) this.brumaUniforms.uColor.value.set(this.def.colorBruma);
  }

  configurarDetalle(nivel) {
    this.nivelDetalle = nivel;
    if (!this.sectores) return;
    for (const s of this.sectores.values()) s.detalle.forEach((g, i) => { g.visible = i <= nivel; });
  }

  /** Culling por distancia de sectores enteros + animación de fuegos y bruma + charcos activos. */
  actualizar(dt, camara, distancia) {
    this.cielo.actualizar(dt, camara);
    if (!this.raiz) return;
    const cx = camara.position.x, cz = camara.position.z;
    const radio = SECTOR * 0.71;
    for (const s of this.sectores.values()) {
      const d = Math.hypot(s.cx - cx, s.cz - cz) - radio;
      s.grupo.visible = d < distancia;
    }
    if (this.bruma.visible) { this.brumaUniforms.uTiempo.value += dt; this.brumaUniforms.uCamara.value.copy(camara.position); }
    // reflejo planar solo si hay algún charco cerca y en la mitad delantera de la vista
    if (this.reflector) {
      const f = camara.getWorldDirection(this._f || (this._f = V()));
      let util = false;
      for (const c of this.charcos) {
        const dx = c.x - cx, dz = c.z - cz, d = Math.hypot(dx, dz);
        if (d < 30 && (d < c.r * 2 || (dx * f.x + dz * f.z) / d > -0.1)) { util = true; break; }
      }
      this.reflector.visible = util;
      this.charcoSimple.visible = !util;
    }
    // fuegos: emisión de partículas
    const P = this.ctx.particulas;
    for (const f of this.fuegos) {
      if (Math.hypot(f.pos.x - cx, f.pos.z - cz) > distancia) continue;
      f.acum += dt * 30 * f.tam;
      while (f.acum >= 1) {
        f.acum -= 1;
        P.emitir('fuego', f.pos, null, 1, f.tam);
        if (Math.random() < 0.35) P.emitir('humoFuego', f.pos, null, 1, f.tam);
        if (Math.random() < 0.08) P.emitir('brasa', f.pos, null, 1, f.tam);
      }
    }
  }
}
