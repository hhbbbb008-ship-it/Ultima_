import * as THREE from 'three';
import { G, V, matriz } from '../Mundo.js';

/**
 * Mapa 2 — "Hospital San Judas": el aparcamiento de urgencias convertido en
 * hospital de campaña militar. Tiendas de triaje en el centro, ambulancias,
 * un helicóptero estrellado ardiendo y un aparcamiento lleno de coches.
 * Los infectados llegan desde la verja sur… y salen por las puertas del hospital.
 */
export const HospitalSanJudas = {
  id: 'hospital', nombre: 'Hospital San Judas', semilla: 31,
  desc: 'Hospital de campaña en el patio de urgencias. Los infectados salen también por las puertas del propio hospital.',
  dificultad: 'Alta', limite: 48,
  inicio: { x: 0, z: 12, yaw: 0 },
  charcos: [[-8, 10, 1.6], [10, -4, 1.3], [-21, 1, 1.5], [4, 26, 1.8], [24, 4, 1.2], [-28, 24, 1.4], [16, -18, 1.1]],
  luna: [0.5, 0.5, -0.7],
  camaraMenu(cam, t) {
    cam.position.set(Math.sin(t) * 22, 4.5 + Math.sin(t * 0.6) * 0.8, 8 + Math.cos(t) * 16);
    cam.lookAt(Math.sin(t + 1) * 5, 3, -14);
  },

  construir(m) {
    m.terreno('tierra');
    m.losa(0, 4, 92, 84, 'asfalto', -0.018);
    m.acera(0, -24.4, 64, 3.2);                         // acera ante la fachada
    // marcas del aparcamiento
    for (let i = 0; i < 7; i++) {
      const x = -38 + i * 4.2;
      for (const z of [22, 31]) m.agregar(G.caja, matriz(x, 0.012, z, 0, 0, 0, 0.12, 0.004, 4.6), 'pinturaVial', { sombra: false });
    }
    for (let x = -30; x <= 30; x += 4) m.agregar(G.caja, matriz(x, 0.012, 15, 0, 0, 0, 2, 0.004, 0.15), 'pinturaVial', { sombra: false });

    // --- edificios del hospital ---
    const hosp = { x: 0, z: -34, w: 64, d: 16, h: 15, mat: 'yesoBlanco', frente: 's', sinComercio: true, luces: 0.08, matPretil: 'hormigon' };
    m.edificio(hosp);
    m.rotulo(hosp, 's', 6, 12.4, 12);
    m.edificio({ x: 36, z: -10, w: 12, d: 22, h: 12, mat: 'yesoBlanco', frente: 'w', sinComercio: true, luces: 0.12 });
    m.edificio({ x: -36.5, z: -14, w: 11, d: 18, h: 9, mat: 'ladrillo', frente: 'e', sinComercio: true, luces: 0.1 });
    // puertas: vestíbulo iluminado y entrada de urgencias
    m.agregar(G.plano, matriz(10, 1.5, -25.97, 0, 0, 0, 6, 3, 1), 'ventanaLuz', { sombra: false });
    m.agregar(G.caja, matriz(10, 3.2, -25.9, 0, 0, 0, 6.6, 0.25, 0.2), 'hormigon');
    m.agregar(G.plano, matriz(-14, 1.3, -25.97, 0, 0, 0, 4, 2.6, 1), 'ventanaFria', { sombra: false });
    // marquesina de urgencias
    for (const x of [-19.5, -8.5]) m.caja(x, 0, -19.6, 0.5, 4, 0.5, 'hormigon');
    m.agregar(G.caja, matriz(-14, 4.2, -22.6, 0, 0, 0, 12.4, 0.45, 7.4), 'yesoBlanco');
    m.rotulo({ x: -14, z: -22.6, w: 12.4, d: 7.4 }, 's', 7, 5.0, 5.5);
    m.candidatosLuz.push({ tipo: 'farola', pos: V(-14, 3.9, -21.5), color: new THREE.Color(0xdfeeff), intensidad: 45, parpadeo: 1, fase: 1 });
    m.camion(-18, -13.5, Math.PI / 2 + 0.12, 'ambulancia', 'ambulancia', { largo: 6.2, alto: 2.8, ancho: 2.3 });
    franjaAmbulancia(m, -18, -13.5, Math.PI / 2 + 0.12);
    m.camion(-8.5, -14, Math.PI / 2 - 0.35, 'ambulancia', 'cocheQuemado', { largo: 6.2, alto: 2.8, ancho: 2.3, quemado: true });

    // --- hospital de campaña: tiendas de triaje, camillas y suministros ---
    tienda(m, -9, -8, 0, 6, 4.5);
    tienda(m, 9, -8, 0, 6, 4.5);
    tienda(m, -16, 4, Math.PI / 2, 5.5, 4.2, 'lonaBlanca');
    tienda(m, 16, 4, Math.PI / 2, 5.5, 4.2, 'lonaBlanca');
    for (const [x, z, ry] of [[-3, -2, 0.2], [3.5, 1, -0.4], [-2, 6, 1.4], [5, -14, 0.1], [-4.5, -14.5, -0.1]]) camilla(m, x, z, ry);
    for (const [x, z] of [[1, -4], [12, 9], [-12, 10]]) { m.caja(x, 0, z, 1.0, 0.55, 0.7, 'metalVerde', { superficie: 'metal' }); m.caja(x + 0.1, 0.55, z, 0.8, 0.4, 0.6, 'metalVerde', { superficie: 'metal' }); }
    m.muroSacos(-4, 12, 5, false, 3);
    m.muroSacos(6, 12.5, 4, false, 3);
    m.muroSacos(21, -4, 5, true, 3);
    m.muroSacos(-22, -6, 4, true, 3);

    // --- helipuerto con helicóptero estrellado ---
    helipuerto(m, 24, 21);
    helicoptero(m, 26, 23, -0.6);

    // --- aparcamiento ---
    const coches = [[-36, 22, Math.PI / 2, 'cocheRojo'], [-31.6, 22.4, Math.PI / 2 + 0.1, 'cocheBlanco'], [-23, 21.6, Math.PI / 2, 'cocheAzul'], [-14.6, 22, Math.PI / 2 - 0.1, 'cocheVerde'],
      [-27.4, 31, Math.PI / 2, null, true], [-35.8, 31.4, Math.PI / 2 + 0.05, 'cocheAzul'], [-18.8, 31, Math.PI / 2, 'cocheBlanco'], [-6, 27, 0.6, 'cocheRojo'], [10, 34, -0.2, 'cocheBlanco']];
    for (const [x, z, ry, mat, q] of coches) m.coche(x, z, ry, mat, q);

    // --- perímetro: verja sur con portón, muro oeste y verja este ---
    m.limiteJugador(42.5);
    m.vallaSolida(-23.5, 42, 37, 0, true);
    m.vallaSolida(23.5, 42, 37, 0, true);
    for (const x of [-4, 4]) m.barreraJersey(x, 39.5, 0.1 * x);
    m.caja(8, 0, 38.6, 2.4, 2.6, 2.4, 'yesoBlanco', { superficie: 'hormigon' });          // garita
    m.agregar(G.caja, matriz(8, 2.75, 38.6, 0, 0, 0, 3, 0.3, 3), 'metalRojo');
    m.agregar(G.plano, matriz(8, 1.6, 37.38, Math.PI, 0, 0, 1.6, 0.9, 1), 'ventanaFria', { sombra: false });
    for (let z = -2; z <= 38; z += 10) if (z !== 18) m.caja(-42.4, 0, z, 0.5, 2.6, 9.2, 'ladrillo', { superficie: 'hormigon' });
    m.vallaSolida(42, 22, 38, Math.PI / 2, true);

    // --- iluminación: torres de focos, farolas y fuegos ---
    m.torreFocos(-20, -2, 0, -4);
    m.torreFocos(20, -2, 4, 2, { parpadea: true });
    m.torreFocos(2, 22, 0, 6);
    m.torreFocos(-30, 36, -24, 26, { rota: true });
    for (const [x, z, ry, op] of [[-30, -21.5, 0, {}], [24, -21.5, 0, { parpadea: true }], [-38, 12, Math.PI / 2, {}], [38, 30, -Math.PI / 2, { rota: true }], [-4, 34, Math.PI, {}]])
      m.farola(x, z, ry, op);
    m.barril(-1.5, 9, true);
    m.barril(13, 15, true);
    m.barril(13.7, 15.6, false);
    m.arbolMuerto(-38, 4, 5.5);
    m.arbolMuerto(34, 38, 5);
    m.escombros(110, 40, (x, z) => z < -25);
    m.cable(V(-19.5, 4, -19.6), V(-20, 7, -2), 0.8);

    // --- zombis: verja, muro, callejones entre edificios y puertas del hospital ---
    for (const [x, z] of [[0, 46], [-20, 46], [22, 46], [46, 12], [46, 32], [-46, 18], [-46, 36], [45, -23.5], [-45, -24.5], [10, -24.2], [-14, -23.5]])
      m.aparicion.push(V(x, 0, z));

    // --- compras ---
    m.estacion('pistola', 250, -4, 1.6, -25.74, 0, 1);
    m.estacion('toro', 600, 22, 1.6, -25.74, 0, 1);
    m.estacion('botiquin', 750, -26, 1.6, -25.74, 0, 1);
    m.estacion('subfusil', 1000, 29.94, 1.6, -6, -1, 0);
    m.estacion('fusil', 2000, 29.94, 1.6, -15, -1, 0);
    m.estacion('escopeta', 1250, -30.94, 1.6, -9, 1, 0);
    m.estacion('martillo', 1750, -30.94, 1.6, -18, 1, 0);
    m.estacion('recortada', 900, -2, 1.2, 31, 0, -1, { panel: true });
    m.estacion('halcon', 1500, 35, 1.2, 8, -1, 0, { panel: true });
    m.puntosBotiquin.push(V(0, 0, -1), V(-12, 0, 12), V(18, 0, -13), V(-25, 0, 16), V(30, 0, 32));
  },
};

