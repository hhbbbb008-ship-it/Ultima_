import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cuerpoGLB } from './CuerpoGLB.js';
import { MATERIALES } from '../motor/Recursos.js';

/**
 * Modelos de zombi procedurales con esqueleto real (THREE.Bone) y LOD.
 *
 * Optimización: en lugar de ~28 mallas por zombi (28 llamadas de dibujo, y otras
 * tantas en cada mapa de sombras), todas las piezas se fusionan en una malla con
 * piel rígida (SkinnedMesh): cada vértice pertenece al 100 % a un hueso. La malla
 * tiene un grupo por material, así que un zombi cuesta ~6-9 llamadas en vez de 28,
 * y la animación sigue siendo la misma (se mueven los huesos).
 *
 * Por zombi y nivel de LOD se construyen (bajo demanda y en caché) dos mallas:
 * "principal" (proyecta sombra) y "detalles" (dedos, dientes, pústulas…, sin sombra).
 */

// Segmentos por nivel de LOD [esfera(ancho, alto), cápsula(tapa, radial)]
const SEG = [[7, 5, 2, 6], [11, 8, 3, 8], [16, 11, 4, 11], [24, 16, 6, 16]];
const cache = new Map();
const geoCaja = new THREE.BoxGeometry(1, 1, 1);
const geoCono = [5, 7, 9, 12].map(n => new THREE.ConeGeometry(0.5, 1, n));
const IDENTIDAD = new THREE.Matrix4();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();

/** Geometría compartida por forma y nivel de LOD. */
export function geometria(forma, lod) {
  const clave = forma.t + '|' + (forma.r || 0) + '|' + (forma.L || 0) + '|' + lod;
  if (cache.has(clave)) return cache.get(clave);
  const s = SEG[lod];
  let g;
  if (forma.t === 'esfera') g = new THREE.SphereGeometry(0.5, s[0], s[1]);
  else if (forma.t === 'capsula') g = new THREE.CapsuleGeometry(forma.r, forma.L, s[2], s[3]);
  else if (forma.t === 'cono') g = geoCono[lod];
  else g = geoCaja;
  cache.set(clave, g);
  return g;
}

/** Descriptor de pieza: no es una malla, se fusiona después en la malla con piel. */
class Pieza {
  constructor(hueso, forma, mat, x, y, z, sx, sy, sz, extra) {
    this.hueso = hueso; this.forma = forma; this.mat = mat; this.extra = extra;
    this.position = new THREE.Vector3(x, y, z);
    this.rotation = new THREE.Euler();
    this.scale = new THREE.Vector3(sx, sy, sz);
  }
  /** ¿Se dibuja con este LOD y este nivel de detalle? (mismas reglas que antes) */
  visible(lod, detalle) {
    return this.extra === 0 || (detalle >= this.extra && lod >= 2) || (this.extra === 1 && detalle >= 1);
  }
}

class Constructor {
  constructor(piezas, huesos) { this.piezas = piezas; this.huesos = huesos; }
  pieza(padre, forma, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, extra = 0) {
    const p = new Pieza(padre, forma, mat, x, y, z, sx, sy, sz, extra);
    this.piezas.push(p);
    return p;
  }
  hueso(padre, x, y, z) {
    const h = new THREE.Bone(); h.position.set(x, y, z); padre.add(h);
    this.huesos.push(h);
    return h;
  }
}

const CAMISAS = ['ropaAzul', 'ropaMarron', 'ropaVerde', 'ropaBlanca'];
const PADRES = { columna: 'cadera', pecho: 'columna', cuello: 'pecho', cabeza: 'cuello', mandibula: 'cabeza' };
for (const l of ['I', 'D']) Object.assign(PADRES, {
  ['hombro' + l]: 'pecho', ['brazo' + l]: 'hombro' + l, ['antebrazo' + l]: 'brazo' + l, ['mano' + l]: 'antebrazo' + l,
  ['muslo' + l]: 'cadera', ['pierna' + l]: 'muslo' + l, ['pie' + l]: 'pierna' + l,
});

