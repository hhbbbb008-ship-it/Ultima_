import * as THREE from 'three';
import { G, V, matriz } from '../Mundo.js';

/**
 * Mapa 3 — "Ruta 9": una autopista colapsada. Atasco de coches abandonados,
 * un tráiler cruzado, un autobús, la plaza de peaje y un paso elevado que deja
 * una franja en penumbra. A los lados, un motel de carretera y un taller.
 * Largas líneas de tiro a lo largo de la calzada; los zombis llegan por ambos extremos.
 */
export const Ruta9 = {
  id: 'autopista', nombre: 'Ruta 9', semilla: 99,
  desc: 'Atasco eterno entre el peaje y el paso elevado. Largas líneas de tiro y coches como cobertura.',
  dificultad: 'Media', limite: 48,
  inicio: { x: 4, z: 4, yaw: 0 },
  charcos: [[-6, -2, 1.6], [8, 10, 1.4], [-3, 24, 2.0], [10, -24, 1.3], [-30, -14, 1.4], [28, -8, 1.2], [3, 36, 1.5]],
  luna: [-0.6, 0.45, 0.6],
  camaraMenu(cam, t) {
    cam.position.set(8 + Math.sin(t) * 6, 3 + Math.sin(t * 0.5), 34 - (t * 6 % 60));
    cam.lookAt(0, 2.5, cam.position.z - 20);
  },

  construir(m) {
    m.terreno('tierra');
    // calzada: 6 carriles con mediana, arcenes y marcas
    m.losa(0, 0, 32, 120, 'asfalto', -0.018);
    for (const x of [-15.6, 15.6]) m.acera(x, 0, 1.2, 120, 0.18, 'hormigon');
    for (const x of [-10, -5, 5, 10]) for (let z = -46; z <= 46; z += 6) m.agregar(G.caja, matriz(x, 0.012, z, 0, 0, 0, 0.15, 0.004, 3), 'pinturaVial', { sombra: false });
    for (const x of [-14.6, -1.2, 1.2, 14.6]) m.agregar(G.caja, matriz(x, 0.012, 0, 0, 0, 0, 0.15, 0.004, 110), 'pinturaVial', { sombra: false });
    // mediana de barreras con huecos para cruzar
    for (let z = -44; z <= 44; z += 2.1) {
      if ((z > -23 && z < -17) || (z > 1 && z < 7) || (z > 25 && z < 31)) continue;
      m.barreraJersey(0, z, Math.PI / 2 + (m.rnd() - 0.5) * 0.04);
    }

    pasoElevado(m, 20);
    peaje(m, -14);

    // --- atasco ---
    const coches = [[-12.5, 30, 0.1, 'cocheRojo'], [-7.6, 34, -0.2, 'cocheBlanco'], [-12, 38, 0.3, 'cocheAzul'], [-7, 12, 0.05, 'cocheVerde'], [-12.4, 6, -0.15, null, true],
      [-3.4, -4, 0.4, 'cocheBlanco'], [-7.8, -28, -0.1, 'cocheAzul'], [-12.5, -36, 0.2, 'cocheRojo'], [7.5, 8, Math.PI + 0.12, 'cocheAzul'], [12.4, 14, Math.PI - 0.2, 'cocheBlanco'],
      [3.6, 26, Math.PI + 0.5, null, true], [12, -2, Math.PI - 0.05, 'cocheRojo'], [7.2, -6, Math.PI + 0.25, 'cocheVerde'], [12.6, -40, Math.PI, 'cocheBlanco'], [3.4, -38, Math.PI - 0.35, 'cocheAzul']];
    for (const [x, z, ry, mat, q] of coches) m.coche(x, z, ry, mat, q);
    m.camion(6, -29, 0.65, 'metalRojo', 'cocheBlanco', { largo: 11, alto: 3.4, ancho: 2.5 });     // tráiler cruzado
    m.camion(-8, 22.4, -Math.PI / 2 + 0.08, 'metalAmarillo', 'metalAmarillo', { largo: 10, alto: 3, ancho: 2.5 });  // autobús
    ventanillasBus(m, -8, 22.4, -Math.PI / 2 + 0.08);

    // --- motel de carretera (oeste) ---
    m.losa(-30, -6, 22, 32, 'asfalto', -0.018, { global: false });
    m.edificio({ x: -31, z: -6, w: 14, d: 12, h: 7, mat: 'yesoRosa', frente: 'e', letrero: 4, toldo: 'metalRojo' });
    for (const [x, z, ry, mat] of [[-21.5, -18, Math.PI / 2, 'cocheBlanco'], [-21.6, 8, Math.PI / 2 + 0.2, 'cocheVerde']]) m.coche(x, z, ry, mat);
    cartel(m, -26, 24, Math.PI / 2 - 0.2);
    for (const [x, z, h] of [[-38, 20, 6], [-34, 36, 5], [-40, -30, 5.5], [-22, -38, 4.8], [36, 36, 5.5], [40, 14, 6]]) m.arbolMuerto(x, z, h);

    // --- taller y contenedores (este) ---
    m.losa(31, -14, 22, 36, 'hormigon', -0.018, { global: false });
    m.edificio({ x: 32, z: -22, w: 16, d: 14, h: 8, mat: 'hormigon', frente: 'w', letrero: 2, garaje: true, luces: 0.05 });
    m.contenedorMaritimo(30, 2, 0, 'metalRojo');
    m.contenedorMaritimo(30, 5.2, 0, 'metalAzul');
    m.contenedorMaritimo(30, 2, 0, 'metalVerde', 2.6);
    m.contenedorMaritimo(36, 14, Math.PI / 2 + 0.1, 'metalAzul');
    m.agregar(G.cono, matriz(24, 1.2, 22, 0, 0, 0, 6, 2.4, 5), 'tierra');
    m.col.agregarCentro(24, 0, 22, 4.2, 1.6, 3.4, { superficie: 'tierra' });
    for (const [x, z] of [[22, -6], [22.6, -5.2], [21.8, -4.6]]) m.barril(x, z, x === 22);

    // --- iluminación ---
    for (const z of [-38, -2, 36]) { m.farola(0, z, Math.PI / 2, { alto: 8 }); m.farola(0, z + 0.01, -Math.PI / 2, { alto: 8, parpadea: z === -2 }); }
    for (const [x, z, ry, op] of [[-17.5, -26, Math.PI / 2, {}], [17.5, 30, -Math.PI / 2, { rota: true }], [-17.5, 10, Math.PI / 2, { parpadea: true }], [17.5, -10, -Math.PI / 2, {}]])
      m.farola(x, z, ry, op);
    m.torreFocos(26, -6, 18, -14);
    m.barril(-16, -8, true);
    m.barril(16.6, 24, true);
    m.escombros(120, 42, (x, z) => Math.abs(x) > 34 && Math.abs(z) > 30);

    // --- límites y aparición ---
    m.limiteJugador(42.5);
    for (const s of [-1, 1]) {
      m.vallaSolida(-30, s * 42, 24, 0, true);
      m.vallaSolida(30, s * 42, 24, 0, true);
    }
    for (const [x, z] of [[0, 46], [-9, 46], [9, 46], [0, -46], [-9, -46], [9, -46], [-46, -30], [46, 8], [-46, 30], [46, -38]])
      m.aparicion.push(V(x, 0, z));

    // --- compras ---
    m.estacion('pistola', 250, -23.94, 1.6, -9.5, 1, 0);
    m.estacion('botiquin', 750, -23.94, 1.6, -2.5, 1, 0);
    m.estacion('subfusil', 1000, 23.94, 1.6, -17, -1, 0);
    m.estacion('fusil', 2000, 23.94, 1.6, -27, -1, 0);
    m.estacion('escopeta', 1250, -17.4, 1.2, 0, 1, 0, { panel: true });
    m.estacion('martillo', 1750, 17.4, 1.2, -3, -1, 0, { panel: true });
    m.estacion('recortada', 900, -17.4, 1.2, -32, 1, 0, { panel: true });
    m.estacion('toro', 600, 17.4, 1.2, 33, -1, 0, { panel: true });
    m.estacion('halcon', 1500, -36, 1.2, 12, 1, 0, { panel: true });
    m.puntosBotiquin.push(V(-20, 0, 4), V(20, 0, 10), V(3, 0, -14), V(-4, 0, 31), V(10, 0, -36));
  },
};

