import * as THREE from 'three';

/**
 * Cuerpo visible de un jugador (lo ven los demás en una sala).
 * Low-poly articulado y animado por código, como el modelo clásico de los zombis:
 * no depende de archivos externos y se recolorea al instante según la skin.
 *
 * Skin = { ropa, piel, gorra (null = sin gorra), mochila } — colores como enteros hex.
 */
export const PALETA = {
  ropa: [0x3d6e9e, 0x9e3434, 0x4b6b3a, 0xd9a441, 0x2b2b2b, 0xdedede],
  piel: [0xf1c9a5, 0xd9a77e, 0xa8714a, 0x6b4430],
  gorra: [null, 0x2b2b2b, 0xb33a3a, 0x3d6e9e, 0x5a7a3a],
};
export const SKIN_DEFECTO = Object.freeze({ ropa: PALETA.ropa[0], piel: PALETA.piel[1], gorra: null, mochila: true });

/** Devuelve una skin válida: cada campo fuera de la paleta toma el valor por defecto. */
export function sanearSkin(s) {
  const o = s && typeof s === 'object' ? s : {};
  return {
    ropa: PALETA.ropa.includes(o.ropa) ? o.ropa : SKIN_DEFECTO.ropa,
    piel: PALETA.piel.includes(o.piel) ? o.piel : SKIN_DEFECTO.piel,
    gorra: PALETA.gorra.includes(o.gorra) ? o.gorra : SKIN_DEFECTO.gorra,
    mochila: typeof o.mochila === 'boolean' ? o.mochila : SKIN_DEFECTO.mochila,
  };
}

const caja = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/** Crea el cuerpo; mira hacia -Z (como la cámara con yaw 0). Los pies quedan en y = 0. */
export function crearCuerpoJugador(skin) {
  skin = sanearSkin(skin);
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const materiales = { ropa: mat(skin.ropa), piel: mat(skin.piel), pantalon: mat(0x30394a), botas: mat(0x2a211a), gorra: mat(skin.gorra ?? 0x2b2b2b), mochila: mat(0x5b4a32), arma: mat(0x1d1f22) };
  const raiz = new THREE.Group();
  const malla = (g, m, x, y, z, padre = raiz) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; padre.add(o); return o; };
  // pivote en la articulación: la pieza cuelga hacia abajo
  const miembro = (x, y, largo, ancho, m, mPunta) => {
    const p = new THREE.Group(); p.position.set(x, y, 0); raiz.add(p);
    malla(caja(ancho, largo * 0.85, ancho), m, 0, -largo * 0.42, 0, p);
    malla(caja(ancho * 1.08, largo * 0.18, ancho * 1.3), mPunta, 0, -largo * 0.92, mPunta === materiales.botas ? -0.04 : 0, p);
    return p;
  };
  const piernaI = miembro(-0.12, 0.92, 0.92, 0.16, materiales.pantalon, materiales.botas);
  const piernaD = miembro(0.12, 0.92, 0.92, 0.16, materiales.pantalon, materiales.botas);
  const torso = malla(caja(0.46, 0.6, 0.26), materiales.ropa, 0, 1.22, 0);
  malla(caja(0.48, 0.08, 0.28), materiales.pantalon, 0, 0.94, 0);                 // cinturón
  const cabeza = malla(caja(0.26, 0.28, 0.26), materiales.piel, 0, 1.68, 0);
  const brazoI = miembro(-0.31, 1.48, 0.62, 0.13, materiales.ropa, materiales.piel);
  const brazoD = miembro(0.31, 1.48, 0.62, 0.13, materiales.ropa, materiales.piel);
  // los brazos sujetan un arma hacia delante
  brazoI.rotation.set(-1.25, 0, -0.35); brazoD.rotation.set(-1.35, 0, 0.1);
  const arma = malla(caja(0.07, 0.12, 0.55), materiales.arma, 0.08, 1.36, -0.42);
  const gorra = malla(caja(0.29, 0.09, 0.3), materiales.gorra, 0, 1.84, 0);
  const visera = malla(caja(0.29, 0.03, 0.14), materiales.gorra, 0, 1.8, -0.2);
  gorra.visible = visera.visible = skin.gorra !== null;
  const mochila = malla(caja(0.36, 0.44, 0.16), materiales.mochila, 0, 1.22, 0.21);
  mochila.visible = skin.mochila;
  return {
    raiz, materiales, piernaI, piernaD, brazoI, brazoD, torso, cabeza, arma, gorra, visera, mochila, fase: 0,
    /** Ciclo de paso según la velocidad horizontal (m/s); caído = tumbado. */
    animar(dt, vel, vivo) {
      if (!vivo) { raiz.rotation.x = -Math.PI / 2; raiz.position.y = 0.2; return; }
      raiz.rotation.x = 0; raiz.position.y = 0;
      this.fase += dt * Math.min(vel, 7) * 2.2;
      const a = Math.min(1, vel / 3) * 0.7;
      piernaI.rotation.x = Math.sin(this.fase) * a;
      piernaD.rotation.x = -Math.sin(this.fase) * a;
      torso.position.y = 1.22 + Math.abs(Math.cos(this.fase)) * a * 0.04;
    },
    liberar() { raiz.traverse(o => o.geometry?.dispose()); for (const m of Object.values(materiales)) m.dispose(); },
  };
}