/** Tienda militar: paredes bajas y tejado a dos aguas (cubre y bloquea el paso). */
function tienda(m, x, z, ry, w = 6, d = 4.5, mat = 'lona') {
  const muro = 1.5, techo = 1.4;
  m.caja(x, 0, z, w, muro, d, mat, { ry, superficie: 'tierra' });
  const forma = new THREE.Shape();
  forma.moveTo(-d / 2 - 0.15, 0); forma.lineTo(d / 2 + 0.15, 0); forma.lineTo(0, techo); forma.closePath();
  const geo = new THREE.ExtrudeGeometry(forma, { depth: w + 0.2, bevelEnabled: false });
  geo.translate(0, 0, -(w + 0.2) / 2);
  m.agregar(geo, matriz(x, muro, z, ry + Math.PI / 2), mat);
  m.colisionGirada(x, 0, z, w, muro + techo, d, ry, { superficie: 'tierra' });
  // cruz roja sobre el faldón y entrada enrollada
  const c = Math.cos(ry), s = Math.sin(ry);
  for (const k of [-1, 1]) {
    const px = x - s * k * (d / 2 + 0.01), pz = z - c * k * (d / 2 + 0.01);
    m.agregar(G.caja, matriz(px, 0.85, pz, ry, 0, 0, 0.9, 0.25, 0.02), 'cruzRoja', { sombra: false });
    m.agregar(G.caja, matriz(px, 0.85, pz, ry, 0, 0, 0.25, 0.9, 0.02), 'cruzRoja', { sombra: false });
  }
  m.agregar(G.cil8, matriz(x + c * (w / 2 + 0.02), muro + 0.1, z - s * (w / 2 + 0.02), ry, 0, Math.PI / 2, 0.35, d * 0.6, 0.35), mat, { detalle: 1 });
}