/** Paso elevado este-oeste sobre la autopista, apoyado en pilas. */
function pasoElevado(m, zc) {
  const ancho = 12;
  m.agregar(G.caja, matriz(0, 7.0, zc, 0, 0, 0, 100, 1.0, ancho), 'hormigon', { global: true });
  for (const s of [-1, 1]) {
    m.agregar(G.caja, matriz(0, 8.0, zc + s * (ancho / 2 - 0.2), 0, 0, 0, 100, 1.0, 0.35), 'hormigon', { global: true });
    m.agregar(G.caja, matriz(0, 6.2, zc + s * (ancho / 2 - 1.2), 0, 0, 0, 100, 0.6, 0.6), 'hormigon', { global: true });
  }
  for (const x of [-17.5, 0, 17.5]) {
    m.caja(x, 0, zc, x === 0 ? 1.4 : 1.8, 6.5, ancho * 0.7, 'hormigon', { superficie: 'hormigon' });
    m.agregar(G.caja, matriz(x, 6.3, zc, 0, 0, 0, 2.6, 0.5, ancho), 'hormigon');
  }
  // luces bajo el puente
  for (const x of [-9, 9]) {
    m.agregar(G.caja, matriz(x, 6.45, zc, 0, 0, 0, 1.2, 0.08, 0.3), x > 0 ? 'bombillaRota' : 'bombilla', { sombra: false });
    if (x < 0) m.candidatosLuz.push({ tipo: 'farola', pos: V(x, 6.3, zc), color: new THREE.Color(0xffd9a0), intensidad: 34, parpadeo: 1, fase: 2 });
  }
  // farolas del propio puente (siluetas sobre la calzada)
  for (const x of [-30, 30]) m.agregar(G.cil8, matriz(x, 10, zc + ancho / 2 - 0.4, 0, 0, 0, 0.14, 4, 0.14), 'farola');
}

