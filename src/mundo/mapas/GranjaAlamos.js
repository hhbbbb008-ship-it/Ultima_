import * as THREE from 'three';
import { G, V, matriz } from '../Mundo.js';

/**
 * Mapa 4 — "Granja Los Álamos": granja aislada entre maizales. Granero rojo,
 * casa con porche, silo, cobertizo, tractor, balas de paja y una hoguera en el patio.
 * Poca luz, niebla más densa y dos maizales que tapan la vista: los infectados
 * salen de entre las cañas sin que se les vea venir.
 */
export const GranjaAlamos = {
  id: 'granja', nombre: 'Granja Los Álamos', semilla: 7,
  desc: 'Granja aislada entre maizales. Oscura y con niebla: los infectados salen del maíz sin avisar.',
  dificultad: 'Muy alta', limite: 48,
  inicio: { x: 2, z: 2, yaw: 0 },
  charcos: [[-4, 5, 1.6], [6, -12, 1.4], [-14, -1, 1.2], [2, 20, 1.8], [18, 1, 1.3]],
  colorNiebla: 0x0c1112, niebla: 1.22, bruma: 1.4, colorBruma: 0x283230,
  luna: [0.3, 0.38, 0.85],
  camaraMenu(cam, t) {
    cam.position.set(Math.sin(t) * 16, 2.6 + Math.sin(t * 0.7) * 0.5, -4 + Math.cos(t) * 16);
    cam.lookAt(Math.sin(t + 1.3) * 4, 2.2, -10 + Math.cos(t + 1.3) * 4);
  },

  construir(m) {
    m.terreno('cesped');
    // caminos y patio de tierra
    m.losa(0, -6, 34, 30, 'tierra', -0.018);
    m.losa(0, 26, 7, 36, 'tierra', -0.016);
    m.losa(-20, -16, 6, 8, 'tierra', -0.016, { ry: 0 });

    granero(m, -20, -16);
    casa(m, 18, -20);
    silo(m, -34, -33);
    silo(m, -27.5, -35.5, 2.2, 10);
    cobertizo(m, 30, 4);
    molino(m, 35, -34);
    tractor(m, 8, -9, 0.5);
    m.camion(-6, -24, Math.PI / 2 + 0.15, 'cocheRojo', 'metalOxido', { largo: 5.2, alto: 1.9, ancho: 2.1 });   // camioneta
    m.coche(26, -9, 0.4, null, true);

    // maizales a ambos lados del camino de entrada
    maizal(m, 7, 40, 15, 40);
    maizal(m, -40, -7, 15, 40);
    // cercas de madera que separan el patio de los campos (con pasos)
    cerca(m, -40, 12.5, -10, 12.5); cerca(m, -5, 12.5, -3.6, 12.5);
    cerca(m, 3.6, 12.5, 6, 12.5); cerca(m, 10, 12.5, 40, 12.5);
    cerca(m, -40, -2, -40, 12.5); cerca(m, 40, -2, 40, 12.5);

    // balas de paja como cobertura
    for (const [x, z, ry] of [[-7, -2, 0.3], [7, 5, -0.2], [-11, 8, 1.2], [12, -3, 0.9], [-2, -15, 0], [16, 10, 0.4]]) balaRedonda(m, x, z, ry);
    for (const [x, z, ry, n] of [[-9, -10, 0.1, 3], [3, 9, -0.3, 2], [-28, 3, 0.5, 3], [24, -12, 0, 2]]) balasCuadradas(m, x, z, ry, n);
    // hoguera con troncos para sentarse
    hoguera(m, 0, -4);
    abrevadero(m, -12, -24);
    for (const [x, z] of [[-6.5, -28], [-5.6, -28.6]]) m.barril(x, z, false);
    m.barril(26, 12, true);
    // álamos en hilera al norte y al este, y árboles secos
    for (let x = -42; x <= 42; x += 6.5) alamo(m, x + (m.rnd() - 0.5) * 2, -43 + (m.rnd() - 0.5) * 2, 11 + m.rnd() * 5);
    for (let z = -32; z <= 0; z += 7) alamo(m, 44 + (m.rnd() - 0.5) * 2, z, 10 + m.rnd() * 5);
    for (const [x, z, h] of [[-40, 0, 5.5], [41, -4, 5], [-24, 8, 4.5], [33, -18, 4.6]]) m.arbolMuerto(x, z, h);
    m.escombros(50, 30, (x, z) => z > 12 || Math.abs(x) > 26);

    // iluminación: porche, granero, postes de madera, hoguera y bidón
    for (const [x, z, op] of [[0, 9, {}], [0, 24, { parpadea: true }], [-14, -27, { rota: false }], [24, -4, {}]]) postePalo(m, x, z, op);
    m.cable(V(0, 7.2, 9), V(0, 7.2, 24), 0.8);
    m.cable(V(0, 7.2, 9), V(18, 5.2, -14.6), 1.4);

    // límites y aparición (desde los maizales, el bosque del norte y el camino)
    m.limiteJugador(42.5);
    for (const [x, z] of [[0, 46], [-20, 46], [22, 46], [46, 24], [-46, 26], [46, -14], [-46, -12], [12, -46], [-14, -46], [34, 46], [-34, 46]])
      m.aparicion.push(V(x, 0, z));

    // compras
    m.estacion('escopeta', 1250, -12.94, 1.6, -9.6, 1, 0);
    m.estacion('recortada', 900, -12.94, 1.6, -22.4, 1, 0);
    m.estacion('pistola', 250, 11.94, 1.6, -18, -1, 0);
    m.estacion('botiquin', 750, 11.94, 1.6, -22.6, -1, 0);
    m.estacion('subfusil', 1000, 25.44, 1.6, 4, -1, 0);
    m.estacion('fusil', 2000, 31.5, 1.6, 7.06, 0, 1);
    m.estacion('toro', 600, -4, 1.2, -18.5, 0, 1, { panel: true });
    m.estacion('martillo', 1750, -26, 1.2, 9.5, 0, -1, { panel: true });
    m.estacion('halcon', 1500, 20, 1.2, -2.5, 0, 1, { panel: true });
    m.puntosBotiquin.push(V(-8, 0, -13), V(14, 0, -6), V(-22, 0, 5), V(28, 0, 9), V(0, 0, 21));
  },
};