export function crearModeloZombi(rec, tipo, def) {
  const piezas = [], listaHuesos = [];
  const C = new Constructor(piezas, listaHuesos);
  const raiz = new THREE.Group();
  const cuerpo = new THREE.Group();            // se escala por tipo
  raiz.add(cuerpo);
  const e = def.escala;
  cuerpo.scale.setScalar(e);
  const G = cuerpoGLB.listo ? cuerpoGLB : null;   // cuerpo modelado en Blender (si cargó)
  const delgado = def.delgado ? 0.82 : 1;
  const flaco = G && def.delgado ? 0.86 : 1;      // con el .glb el corredor se adelgaza en ancho y fondo
  let camisa = tipo === 'corredor' ? def.piel : tipo === 'acorazado' ? 'armadura' : tipo === 'escupidor' ? def.piel : tipo === 'coloso' ? def.piel : CAMISAS[Math.floor(Math.random() * CAMISAS.length)];
  const manga = tipo === 'caminante' && Math.random() < 0.6 ? camisa : def.piel;
  const H = {};

  // ---- esqueleto ----
  if (G) {
    // mismas articulaciones que el modelo de Blender (huesos sin rotación de reposo)
    const pos = (n) => G.huesos[n];
    const crear = (n) => {
      const padre = PADRES[n], a = pos(n), b = padre ? pos(padre) : new THREE.Vector3();
      H[n] = C.hueso(padre ? H[padre] : cuerpo, (a.x - b.x) * flaco, a.y - b.y, (a.z - b.z) * flaco);
    };
    ['cadera', 'columna', 'pecho', 'cuello', 'cabeza', 'mandibula'].forEach(crear);
    for (const l of ['I', 'D']) ['hombro', 'brazo', 'antebrazo', 'mano', 'muslo', 'pierna', 'pie'].forEach(b => crear(b + l));
  } else {
    H.cadera = C.hueso(cuerpo, 0, 0.95, 0);
    H.columna = C.hueso(H.cadera, 0, 0.12, 0);
    H.pecho = C.hueso(H.columna, 0, 0.2, 0);
    H.cuello = C.hueso(H.pecho, 0, 0.24, 0);
    H.cabeza = C.hueso(H.cuello, 0, 0.08, 0.01);
    H.mandibula = C.hueso(H.cabeza, 0, -0.05, 0.03);
    for (const [l, s] of [['I', 1], ['D', -1]]) {
      H['hombro' + l] = C.hueso(H.pecho, s * 0.2 * delgado, 0.17, 0);
      H['brazo' + l] = C.hueso(H['hombro' + l], 0, 0, 0);
      H['antebrazo' + l] = C.hueso(H['brazo' + l], 0, -0.29, 0);
      H['mano' + l] = C.hueso(H['antebrazo' + l], 0, -0.26, 0);
      H['muslo' + l] = C.hueso(H.cadera, s * 0.1, -0.04, 0);
      H['pierna' + l] = C.hueso(H['muslo' + l], 0, -0.43, 0);
      H['pie' + l] = C.hueso(H['pierna' + l], 0, -0.42, 0);
    }
  }

  // ---- piezas ----
  const esf = { t: 'esfera' };
  let sinMano = false;
  if (G) {
    // cuerpo del .glb: la piel, la camisa y los ojos dependen del tipo
    // (piel, camisa y jeans van juntos en un atlas siempre que usen las texturas del .glb)
    const pielPropia = tipo === 'caminante' || tipo === 'acorazado';
    const pielG = pielPropia && MATERIALES.glbPiel ? 'glbPiel' : def.piel;
    const variante = tipo === 'caminante' ? Math.floor(Math.random() * G.camisas) : 0;
    if (tipo === 'caminante' && MATERIALES.glbCamisa0) camisa = 'glbCamisa' + variante;
    const atlas = G.atlas ? 'glbAtlas' + variante : null;
    for (const b of G.piezas) {
      let mat = b.mat === '*piel' ? pielG : b.mat === '*camisa' ? camisa : b.mat === '*ojos' ? def.ojos : b.mat;
      const enAtlas = atlas && ((b.mat === '*piel' && pielPropia) || (b.mat === '*camisa' && tipo === 'caminante') || b.mat === 'glbJeans');
      if (enAtlas) mat = atlas;
      piezas.push(new Pieza(null, { t: 'glb', base: b, atlas: !!enAtlas }, mat, 0, 0, 0, 1, 1, 1, b.extra));
    }
    // algunos caminantes han perdido una mano: muñón sangrante
    if (tipo === 'caminante' && Math.random() < 0.18) {
      sinMano = true;
      const m = H.manoI.position;
      C.pieza(H.antebrazoI, esf, 'carne', m.x, m.y, m.z, 0.07, 0.06, 0.07);
    }
  } else {
    C.pieza(H.cadera, esf, 'pantalon', 0, 0, 0, 0.32 * delgado, 0.22, 0.21);
    C.pieza(H.columna, { t: 'capsula', r: 0.14, L: 0.1 }, camisa, 0, 0.05, 0, delgado, 1, 0.9);
    C.pieza(H.pecho, esf, camisa, 0, 0.08, 0, 0.42 * delgado, 0.42, 0.25);
    C.pieza(H.cuello, { t: 'capsula', r: 0.045, L: 0.06 }, def.piel, 0, 0.0, 0);
    C.pieza(H.cabeza, esf, def.piel, 0, 0.06, 0, 0.21, 0.25, 0.23);
    C.pieza(H.mandibula, esf, def.piel, 0, -0.025, 0.02, 0.15, 0.06, 0.14);
    for (const s of [1, -1]) C.pieza(H.cabeza, esf, def.ojos, s * 0.042, 0.07, 0.1, 0.035, 0.03, 0.02, 0);
    C.pieza(H.mandibula, { t: 'caja' }, 'dientes', 0, 0.005, 0.07, 0.08, 0.015, 0.01, 3);
    C.pieza(H.cabeza, esf, 'hueso', -0.05, 0.12, 0.08, 0.05, 0.03, 0.03, 3);      // herida en el cráneo
    for (const [l, s] of [['I', 1], ['D', -1]]) {
      C.pieza(H['brazo' + l], { t: 'capsula', r: 0.055 * delgado, L: 0.18 }, manga, 0, -0.145, 0);
      const sinAntebrazo = tipo === 'caminante' && l === 'I' && Math.random() < 0.18;
      if (sinAntebrazo) C.pieza(H['antebrazo' + l], esf, 'carne', 0, 0, 0, 0.09, 0.07, 0.09);
      else {
        C.pieza(H['antebrazo' + l], { t: 'capsula', r: 0.045 * delgado, L: 0.17 }, def.piel, 0, -0.13, 0);
        C.pieza(H['mano' + l], { t: 'caja' }, def.piel, 0, -0.05, 0.01, 0.055, 0.09, 0.03);
        for (let k = 0; k < 3; k++) C.pieza(H['mano' + l], { t: 'caja' }, def.piel, -0.017 + k * 0.017, -0.11, 0.02, 0.012, 0.05, 0.012, 3);
      }
      C.pieza(H['muslo' + l], { t: 'capsula', r: 0.075 * delgado, L: 0.28 }, 'pantalon', 0, -0.215, 0);
      C.pieza(H['pierna' + l], { t: 'capsula', r: 0.058 * delgado, L: 0.3 }, tipo === 'corredor' && l === 'D' ? def.piel : 'pantalon', 0, -0.21, 0);
      C.pieza(H['pie' + l], { t: 'caja' }, 'zapato', 0, -0.02, 0.05, 0.1, 0.07, 0.22);
    }
  }

  // ---- rasgos por tipo ----
  let casco = null, placas = null;
  if (tipo === 'corredor') {
    for (let k = 0; k < 4; k++) C.pieza(H.pecho, { t: 'caja' }, 'carne', 0, 0.02 + k * 0.05, G ? 0.105 : 0.12, 0.26 * flaco, 0.012, 0.02, 2);   // costillas
  }
  if (tipo === 'acorazado') {
    placas = C.hueso(H.pecho, 0, 0, 0);          // las placas tienen hueso propio: la katana las arranca
    C.pieza(placas, { t: 'caja' }, 'armadura', 0, 0.08, 0.06, 0.38, 0.36, 0.16);
    for (const s of [1, -1]) C.pieza(placas, esf, 'armadura', s * 0.22, 0.17, 0, 0.17, 0.12, 0.17);
    casco = C.hueso(H.cabeza, 0, 0, 0);          // el casco es un hueso propio: se "quita" escalándolo a 0
    if (G) {
      C.pieza(casco, esf, 'casco', 0, 0.13, -0.005, 0.27, 0.235, 0.28);
      C.pieza(casco, { t: 'caja' }, 'visor', 0, 0.11, 0.13, 0.2, 0.08, 0.02);
    } else {
      C.pieza(casco, esf, 'casco', 0, 0.1, -0.005, 0.26, 0.2, 0.27);
      C.pieza(casco, { t: 'caja' }, 'visor', 0, 0.06, 0.12, 0.2, 0.08, 0.02);
    }
  }
  if (tipo === 'escupidor') {
    C.pieza(H.columna, esf, def.piel, 0, 0.08, 0.08, 0.5, 0.44, 0.44);                // vientre hinchado
    const n = 12;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * 1.2 - 0.3;
      C.pieza(H.columna, esf, 'pustula', Math.cos(a) * 0.23, 0.08 + b * 0.18, 0.08 + Math.sin(a) * 0.2 + 0.03, 0.05, 0.05, 0.05, k < 4 ? 0 : k < 8 ? 2 : 3);
    }
    C.pieza(H.mandibula, esf, def.piel, 0, -0.03, 0.025, 0.17, 0.08, 0.16);
  }
  if (tipo === 'coloso') {
    H.columna.userData.inclinacion = 0.35;
    // brazo derecho deforme, mucho más grande
    C.pieza(H.brazoD, { t: 'capsula', r: 0.11, L: 0.18 }, def.piel, 0, -0.15, 0);
    C.pieza(H.antebrazoD, { t: 'capsula', r: 0.1, L: 0.16 }, 'carne', 0, -0.13, 0);
    C.pieza(H.manoD, esf, def.piel, 0, -0.07, 0, 0.24, 0.26, 0.22);
    C.pieza(H.pecho, esf, 'carne', 0.12, 0.12, 0.1, 0.18, 0.16, 0.1, 1);
    for (let k = 0; k < 6; k++) {                                                    // púas óseas en la espalda
      const p = C.pieza(k < 3 ? H.pecho : H.columna, { t: 'cono' }, 'hueso', (k % 2 ? 0.07 : -0.07), 0.05 + (k % 3) * 0.1, -0.15, 0.05, 0.16, 0.05, k < 2 ? 0 : 2);
      p.rotation.x = -0.9;
    }
  }

  // pose de reposo: cada vértice se guarda en el espacio del modelo y cada hueso
  // recibe su matriz inversa de enlace (permite pesos repartidos entre varios huesos)
  raiz.updateMatrixWorld(true);
  const reposo = new Map(listaHuesos.map(h => [h, h.matrixWorld.clone()]));
  const skeleton = new THREE.Skeleton(listaHuesos);
  if (sinMano) H.manoI.scale.setScalar(0.0001);
  const modelo = {
    raiz, cuerpo, huesos: H, piezas, casco, placas, skeleton, rec, escala: e, reposo,
    escalaGLB: new THREE.Matrix4().makeScale(e * flaco, e, e * flaco),
    cabezaY: G ? G.cabezaY : 0.06,
    indiceHueso: new Map(listaHuesos.map((h, i) => [h, i])),
    mallas: new Map(),            // lod → { principal, detalles }
    sust: new Map(),              // clave de material → material que la sustituye
    detalle: -1, actuales: null,
  };
  return modelo;
}

