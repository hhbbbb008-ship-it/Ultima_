import * as THREE from 'three';
import { G, V, matriz } from '../Mundo.js';

/**
 * Mapa 1 — "Barrio Cenizas": cruce de calles cercado por edificios, con un puesto
 * de control militar en el centro, gasolinera, solar vallado, parada de autobús y obras.
 * Zombis por los cuatro fines de calle y los callejones.
 */
export const BarrioCenizas = {
  id: 'barrio', nombre: 'Barrio Cenizas', semilla: 2024,
  desc: 'Un cruce de calles en ruinas. Mucha cobertura y entradas por todos lados.',
  dificultad: 'Media', limite: 48,
  inicio: { x: 0, z: 2.5, yaw: 0 },
  charcos: [[-14, 2, 1.8], [9, -3, 1.4], [0, 13, 2.2], [-1, -14, 1.6], [20, 1.5, 1.3], [-28, -1, 1.5], [1.5, 25, 1.2], [33, 3, 1.4]],
  camaraMenu(cam, t) {
    cam.position.set(Math.sin(t) * 18, 3.2 + Math.sin(t * 0.7) * 0.6, Math.cos(t) * 18);
    cam.lookAt(Math.sin(t + 1.2) * 6, 1.8, Math.cos(t + 1.2) * 6);
  },

  construir(m) {
    m.terreno('tierra');
    suelo(m);
    edificios(m);
    limites(m);
    farolas(m);
    for (const [x, z, ry, mat, q] of [[-20, -2.6, 0.06, 'cocheRojo'], [14, 3.0, Math.PI - 0.08, 'cocheAzul'], [-2.6, 18, Math.PI / 2 + 0.05, 'cocheBlanco'],
      [3.0, -22, -Math.PI / 2 + 0.1, 'cocheVerde'], [25, -3.2, 0.2, null, true], [-31, 2.8, -0.12, 'cocheBlanco'], [2.6, 31, Math.PI / 2 - 0.15, 'cocheRojo'], [-3.0, -33, -Math.PI / 2, 'cocheAzul']])
      m.coche(x, z, ry, mat, q);
    // puesto de control: sacos terreros en el centro del cruce con huecos en las diagonales
    m.muroSacos(-4.6, 0, 4, true); m.muroSacos(4.6, 0, 4, true); m.muroSacos(0, -4.6, 4, false); m.muroSacos(0, 4.6, 4, false);
    m.caja(1.2, 0, 1.4, 0.8, 0.45, 0.5, 'metalVerde', { superficie: 'metal' });
    m.caja(-1.5, 0, -1.2, 0.6, 0.35, 0.4, 'metalVerde', { superficie: 'metal' });
    gasolinera(m);
    solarNoroeste(m);
    paradaAutobus(m);
    obras(m);
    m.escombros(140, 40, (x, z) => Math.abs(x) > 30 && Math.abs(z) > 30);
    for (const z of [-9.5, 9.5]) m.cable(V(-30, 7.5, z), V(30, 7.5, z), 1.2);

    // estaciones de compra en las paredes que dan a la zona jugable
    m.estacion('pistola', 250, -29.94, 1.6, 18, 1, 0);
    m.estacion('subfusil', 1000, -17, 1.6, -29.94, 0, 1);
    m.estacion('escopeta', 1250, -17, 1.6, 29.94, 0, -1);
    m.estacion('fusil', 2000, 29.94, 1.6, -18, -1, 0);
    m.estacion('toro', 600, 34, 1.6, -29.94, 0, 1);
    m.estacion('recortada', 900, 17, 1.6, 29.94, 0, -1);
    m.estacion('martillo', 1750, 29.94, 1.6, 18, -1, 0);
    m.estacion('halcon', 1500, -29.94, 1.6, -18, 1, 0);
    m.estacion('botiquin', 750, -36, 1.6, -29.94, 0, 1);
    m.puntosBotiquin.push(V(0, 0, -2.2), V(-24, 0, 16.5), V(17, 0, -16), V(14, 0, 21));
  },
};

function suelo(m) {
  // calzadas (cruce en el centro)
  m.losa(0, 0, 120, 12, 'asfalto', -0.018);
  m.losa(0, 0, 12, 120, 'asfalto', -0.015);
  for (const s of [-1, 1]) for (const lado of [-1, 1]) {
    const x0 = lado * 6, x1 = lado * 46, cz = s * 7.5;
    const cx = (x0 + x1) / 2, L = Math.abs(x1 - x0);
    m.acera(cx, cz, L, 3);
    m.acera(cz, cx, 3, L);
  }
  // marcas viales: líneas discontinuas y paso de cebra
  for (let x = -44; x <= 44; x += 4) if (Math.abs(x) > 9) {
    m.agregar(G.caja, matriz(x, 0.012, 0, 0, 0, 0, 2, 0.004, 0.15), 'pinturaVial', { sombra: false });
    m.agregar(G.caja, matriz(0, 0.012, x, 0, 0, 0, 0.15, 0.004, 2), 'pinturaVial', { sombra: false });
  }
  for (let i = -2; i <= 2; i++) for (const s of [-1, 1]) {
    m.agregar(G.caja, matriz(i * 1.1, 0.012, s * 7.5, 0, 0, 0, 0.6, 0.004, 2.6), 'pinturaVial', { sombra: false });
    m.agregar(G.caja, matriz(s * 7.5, 0.012, i * 1.1, 0, 0, 0, 2.6, 0.004, 0.6), 'pinturaVial', { sombra: false });
  }
}