function camilla(m, x, z, ry) {
  m.caja(x, 0.62, z, 1.95, 0.14, 0.66, 'lonaBlanca', { ry, superficie: 'madera' });
  const c = Math.cos(ry), s = Math.sin(ry);
  for (const [a, b] of [[-0.85, -0.28], [0.85, -0.28], [-0.85, 0.28], [0.85, 0.28]])
    m.agregar(G.cil8, matriz(x + c * a + s * b, 0.31, z - s * a + c * b, 0, 0, 0, 0.04, 0.62, 0.04), 'farola', { detalle: 1 });
  m.colisionGirada(x, 0, z, 1.95, 0.76, 0.66, ry, { superficie: 'metal' });
}

function franjaAmbulancia(m, x, z, ry) {
  const base = matriz(x, 0, z, ry);
  for (const s of [-1, 1]) m.agregar(G.caja, base.clone().multiply(matriz(0.4, 1.7, s * 1.16, 0, 0, 0, 5.2, 0.28, 0.02)), 'cruzRoja', { sombra: false });
  m.agregar(G.caja, base.clone().multiply(matriz(-2.0, 2.65, 0, 0, 0, 0, 0.3, 0.15, 1.2)), 'faroAzul', { sombra: false });
}

function helipuerto(m, x, z) {
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2;
    m.agregar(G.caja, matriz(x + Math.cos(a) * 7, 0.012, z + Math.sin(a) * 7, -a, 0, 0, 0.3, 0.004, 1.4), 'pinturaVial', { sombra: false });
  }
  for (const k of [-1.4, 1.4]) m.agregar(G.caja, matriz(x + k, 0.013, z, 0, 0, 0, 0.5, 0.004, 4.4), 'pinturaVial', { sombra: false });
  m.agregar(G.caja, matriz(x, 0.013, z, 0, 0, 0, 2.6, 0.004, 0.5), 'pinturaVial', { sombra: false });
}