/** Fusiona las piezas visibles de un LOD en una malla con piel rígida y un grupo por material. */
function construirMalla(modelo, piezas, lod) {
  if (!piezas.length) return null;
  const porMat = new Map();
  for (const p of piezas) {
    let g;
    if (p.forma.t === 'glb') {
      // malla del .glb: ya trae pesos; se escala al tipo y se traducen los índices de hueso
      const base = p.forma.base;
      g = (p.forma.atlas ? base.geoAtlas : base.geo).clone();
      g.applyMatrix4(modelo.escalaGLB);
      const mapa = base.nombres.map(n => modelo.indiceHueso.get(modelo.huesos[n]) ?? 0);
      const si = g.attributes.skinIndex.array;
      for (let i = 0; i < si.length; i++) si[i] = mapa[si[i]];
    } else {
      g = geometria(p.forma, lod).clone();
      _q.setFromEuler(p.rotation);
      g.applyMatrix4(_m.compose(p.position, _q, p.scale));
      g.applyMatrix4(modelo.reposo.get(p.hueso));        // del espacio del hueso al del modelo
      const n = g.attributes.position.count;
      const idx = new Uint16Array(n * 4), pes = new Float32Array(n * 4);
      const h = modelo.indiceHueso.get(p.hueso);
      for (let i = 0; i < n; i++) { idx[i * 4] = h; pes[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(pes, 4));
    }
    if (!porMat.has(p.mat)) porMat.set(p.mat, []);
    porMat.get(p.mat).push(g);
  }
  const claves = [...porMat.keys()];
  const partes = claves.map(k => { const gs = porMat.get(k); const r = gs.length > 1 ? mergeGeometries(gs, false) : gs[0]; if (gs.length > 1) gs.forEach(x => x.dispose()); return r; });
  const geo = partes.length > 1 ? mergeGeometries(partes, true) : partes[0];
  if (partes.length > 1) partes.forEach(x => x.dispose());
  else geo.addGroup(0, geo.index ? geo.index.count : geo.attributes.position.count, 0);
  const mats = claves.map(k => modelo.rec.mat(modelo.sust.get(k) || k));
  const malla = new THREE.SkinnedMesh(geo, mats);
  malla.userData.mats = claves; malla.userData.sust = modelo.sust;
  malla.bind(modelo.skeleton, IDENTIDAD);
  // esfera envolvente fija (en el espacio de la raíz): el cálculo automático usaría la pose de reposo
  const e = modelo.escala;
  malla.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.0 * e, 0), 1.45 * e);
  malla.receiveShadow = false;
  return malla;
}