/** Tejado a dos aguas (prisma). La cumbrera va a lo largo de Z si ejeZ, si no a lo largo de X. */
function tejado(m, x, z, w, d, y, alto, ejeZ, mat = 'tejado', vuelo = 0.5) {
  const span = (ejeZ ? w : d) / 2 + vuelo, largo = (ejeZ ? d : w) + vuelo * 2;
  const forma = new THREE.Shape();
  forma.moveTo(-span, 0); forma.lineTo(span, 0); forma.lineTo(0, alto); forma.closePath();
  const geo = new THREE.ExtrudeGeometry(forma, { depth: largo, bevelEnabled: false });
  geo.translate(0, 0, -largo / 2);
  m.agregar(geo, matriz(x, y, z, ejeZ ? 0 : Math.PI / 2), mat);
}

function granero(m, x, z) {
  const w = 14, d = 18, h = 6.2;
  m.caja(x, 0, z, w, h, d, 'maderaRoja', { superficie: 'madera' });
  // hastiales triangulares (mismo material que las paredes) y tejado
  tejado(m, x, z, w - 0.02, d - 0.02, h, 3.8, true, 'maderaRoja', 0);
  tejado(m, x, z, w, d, h + 0.02, 3.9, true, 'tejado', 0.6);
  // portón con cruces blancas en la fachada este, ventanuco del pajar y lámpara
  const fx = x + w / 2 + 0.04;
  m.agregar(G.caja, matriz(fx, 2.2, z, 0, 0, 0, 0.08, 4.4, 5.2), 'madera');
  for (const s of [-1, 1]) {
    m.agregar(G.caja, matriz(fx + 0.06, 2.2, z + s * 1.3, 0, 0, 0, 0.06, 4.2, 0.18), 'yesoBlanco', { detalle: 1 });
    m.agregar(G.caja, matriz(fx + 0.06, 2.2, z + s * 1.3, 0, 1.02 * s, 0, 0.06, 0.16, 4.8), 'yesoBlanco', { detalle: 1 });
  }
  m.agregar(G.plano, matriz(fx + 0.02, 7.4, z, Math.PI / 2, 0, 0, 1.6, 1.4, 1), 'ventanaLuz', { sombra: false });
  m.agregar(G.caja, matriz(fx + 0.25, 4.9, z, 0, 0, 0, 0.5, 0.18, 0.4), 'bombilla', { sombra: false });
  m.candidatosLuz.push({ tipo: 'farola', pos: V(fx + 0.6, 4.7, z), apunta: V(fx + 7, 0, z), color: new THREE.Color(0xffc27a), intensidad: 45, parpadeo: 0, fase: 0 });
  m.rotulo({ x, z, w, d }, 's', 9, 4.6, 7);
}