/** Helicóptero militar estrellado (fuselaje, cola partida, rotor doblado, patines) en llamas. */
function helicoptero(m, x, z, ry) {
  const base = matriz(x, 0, z, ry);
  const pieza = (geo, mm, mat, op) => m.agregar(geo, base.clone().multiply(mm), mat, op);
  pieza(G.esfera, matriz(0, 1.25, 0, 0, 0, 0.12, 6, 2.3, 2.5), 'pinturaHeli');
  pieza(G.esfera, matriz(2.4, 1.45, 0, 0, 0, 0.2, 1.8, 1.4, 1.9), 'cristalOscuro', { sombra: false });
  pieza(G.cil12, matriz(-4.6, 1.35, 0.4, 0.25, 0, Math.PI / 2 + 0.08, 0.55, 4.2, 0.55), 'pinturaHeli');
  pieza(G.caja, matriz(-7.2, 1.8, 1.0, 0.25, 0, 0.3, 0.9, 1.4, 0.12), 'pinturaHeli');
  pieza(G.caja, matriz(0, 2.6, 0, 0, 0, 0, 1.6, 0.5, 1.0), 'pinturaHeli');
  for (const [a, inc] of [[0.3, 0.15], [1.9, -0.35], [3.5, 0.5], [5.0, -0.1]])
    pieza(G.caja, matriz(Math.cos(a) * 2.6, 2.9 + inc * 1.5, Math.sin(a) * 2.6, -a, 0, inc, 5.2, 0.05, 0.35), 'metalOxido');
  for (const s of [-1, 1]) {
    pieza(G.caja, matriz(0.2, 0.12, s * 1.1, 0, 0, s * 0.1, 4.2, 0.1, 0.12), 'farola');
    for (const k of [-1, 1]) pieza(G.caja, matriz(k * 1.1, 0.35, s * 1.0, 0, 0, 0, 0.08, 0.5, 0.08), 'farola', { detalle: 1 });
  }
  m.colisionGirada(x, 0, z, 6.2, 2.6, 2.6, ry, { superficie: 'metal' });
  const c = Math.cos(ry), s = Math.sin(ry);
  m.colisionGirada(x - c * 4.6, 0, z + s * 4.6, 4.2, 1.6, 0.8, ry, { superficie: 'metal' });
  m.fuego(V(x + c * 0.5, 2.2, z - s * 0.5), 1.8, 'heli');
}