/** Coloca en la raíz las mallas del nivel de LOD indicado (construyéndolas si hace falta). */
export function aplicarLOD(modelo, lod, detalle) {
  if (modelo.detalle !== detalle) liberarMallas(modelo);
  modelo.detalle = detalle;
  let m = modelo.mallas.get(lod);
  if (!m) {
    const vis = modelo.piezas.filter(p => p.visible(lod, detalle));
    m = {
      principal: construirMalla(modelo, vis.filter(p => p.extra === 0), lod),
      detalles: construirMalla(modelo, vis.filter(p => p.extra !== 0), lod),
    };
    m.principal.castShadow = lod >= 2;           // los zombis lejanos (LOD 0-1) no proyectan sombra: ahorra llamadas en cada mapa de sombras
    if (m.detalles) m.detalles.castShadow = false;
    modelo.mallas.set(lod, m);
  }
  if (modelo.actuales === m) return;
  if (modelo.actuales) for (const x of [modelo.actuales.principal, modelo.actuales.detalles]) if (x) modelo.raiz.remove(x);
  for (const x of [m.principal, m.detalles]) if (x) modelo.raiz.add(x);
  modelo.actuales = m;
}

export function liberarMallas(modelo) {
  for (const m of modelo.mallas.values()) for (const x of [m.principal, m.detalles]) if (x) { modelo.raiz.remove(x); x.geometry.dispose(); }
  modelo.mallas.clear();
  modelo.actuales = null;
}

/** Mallas construidas (para reasignar materiales cuando cambia la calidad). */
export function mallasDe(modelo) {
  const r = [];
  for (const m of modelo.mallas.values()) for (const x of [m.principal, m.detalles]) if (x) r.push(x);
  return r;
}

/**
 * Sustituye (o restaura, con 'por' = null) un material en todas las mallas del zombi.
 * Se usa para la armadura arrancada por la katana: las placas pasan a ser ropa rota.
 */
export function sustituirMaterial(modelo, clave, por) {
  if (por) modelo.sust.set(clave, por); else modelo.sust.delete(clave);
  for (const m of mallasDe(modelo)) {
    const i = m.userData.mats.indexOf(clave);
    if (i >= 0) m.material[i] = modelo.rec.mat(por || clave);
  }
}

/** Oculta/muestra la cabeza (decapitación) o el casco escalando su hueso. */
export function mostrarHueso(hueso, si) {
  hueso.visible = si;              // la bandera la sigue usando la detección de impactos
  hueso.scale.setScalar(si ? 1 : 0.0001);
}