function casa(m, x, z) {
  const w = 12, d = 10, h = 5.6;
  const e = { x, z, w, d };
  m.caja(x, 0, z, w, h, d, 'yesoBlanco', { superficie: 'madera' });
  tejado(m, x, z, w, d, h, 3.2, false, 'tejado', 0.6);
  tejado(m, x, z, w - 0.02, d - 0.02, h, 3.1, false, 'yesoBlanco', 0);
  for (const lado of ['n', 's', 'e', 'w']) {
    const L = lado === 'n' || lado === 's' ? w : d;
    for (const u of [-L * 0.3, L * 0.3]) for (const v of [1.6, 4.1]) {
      if (lado === 's' && v < 2 && u > 0) continue;
      m.fachada(e, lado, u, v, 1.1, 1.4, 0.02, m.rnd() < 0.45 ? 'ventanaLuz' : 'cristalOscuro', { plano: true, sombra: false });
      m.fachada(e, lado, u, v, 1.4, 1.7, 0.06, 'madera', { detalle: 1 });
    }
  }
  m.fachada(e, 's', w * 0.3, 1.15, 1.1, 2.3, 0.06, 'madera');
  // porche
  m.acera(x, z + d / 2 + 1.4, w, 2.8, 0.36, 'madera');
  m.agregar(G.caja, matriz(x, 3.0, z + d / 2 + 1.5, 0, 0.18, 0, w + 0.4, 0.12, 3.2), 'tejado');
  for (const px of [-w / 2 + 0.3, 0, w / 2 - 0.3]) m.caja(x + px, 0, z + d / 2 + 2.7, 0.18, 2.9, 0.18, 'madera', { superficie: 'madera' });
  m.candidatosLuz.push({ tipo: 'farola', pos: V(x + 2, 2.7, z + d / 2 + 1.2), color: new THREE.Color(0xffb46b), intensidad: 38, parpadeo: 1, fase: 5 });
  m.agregar(G.esfera, matriz(x + 2, 2.75, z + d / 2 + 1.2, 0, 0, 0, 0.25, 0.25, 0.25), 'bombilla', { sombra: false });
  m.caja(x - 4.6, 0, z - d / 2 - 0.6, 1.2, 7.2, 1.2, 'ladrillo', { superficie: 'hormigon' });     // chimenea
}

function silo(m, x, z, r = 3, h = 13) {
  m.agregar(G.cil20, matriz(x, h / 2, z, 0, 0, 0, r * 2, h, r * 2), 'metalOxido');
  m.agregar(G.cono, matriz(x, h + r * 0.35, z, 0, 0, 0, r * 2.1, r * 0.7, r * 2.1), 'tejado');
  for (let y = 2; y < h; y += 2.5) m.agregar(G.cil20, matriz(x, y, z, 0, 0, 0, r * 2 + 0.08, 0.1, r * 2 + 0.08), 'farola', { detalle: 2 });
  m.col.agregarCentro(x, 0, z, r * 1.8, h, r * 1.8, { superficie: 'metal' });
}

function cobertizo(m, x, z) {
  const w = 9, d = 6, h = 3.8;
  m.caja(x, 0, z, w, h, d, 'madera', { superficie: 'madera' });
  m.agregar(G.caja, matriz(x, h + 0.3, z + 0.4, 0, -0.12, 0, w + 0.8, 0.12, d + 1.6), 'tejado');
  m.agregar(G.plano, matriz(x - w / 2 - 0.02, 1.8, z - 1.6, -Math.PI / 2, 0, 0, 1, 0.8, 1), 'ventanaLuz', { sombra: false });
  for (let i = 0; i < 3; i++) m.cajaMadera(x - 3 + i * 1.05, z - d / 2 - 0.8, 0, 0.9);
}