function edificios(m) {
  const lista = [
    { x: -36, z: -36.5, w: 15, d: 13, h: 9, mat: 'yesoOcre', frente: 's', letrero: 0 },
    { x: -17, z: -36.5, w: 13, d: 13, h: 12, mat: 'ladrillo', frente: 's', letrero: 3 },
    { x: 17, z: -36.5, w: 13, d: 13, h: 7, mat: 'yesoGris', frente: 's', letrero: 2, garaje: true },
    { x: 36, z: -36.5, w: 15, d: 13, h: 10, mat: 'ladrillo', frente: 's' },
    { x: -36, z: 36.5, w: 15, d: 13, h: 11, mat: 'yesoRosa', frente: 'n', letrero: 4 },
    { x: -17, z: 36.5, w: 13, d: 13, h: 8, mat: 'ladrillo', frente: 'n', letrero: 1 },
    { x: 17, z: 36.5, w: 13, d: 13, h: 14, mat: 'yesoGris', frente: 'n' },
    { x: 36, z: 36.5, w: 15, d: 13, h: 9, mat: 'yesoOcre', frente: 'n' },
    { x: 36.5, z: -18, w: 13, d: 14, h: 10, mat: 'yesoRosa', frente: 'w' },
    { x: 36.5, z: 18, w: 13, d: 14, h: 8, mat: 'ladrillo', frente: 'w' },
    { x: -36.5, z: -18, w: 13, d: 14, h: 9, mat: 'ladrillo', frente: 'e' },
    { x: -36.5, z: 18, w: 13, d: 14, h: 12, mat: 'yesoOcre', frente: 'e' },
  ];
  for (const e of lista) m.edificio(e);
}

function limites(m) {
  m.limiteJugador(42.5);
  // barricadas visibles en los fines de calle (con huecos) y vallas rotas en callejones
  for (const [x, z, ry] of [[0, -42, 0], [0, 42, 0], [-42, 0, Math.PI / 2], [42, 0, Math.PI / 2]]) {
    for (const k of [-4.5, -1.6, 3.2]) {
      const dx = Math.cos(ry) * k, dz = -Math.sin(ry) * k;
      m.barreraJersey(x + dx, z + dz, ry + (m.rnd() - 0.5) * 0.3);
    }
  }
  const callejones = [[-26, -42, 0], [26, -42, 0], [-26, 42, 0], [26, 42, 0], [-42, -27.5, Math.PI / 2], [42, -27.5, Math.PI / 2], [-42, 27.5, Math.PI / 2], [42, 27.5, Math.PI / 2]];
  for (const [x, z, ry] of callejones) {
    m.valla(x, z, 4.8, ry, true);
    m.contenedor(x + (ry ? 0 : 1.6), z + (ry ? 1.6 : 0), ry);
  }
  for (const [x, z] of [[0, -46], [0, 46], [-46, 0], [46, 0]]) m.aparicion.push(V(x, 0, z));
  for (const [x, z] of callejones) m.aparicion.push(V(Math.sign(x) * (Math.abs(x) > 40 ? 46 : Math.abs(x)), 0, Math.sign(z) * (Math.abs(z) > 40 ? 46 : Math.abs(z))));
}

function farolas(m) {
  const pos = [];
  for (const k of [-26, -15, 15, 26]) for (const s of [-1, 1]) { pos.push([k, s * 8.6, s < 0 ? 0 : Math.PI]); pos.push([s * 8.6, k, s < 0 ? -Math.PI / 2 : Math.PI / 2]); }
  pos.forEach(([x, z, ry], i) => m.farola(x, z, ry, { rota: i === 5 || i === 11, parpadea: i === 2 || i === 9 || i === 14 }));
}

function gasolinera(m) {
  const cx = 19, cz = -19;
  for (const [px, pz] of [[-5, -3], [5, -3], [-5, 3], [5, 3]]) m.caja(cx + px, 0, cz + pz, 0.5, 4.6, 0.5, 'hormigon');
  m.agregar(G.caja, matriz(cx, 4.9, cz, 0, 0, 0, 12.5, 0.6, 8.5), 'metalRojo');
  m.agregar(G.caja, matriz(cx, 4.58, cz, 0, 0, 0, 12, 0.04, 8), 'hormigon', { sombra: false });
  for (const px of [-3, 0, 3]) m.agregar(G.caja, matriz(cx + px, 4.55, cz, 0, 0, 0, 1.6, 0.04, 0.3), px === 0 ? 'bombillaRota' : 'ventanaFria', { sombra: false });
  m.rotulo({ x: cx, z: cz, w: 12.5, d: 8.5 }, 's', 5);
  for (const px of [-2.2, 2.2]) {
    m.caja(cx + px, 0, cz, 1.4, 0.2, 3.5, 'hormigon');
    m.caja(cx + px, 0.2, cz, 0.6, 1.6, 0.9, 'metalRojo', { superficie: 'metal' });
    m.agregar(G.caja, matriz(cx + px + 0.31, 1.4, cz, 0, 0, 0, 0.02, 0.3, 0.45), 'cristalOscuro', { sombra: false });
  }
  m.candidatosLuz.push({ tipo: 'farola', pos: V(cx, 4.4, cz), color: new THREE.Color(0xbcd8ff), intensidad: 40, parpadeo: 1, fase: 3 });
}