/** Plaza de peaje: casetas, marquesina con rótulo y barreras rotas. */
function peaje(m, zc) {
  for (const x of [-12.5, -7.5, -2.5, 2.5, 7.5, 12.5]) {
    if (Math.abs(x) < 1) continue;
    m.caja(x, 0, zc, 1.8, 0.25, 6, 'hormigon');
    m.caja(x, 0.25, zc, 1.5, 2.4, 2.4, 'yesoBlanco', { superficie: 'hormigon' });
    for (const s of [-1, 1]) m.agregar(G.plano, matriz(x + s * 0.76, 1.65, zc, s * Math.PI / 2, 0, 0, 1.8, 1, 1), 'ventanaFria', { sombra: false });
    m.agregar(G.cil8, matriz(x, 2.65 + 1.25, zc, 0, 0, 0, 0.3, 2.5, 0.3), 'farola');
    for (const s of [-1, 1]) m.agregar(G.cil8, matriz(x, 0.6, zc + s * 2.9, 0, 0, 0, 0.25, 1.2, 0.25), 'metalAmarillo', { detalle: 1 });
    // barrera (algunas arrancadas)
    const rota = (x * 7) % 3 === 0;
    m.agregar(G.caja, matriz(x + 0.9 + 1.4, 1.05, zc + 2.6, rota ? 0.8 : 0, 0, rota ? -0.9 : 0, 2.8, 0.08, 0.08), 'metalRojo', { detalle: 1 });
  }
  m.agregar(G.caja, matriz(0, 5.4, zc, 0, 0, 0, 33, 0.7, 8), 'tejado');
  for (const s of [-1, 1]) {
    m.rotulo({ x: 0, z: zc, w: 33, d: 8 }, s > 0 ? 's' : 'n', 8, 6.3, 7);
    for (const x of [-10, 0, 10]) {
      m.agregar(G.caja, matriz(x, 5.02, zc + s * 2.5, 0, 0, 0, 1.6, 0.05, 0.4), x === 0 && s > 0 ? 'bombillaRota' : 'ventanaFria', { sombra: false });
    }
  }
  m.candidatosLuz.push({ tipo: 'farola', pos: V(-6, 4.9, zc), color: new THREE.Color(0xd0e4ff), intensidad: 40, parpadeo: 0, fase: 0 });
  m.candidatosLuz.push({ tipo: 'farola', pos: V(8, 4.9, zc), color: new THREE.Color(0xd0e4ff), intensidad: 40, parpadeo: 1, fase: 4 });
}

function ventanillasBus(m, x, z, ry) {
  const base = matriz(x, 0, z, ry);
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++)
    m.agregar(G.caja, base.clone().multiply(matriz(-2.4 + i * 1.3 + 1.1, 2.3, s * 1.26, 0, 0, 0, 1.0, 0.7, 0.02)), i === 2 ? 'ventanaLuz' : 'cristalOscuro', { sombra: false });
}

/** Valla publicitaria sobre postes (con un foco que aún funciona). */
function cartel(m, x, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  for (const k of [-2.5, 2.5]) m.caja(x + c * k, 0, z - s * k, 0.35, 5, 0.35, 'farola', { superficie: 'metal' });
  m.agregar(G.caja, matriz(x, 6.4, z, ry, 0, 0, 8, 3, 0.25), 'madera');
  m.agregar(G.plano, matriz(x + s * 0.14, 6.4, z + c * 0.14, ry, 0, 0, 7.6, 2.6, 1), 'ventanaFria', { sombra: false });
  m.candidatosLuz.push({ tipo: 'farola', pos: V(x + s * 1.5, 8.3, z + c * 1.5), apunta: V(x, 4.5, z), color: new THREE.Color(0xfff0d0), intensidad: 30, parpadeo: 1, fase: 7 });
}