/** Molino de viento de chapa sobre torre de celosía (decorativo, con base sólida). */
function molino(m, x, z) {
  const h = 11;
  for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const a = V(x + px * 1.4, 0, z + pz * 1.4), b = V(x + px * 0.25, h, z + pz * 0.25);
    const dir = b.clone().sub(a), L = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize());
    m.agregar(G.cil8, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(0.12, L, 0.12)), 'metalOxido');
  }
  for (let y = 2; y < h; y += 2.2) { const k = 1.4 - (y / h) * 1.15; m.agregar(G.caja, matriz(x, y, z, 0.785, 0, 0, k * 2.8, 0.06, 0.06), 'metalOxido', { detalle: 1 }); m.agregar(G.caja, matriz(x, y, z, -0.785, 0, 0, k * 2.8, 0.06, 0.06), 'metalOxido', { detalle: 1 }); }
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    m.agregar(G.caja, matriz(x + Math.cos(a) * 1.3, h + 0.6 + Math.sin(a) * 1.3, z + 0.5, 0, 0, a, 2.4, 0.4, 0.03), 'metalOxido', { detalle: 1 });
  }
  m.agregar(G.caja, matriz(x, h + 0.6, z - 1.2, 0, 0, 0, 0.1, 1.2, 2.2), 'metalOxido');
  m.col.agregarCentro(x, 0, z, 3, h, 3, { superficie: 'metal', bloqueaVista: false });
}

function tractor(m, x, z, ry) {
  const base = matriz(x, 0, z, ry);
  const p = (geo, mm, mat, op) => m.agregar(geo, base.clone().multiply(mm), mat, op);
  p(G.caja, matriz(0.6, 1.2, 0, 0, 0, 0, 2.6, 1.0, 1.1), 'metalVerde');
  p(G.caja, matriz(-0.9, 1.55, 0, 0, 0, 0, 1.1, 0.5, 1.5), 'metalVerde');
  for (const s of [-1, 1]) {
    p(G.cil20, matriz(-1.0, 0.85, s * 1.0, 0, Math.PI / 2, 0, 1.7, 0.5, 1.7), 'neumatico');
    p(G.cil12, matriz(1.4, 0.48, s * 0.8, 0, Math.PI / 2, 0, 0.95, 0.32, 0.95), 'neumatico');
    p(G.cil8, matriz(-1.3, 2.5, s * 0.6, 0, 0, 0, 0.06, 1.8, 0.06), 'farola');
  }
  p(G.caja, matriz(-0.9, 3.4, 0, 0, 0, 0, 1.4, 0.08, 1.4), 'metalVerde');
  p(G.cil8, matriz(1.5, 2.1, 0.35, 0, 0, 0, 0.12, 1.4, 0.12), 'metalOxido');
  p(G.caja, matriz(-1.6, 2.0, 0, 0, 0, 0, 0.04, 0.5, 0.6), 'cristalOscuro', { sombra: false });
  m.colisionGirada(x, 0, z, 4.2, 2.0, 2.4, ry, { superficie: 'metal' });
}

function balaRedonda(m, x, z, ry) {
  m.agregar(G.cil20, matriz(x, 0.75, z, ry, 0, Math.PI / 2, 1.5, 1.2, 1.5), 'paja');
  m.colisionGirada(x, 0, z, 1.25, 1.45, 1.45, ry, { superficie: 'tierra' });
}

function balasCuadradas(m, x, z, ry, n) {
  const c = Math.cos(ry), s = Math.sin(ry);
  for (let i = 0; i < n; i++) m.caja(x + c * (i * 1.25), 0, z - s * (i * 1.25), 1.2, 0.55, 0.6, 'paja', { ry, superficie: 'tierra' });
  if (n > 1) m.caja(x + c * 0.6, 0.55, z - s * 0.6, 1.2, 0.55, 0.6, 'paja', { ry: ry + 0.15, superficie: 'tierra' });
}

function hoguera(m, x, z) {
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; m.agregar(G.dodeca, matriz(x + Math.cos(a) * 0.9, 0.12, z + Math.sin(a) * 0.9, a, 0.3, 0, 0.35, 0.25, 0.3), 'hormigon'); }
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; m.agregar(G.cil8, matriz(x + Math.cos(a) * 0.3, 0.25, z + Math.sin(a) * 0.3, -a, 0, 1.2, 0.16, 1.1, 0.16), 'corteza'); }
  m.col.agregarCentro(x, 0, z, 2, 0.4, 2, { superficie: 'tierra' });
  m.fuego(V(x, 0.4, z), 1.1, 'hoguera');
  for (const [px, pz, ry] of [[2.6, 0.4, 0.2], [-2.4, 1.2, -0.5], [0.4, -2.6, 1.4]])
    { m.agregar(G.cil12, matriz(x + px, 0.25, z + pz, ry, 0, Math.PI / 2, 0.5, 2.2, 0.5), 'corteza'); m.colisionGirada(x + px, 0, z + pz, 2.2, 0.45, 0.5, ry, { superficie: 'madera' }); }
}