function solarNoroeste(m) {
  const cx = -19, cz = -19;
  m.valla(cx, cz - 9.5, 18, 0);
  m.valla(cx - 9.5, cz, 14, Math.PI / 2, true);
  m.col.agregarCentro(cx, 0, cz - 9.5, 18, 2.2, 0.1, { superficie: 'metal', bloqueaVista: false });
  m.arbolMuerto(cx - 5, cz - 4, 5);
  m.arbolMuerto(cx + 4, cz + 3, 6);
  for (const [x, z, h] of [[cx + 2, cz - 5, 1], [cx + 3, cz - 5, 1], [cx + 2.5, cz - 5, 2]]) m.cajaMadera(x, z, h - 1);
  m.caja(cx - 3, 0, cz + 4, 1.8, 1.3, 1.1, 'metalVerde', { superficie: 'metal' });
  m.barril(cx + 6, cz - 2, true);
  m.barril(cx + 6.7, cz - 1.4, false);
}

function paradaAutobus(m) {
  const cx = -19, cz = 11;
  for (const px of [-2, 2]) m.agregar(G.caja, matriz(cx + px, 1.25, cz, 0, 0, 0, 0.1, 2.5, 0.1), 'farola');
  m.agregar(G.caja, matriz(cx, 2.55, cz + 0.4, 0, 0, 0, 4.4, 0.1, 1.6), 'farola');
  m.agregar(G.plano, matriz(cx, 1.4, cz + 1.1, Math.PI, 0, 0, 4, 2, 1), 'cristal', { sombra: false });
  m.col.agregarCentro(cx, 0, cz + 1.1, 4, 2.4, 0.15, { superficie: 'metal' });
  m.caja(cx, 0, cz + 0.6, 3, 0.45, 0.5, 'madera', { superficie: 'madera' });
  m.arbolMuerto(cx - 8, cz + 8, 5.5);
  m.arbolMuerto(cx + 6, cz + 10, 4.5);
  // camión de reparto abandonado
  const tx = -24, tz = 20;
  m.caja(tx, 0.3, tz, 2.3, 2.6, 5, 'cocheBlanco', { superficie: 'metal' });
  m.caja(tx, 0.3, tz - 3.4, 2.2, 1.9, 1.8, 'cocheAzul', { superficie: 'metal' });
  m.agregar(G.caja, matriz(tx, 1.7, tz - 4.32, 0, 0, 0, 1.9, 0.7, 0.04), 'cristal', { sombra: false });
  for (const [wx, wz] of [[-1.1, -3.3], [1.1, -3.3], [-1.1, 1.5], [1.1, 1.5]]) m.agregar(G.cil12, matriz(tx + wx, 0.45, tz + wz, 0, 0, Math.PI / 2, 0.9, 0.3, 0.9), 'neumatico');
  m.barril(-12, 16, true);
}

function obras(m) {
  const cx = 19, cz = 19;
  for (let i = 0; i < 3; i++) {
    const x = cx - 4 + i * 2.1, z = cz + 4;
    m.agregar(G.cil20, matriz(x, 0.9, z, 0, Math.PI / 2, 0, 1.8, 2.6, 1.8), 'hormigon');
    m.col.agregarCentro(x, 0, z, 1.8, 1.8, 2.6, { superficie: 'hormigon' });
  }
  for (const [px, pz] of [[0, 0], [3, 0], [0, 1.5], [3, 1.5]]) m.agregar(G.cil8, matriz(cx + 3 + px, 2.5, cz - 6 + pz, 0, 0, 0, 0.08, 5, 0.08), 'farola');
  for (const h of [1.8, 3.6]) m.caja(cx + 4.5, h, cz - 5.25, 3.3, 0.08, 1.6, 'madera', { superficie: 'madera' });
  m.agregar(G.cono, matriz(cx - 5, 0.7, cz - 4, 0, 0, 0, 4, 1.4, 3.2), 'tierra');
  m.col.agregarCentro(cx - 5, 0, cz - 4, 2.6, 0.9, 2, { superficie: 'tierra' });
  for (let i = 0; i < 4; i++) m.caja(cx + 6, i * 0.14, cz + 1, 1.2, 0.14, 1.0, 'madera', { superficie: 'madera' });
  m.barril(cx - 1, cz - 2, true);
  m.cajaMadera(cx - 7, cz + 8, 0, 1.0);
}