function abrevadero(m, x, z) {
  m.caja(x, 0, z, 3, 0.7, 1, 'metalOxido', { superficie: 'metal' });
  m.agregar(G.caja, matriz(x, 0.66, z, 0, 0, 0, 2.8, 0.02, 0.8), 'charco', { sombra: false });
}

/** Cerca de madera (postes + dos travesaños) entre dos puntos. Bloquea el paso, no la vista. */
function cerca(m, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
  if (L < 0.5) return;
  const ry = Math.atan2(-dz, dx), n = Math.max(1, Math.round(L / 2.2));
  for (let i = 0; i <= n; i++) m.agregar(G.caja, matriz(x0 + dx * i / n, 0.65, z0 + dz * i / n, ry, 0, 0, 0.14, 1.3, 0.14), 'madera');
  for (const y of [0.55, 1.05]) m.agregar(G.caja, matriz((x0 + x1) / 2, y, (z0 + z1) / 2, ry, 0, 0, L, 0.12, 0.05), 'madera', { detalle: y > 1 ? 1 : 0 });
  m.colisionGirada((x0 + x1) / 2, 0, (z0 + z1) / 2, L, 1.2, 0.2, ry, { superficie: 'madera', bloqueaVista: false });
}

/** Maizal: hileras de cañas con hojas cruzadas. Sin colisión: se puede atravesar (y los zombis también). */
function maizal(m, x0, x1, z0, z1) {
  const rnd = m.rnd;
  let fila = 0;
  for (let x = x0; x <= x1; x += 1.25, fila++) {
    for (let z = z0; z <= z1; z += 0.95) {
      const px = x + (rnd() - 0.5) * 0.35, pz = z + (rnd() - 0.5) * 0.35, h = 1.8 + rnd() * 0.8;
      const det = fila % 3 === 0 ? 0 : fila % 3 === 1 ? 1 : 2;
      m.agregar(G.cil8, matriz(px, h / 2, pz, 0, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.1, 0.05, h, 0.05), 'corteza', { detalle: det, sombra: false });
      const a = rnd() * Math.PI;
      for (let k = 0; k < 2; k++) m.agregar(G.plano, matriz(px, h * 0.62, pz, a + k * Math.PI / 2, 0, (rnd() - 0.5) * 0.4, 0.9, h * 0.75, 1), 'maiz', { detalle: det, sombra: det === 0 });
    }
  }
}

function alamo(m, x, z, h) {
  m.agregar(G.cil8, matriz(x, h * 0.25, z, 0, 0, 0, 0.35, h * 0.5, 0.35), 'corteza', { detalle: 0 });
  m.agregar(G.cono, matriz(x, h * 0.62, z, m.rnd() * 3, 0, 0, 2.6, h * 0.8, 2.6), 'follaje', { detalle: 0 });
  m.col.agregarCentro(x, 0, z, 0.4, h, 0.4, { superficie: 'madera' });
}

/** Poste de la luz de madera con lámpara de brazo. */
function postePalo(m, x, z, op = {}) {
  m.agregar(G.cil8, matriz(x, 3.7, z, 0, 0, 0, 0.26, 7.4, 0.26), 'corteza');
  m.agregar(G.caja, matriz(x, 7.0, z, 0, 0, 0, 1.6, 0.12, 0.12), 'madera');
  m.col.agregarCentro(x, 0, z, 0.3, 7.4, 0.3, { superficie: 'madera' });
  m.agregar(G.caja, matriz(x + 0.5, 6.4, z, 0, 0, 0, 0.9, 0.08, 0.08), 'farola');
  m.agregar(G.cono, matriz(x + 0.9, 6.25, z, 0, 0, 0, 0.5, 0.3, 0.5), 'farola');
  m.agregar(G.esfera, matriz(x + 0.9, 6.08, z, 0, 0, 0, 0.18, 0.12, 0.18), op.rota ? 'bombillaRota' : 'bombilla', { sombra: false });
  if (!op.rota) m.candidatosLuz.push({ tipo: 'farola', pos: V(x + 0.9, 5.95, z), color: new THREE.Color(0xffb46b), intensidad: 50, parpadeo: op.parpadea ? 1 : 0, fase: m.rnd() * 10 });
}
