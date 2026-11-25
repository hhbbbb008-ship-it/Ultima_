import * as THREE from 'three';

/**
 * Modelos 3D procedurales de armas en primera persona (diseños originales),
 * con brazos, piezas móviles (corredera, cargador, guardamanos de bomba)
 * y la posición exacta de la mira para apuntar.
 * Unidades en metros; el cañón apunta a -Z; el origen está en la empuñadura.
 */
const geoCaja = new THREE.BoxGeometry(1, 1, 1);
const geoCil = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
const geoEsfera = new THREE.SphereGeometry(0.5, 10, 8);

export class ConstructorArmas {
  constructor(recursos) { this.rec = recursos; }

  caja(padre, mat, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = this.rec.malla(geoCaja, mat);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    padre.add(m); return m;
  }
  /** Cilindro orientado a lo largo de Z. */
  cil(padre, mat, r, largo, x, y, z) {
    const m = this.rec.malla(geoCil, mat);
    m.scale.set(r * 2, largo, r * 2); m.rotation.x = Math.PI / 2; m.position.set(x, y, z);
    padre.add(m); return m;
  }
  esfera(padre, mat, r, x, y, z) {
    const m = this.rec.malla(geoEsfera, mat); m.scale.setScalar(r * 2); m.position.set(x, y, z); padre.add(m); return m;
  }
  /** Extremidad (cápsula) entre dos puntos. */
  extremidad(padre, mat, a, b, radio) {
    const dir = new THREE.Vector3().subVectors(b, a), L = dir.length();
    const geo = new THREE.CapsuleGeometry(radio, Math.max(0.01, L - radio * 2), 4, 10);
    const m = this.rec.malla(geo, mat);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    padre.add(m); return m;
  }
  mano(padre, x, y, z, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(rx, ry, rz);
    this.caja(g, 'guante', 0.045, 0.055, 0.085, 0, 0, 0);
    for (let i = 0; i < 4; i++) this.caja(g, 'guante', 0.011, 0.02, 0.05, -0.016 + i * 0.011, -0.03, -0.02 - (i === 1 || i === 2 ? 0.004 : 0), -0.6);
    this.caja(g, 'guante', 0.014, 0.018, 0.05, 0.026, 0.005, -0.03, 0, 0.5);
    padre.add(g); return g;
  }
  brazos(g, manoDer, manoIzq) {
    // brazo derecho
    this.mano(g, manoDer.x, manoDer.y, manoDer.z, 0.2, 0, 0);
    this.extremidad(g, 'guante', manoDer.clone().add(new THREE.Vector3(0.0, -0.01, 0.05)), manoDer.clone().add(new THREE.Vector3(0.03, -0.04, 0.12)), 0.026);
    this.extremidad(g, 'manga', manoDer.clone().add(new THREE.Vector3(0.03, -0.04, 0.12)), new THREE.Vector3(0.17, -0.26, 0.2), 0.042);
    // brazo izquierdo
    if (manoIzq) {
      this.mano(g, manoIzq.x, manoIzq.y, manoIzq.z, 0.3, 0.2, 0.5);
      this.extremidad(g, 'guante', manoIzq.clone().add(new THREE.Vector3(-0.01, -0.02, 0.04)), manoIzq.clone().add(new THREE.Vector3(-0.05, -0.06, 0.12)), 0.025);
      this.extremidad(g, 'manga', manoIzq.clone().add(new THREE.Vector3(-0.05, -0.06, 0.12)), new THREE.Vector3(-0.22, -0.3, 0.18), 0.042);
    }
  }

  crear(id, conBrazos = true) {
    const fn = { pistola: this.pistola, toro: this.toro, subfusil: this.subfusil, escopeta: this.escopeta, recortada: this.recortada, martillo: this.martillo, fusil: this.fusil, halcon: this.halcon,
      lanzagranadas: this.lanzagranadas, bate: this.bate, hacha: this.hacha, marro: this.marro, katana: this.katana }[id];
    const g = new THREE.Group();
    const arma = new THREE.Group(); g.add(arma);
    const p = fn.call(this, arma, conBrazos);
    const boca = new THREE.Object3D(); boca.position.copy(p.boca); arma.add(boca);
    g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    return { ...p, grupo: g, arma, boca };
  }

  pistola(a, brazos) {
    this.caja(a, 'armaPolimero', 0.03, 0.026, 0.17, 0, 0.035, -0.06);
    const corredera = new THREE.Group(); a.add(corredera);
    this.caja(corredera, 'armaMetal', 0.033, 0.03, 0.19, 0, 0.062, -0.067);
    for (let i = 0; i < 5; i++) this.caja(corredera, 'armaPolimero', 0.034, 0.022, 0.003, 0, 0.062, 0.0 + i * 0.006);   // estrías
    this.caja(corredera, 'armaMetal', 0.026, 0.007, 0.012, 0, 0.081, 0.02);      // mira trasera
    this.caja(corredera, 'armaMetal', 0.004, 0.008, 0.005, 0, 0.081, -0.152);    // punto de mira
    this.esfera(corredera, 'mira', 0.0016, 0, 0.0855, -0.152);
    this.cil(a, 'armaMetal', 0.0065, 0.02, 0, 0.058, -0.168);
    this.caja(a, 'armaPolimero', 0.029, 0.115, 0.046, 0, -0.025, 0.012, -0.24);  // empuñadura
    const guarda = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0032, 6, 14, Math.PI), this.rec.mat('armaPolimero'));
    guarda.userData.mat = 'armaPolimero'; guarda.position.set(0, 0.022, -0.04); guarda.rotation.set(0, Math.PI / 2, Math.PI); a.add(guarda);
    this.caja(a, 'armaMetal', 0.004, 0.016, 0.004, 0, 0.012, -0.035);              // gatillo
    const cargador = new THREE.Group(); cargador.position.set(0, -0.025, 0.012); cargador.rotation.x = -0.24; a.add(cargador);
    this.caja(cargador, 'armaMetal', 0.024, 0.1, 0.036, 0, 0.0, 0);
    this.caja(cargador, 'armaPolimero', 0.031, 0.012, 0.05, 0, -0.06, 0);
    if (brazos) this.brazos(a, new THREE.Vector3(0.0, -0.025, 0.03), new THREE.Vector3(-0.022, -0.045, 0.02));
    return {
      boca: new THREE.Vector3(0, 0.058, -0.18), corredera, cargador, recorrido: 0.035,
      cadera: new THREE.Vector3(0.12, -0.12, -0.36), apuntar: new THREE.Vector3(0, -0.0835, -0.3),
    };
  }

  subfusil(a, brazos) {
    this.caja(a, 'armaMetal', 0.046, 0.06, 0.3, 0, 0.042, -0.12);
    this.cil(a, 'armaPolimero', 0.019, 0.13, 0, 0.05, -0.335);
    for (let i = 0; i < 4; i++) this.caja(a, 'armaMetal', 0.04, 0.004, 0.012, 0, 0.069, -0.29 - i * 0.025);
    this.cil(a, 'armaMetal', 0.008, 0.09, 0, 0.05, -0.44);
    const corredera = new THREE.Group(); a.add(corredera);
    this.caja(corredera, 'armaMetal', 0.012, 0.012, 0.03, 0.03, 0.055, -0.07);       // palanca de carga
    const cargador = new THREE.Group(); cargador.position.set(0, -0.02, -0.12); a.add(cargador);
    this.caja(cargador, 'armaMetal', 0.028, 0.21, 0.046, 0, -0.08, 0, 0.08);
    this.caja(a, 'armaPolimero', 0.034, 0.105, 0.046, 0, -0.03, 0.045, -0.3);
    this.caja(a, 'armaPolimero', 0.03, 0.085, 0.032, 0, -0.025, -0.27);              // empuñadura delantera
    // culata plegada
    this.caja(a, 'armaMetal', 0.008, 0.008, 0.24, 0.03, -0.01, 0.12);
    this.caja(a, 'armaMetal', 0.008, 0.008, 0.24, -0.03, -0.01, 0.12);
    this.caja(a, 'armaPolimero', 0.06, 0.06, 0.012, 0, -0.03, 0.24);
    // visor de punto rojo
    this.caja(a, 'armaMetal', 0.02, 0.01, 0.06, 0, 0.076, -0.1);
    this.caja(a, 'armaPolimero', 0.038, 0.006, 0.065, 0, 0.11, -0.1);
    this.caja(a, 'armaPolimero', 0.006, 0.034, 0.065, 0.017, 0.094, -0.1);
    this.caja(a, 'armaPolimero', 0.006, 0.034, 0.065, -0.017, 0.094, -0.1);
    this.caja(a, 'armaPolimero', 0.038, 0.006, 0.065, 0, 0.078, -0.1);
    this.esfera(a, 'mira', 0.0018, 0, 0.094, -0.13);
    if (brazos) this.brazos(a, new THREE.Vector3(0, -0.03, 0.06), new THREE.Vector3(-0.012, -0.05, -0.27));
    return {
      boca: new THREE.Vector3(0, 0.05, -0.49), corredera, cargador, recorrido: 0.03,
      cadera: new THREE.Vector3(0.13, -0.13, -0.38), apuntar: new THREE.Vector3(0, -0.094, -0.2),
    };
  }

  escopeta(a, brazos) {
    this.caja(a, 'armaMetal', 0.046, 0.07, 0.22, 0, 0.045, -0.06);
    this.cil(a, 'armaMetal', 0.012, 0.56, 0, 0.068, -0.45);
    this.cil(a, 'armaMetal', 0.0125, 0.44, 0, 0.038, -0.39);
    this.esfera(a, 'armaLaton', 0.0045, 0, 0.083, -0.72);
    const bomba = new THREE.Group(); a.add(bomba);
    const guarda = this.cil(bomba, 'armaMadera', 0.024, 0.17, 0, 0.04, -0.38);
    for (let i = 0; i < 5; i++) this.cil(bomba, 'armaPolimero', 0.0245, 0.006, 0, 0.04, -0.32 - i * 0.03);
    // culata de madera con empuñadura
    this.caja(a, 'armaMadera', 0.04, 0.075, 0.12, 0, 0.005, 0.1, 0.35);
    this.caja(a, 'armaMadera', 0.04, 0.095, 0.22, 0, -0.055, 0.24, 0.12);
    this.caja(a, 'goma', 0.042, 0.1, 0.015, 0, -0.068, 0.355, 0.12);
    this.caja(a, 'armaMetal', 0.004, 0.018, 0.004, 0, 0.002, -0.0);
    // cartucho visible en la ventana de expulsión
    const cartucho = this.cil(a, 'metalRojo', 0.009, 0.05, 0.02, 0.05, -0.04); cartucho.visible = false;
    if (brazos) this.brazos(a, new THREE.Vector3(0, -0.035, 0.08), new THREE.Vector3(-0.015, 0.0, -0.39));
    return {
      boca: new THREE.Vector3(0, 0.068, -0.74), bomba, cartucho, recorrido: 0.08, manoIzqEnBomba: true,
      cadera: new THREE.Vector3(0.12, -0.13, -0.4), apuntar: new THREE.Vector3(0, -0.0835, -0.17),
    };
  }

  fusil(a, brazos) {
    this.caja(a, 'armaMetal', 0.046, 0.07, 0.3, 0, 0.042, -0.1);
    this.caja(a, 'armaMadera', 0.054, 0.058, 0.25, 0, 0.04, -0.37);
    this.cil(a, 'armaMetal', 0.009, 0.2, 0, 0.05, -0.58);
    this.cil(a, 'armaMetal', 0.015, 0.055, 0, 0.05, -0.7);
    for (let i = 0; i < 3; i++) this.caja(a, 'armaPolimero', 0.031, 0.004, 0.008, 0, 0.065, -0.685 - i * 0.012);
    this.cil(a, 'armaMetal', 0.006, 0.2, 0, 0.078, -0.4);                     // tubo de gases
    const corredera = new THREE.Group(); a.add(corredera);
    this.caja(corredera, 'armaMetal', 0.012, 0.014, 0.035, 0.03, 0.055, -0.04);
    // cargador curvo (tres segmentos)
    const cargador = new THREE.Group(); cargador.position.set(0, 0.005, -0.13); a.add(cargador);
    for (let i = 0; i < 3; i++) this.caja(cargador, 'armaMetal', 0.03, 0.075, 0.052, 0, -0.035 - i * 0.068, -0.01 - i * i * 0.012, 0.12 + i * 0.16);
    this.caja(a, 'armaPolimero', 0.034, 0.11, 0.046, 0, -0.03, 0.05, -0.3);
    this.caja(a, 'armaMadera', 0.044, 0.08, 0.26, 0, -0.04, 0.18, 0.1);
    this.caja(a, 'goma', 0.046, 0.085, 0.012, 0, -0.054, 0.31, 0.1);
    // miras de hierro
    this.caja(a, 'armaMetal', 0.03, 0.022, 0.025, 0, 0.087, 0.01);
    this.caja(a, 'armaMetal', 0.008, 0.012, 0.01, 0, 0.1, 0.01);
    this.caja(a, 'armaMetal', 0.02, 0.03, 0.012, 0, 0.083, -0.48);
    this.caja(a, 'armaMetal', 0.0035, 0.012, 0.004, 0, 0.1, -0.48);
    this.esfera(a, 'mira', 0.0016, 0, 0.1065, -0.48);
    if (brazos) this.brazos(a, new THREE.Vector3(0, -0.035, 0.07), new THREE.Vector3(-0.015, -0.005, -0.38));
    return {
      boca: new THREE.Vector3(0, 0.05, -0.73), corredera, cargador, recorrido: 0.04,
      cadera: new THREE.Vector3(0.13, -0.135, -0.4), apuntar: new THREE.Vector3(0, -0.106, -0.17),
    };
  }

  /** Pistola pesada de calibre grande: corredera robusta, compensador y empuñadura de madera. */
  toro(a, brazos) {
    this.caja(a, 'armaMetal', 0.034, 0.03, 0.19, 0, 0.035, -0.07);
    const corredera = new THREE.Group(); a.add(corredera);
    this.caja(corredera, 'armaMetal', 0.037, 0.034, 0.215, 0, 0.066, -0.078);
    for (let i = 0; i < 6; i++) this.caja(corredera, 'armaPolimero', 0.038, 0.026, 0.003, 0, 0.066, 0.004 + i * 0.006);
    this.caja(corredera, 'armaMetal', 0.03, 0.008, 0.012, 0, 0.087, 0.022);
    this.caja(corredera, 'armaMetal', 0.005, 0.009, 0.006, 0, 0.087, -0.175);
    this.esfera(corredera, 'mira', 0.0017, 0, 0.092, -0.175);
    this.caja(a, 'armaMetal', 0.036, 0.034, 0.03, 0, 0.064, -0.2);                  // compensador
    for (let i = 0; i < 3; i++) this.caja(a, 'armaPolimero', 0.038, 0.004, 0.004, 0, 0.082, -0.19 - i * 0.008);
    this.cil(a, 'armaMetal', 0.0075, 0.02, 0, 0.062, -0.218);
    this.caja(a, 'armaMadera', 0.033, 0.12, 0.05, 0, -0.028, 0.014, -0.22);
    const guarda = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0035, 6, 14, Math.PI), this.rec.mat('armaMetal'));
    guarda.userData.mat = 'armaMetal'; guarda.position.set(0, 0.022, -0.045); guarda.rotation.set(0, Math.PI / 2, Math.PI); a.add(guarda);
    this.caja(a, 'armaMetal', 0.005, 0.016, 0.004, 0, 0.013, -0.04);
    this.caja(a, 'armaMetal', 0.012, 0.016, 0.02, 0, 0.078, 0.032, 0.5);             // martillo percutor
    const cargador = new THREE.Group(); cargador.position.set(0, -0.028, 0.014); cargador.rotation.x = -0.22; a.add(cargador);
    this.caja(cargador, 'armaMetal', 0.026, 0.105, 0.038, 0, 0, 0);
    this.caja(cargador, 'armaMetal', 0.034, 0.012, 0.052, 0, -0.062, 0);
    if (brazos) this.brazos(a, new THREE.Vector3(0.0, -0.028, 0.034), new THREE.Vector3(-0.024, -0.048, 0.022));
    return {
      boca: new THREE.Vector3(0, 0.062, -0.23), corredera, cargador, recorrido: 0.04,
      cadera: new THREE.Vector3(0.12, -0.125, -0.37), apuntar: new THREE.Vector3(0, -0.092, -0.3),
    };
  }

  /** Escopeta recortada de dos cañones paralelos: se abre por la bisagra para recargar. */
  recortada(a, brazos) {
    this.caja(a, 'armaMetal', 0.05, 0.05, 0.1, 0, 0.04, -0.02);                      // cajón de mecanismos
    const canones = new THREE.Group(); canones.position.set(0, 0.04, -0.065); a.add(canones);   // pivote = bisagra
    for (const s of [-1, 1]) {
      this.cil(canones, 'armaMetal', 0.0135, 0.34, s * 0.0135, 0.018, -0.17);
      this.cil(canones, 'armaPolimero', 0.0095, 0.002, s * 0.0135, 0.018, -0.341);
    }
    this.caja(canones, 'armaMetal', 0.012, 0.006, 0.3, 0, 0.033, -0.17);             // banda superior
    this.esfera(canones, 'armaLaton', 0.004, 0, 0.04, -0.33);
    this.caja(canones, 'armaMadera', 0.046, 0.03, 0.15, 0, -0.008, -0.1);            // guardamanos
    const cartuchos = new THREE.Group(); cartuchos.visible = false; a.add(cartuchos);
    for (const s of [-1, 1]) this.cil(cartuchos, 'metalRojo', 0.0115, 0.06, s * 0.0135, 0.075, 0.03);
    // empuñadura tipo pistola de madera (culata recortada)
    this.caja(a, 'armaMadera', 0.042, 0.06, 0.08, 0, 0.012, 0.06, 0.2);
    this.caja(a, 'armaMadera', 0.038, 0.12, 0.05, 0, -0.045, 0.1, -0.45);
    this.caja(a, 'armaMetal', 0.004, 0.016, 0.004, 0, 0.0, -0.005);
    this.caja(a, 'armaMetal', 0.006, 0.014, 0.018, 0, 0.073, 0.02, 0.4);              // palanca de apertura
    if (brazos) this.brazos(a, new THREE.Vector3(0, -0.04, 0.09), new THREE.Vector3(-0.012, -0.015, -0.2));
    return {
      boca: new THREE.Vector3(0, 0.058, -0.41), canones, cartuchos, recorrido: 0,
      cadera: new THREE.Vector3(0.13, -0.135, -0.36), apuntar: new THREE.Vector3(0, -0.1, -0.2),
    };
  }

  /** Escopeta semiautomática alimentada por cargador. */
  martillo(a, brazos) {
    this.caja(a, 'armaMetal', 0.05, 0.072, 0.3, 0, 0.044, -0.1);
    this.cil(a, 'armaMetal', 0.0125, 0.36, 0, 0.065, -0.42);
    this.cil(a, 'armaMetal', 0.0085, 0.24, 0, 0.088, -0.36);                         // tubo de gases
    this.caja(a, 'armaPolimero', 0.056, 0.05, 0.2, 0, 0.06, -0.33);                  // guardamanos
    for (let i = 0; i < 5; i++) this.caja(a, 'armaMetal', 0.058, 0.006, 0.01, 0, 0.087, -0.25 - i * 0.035);
    this.caja(a, 'armaMetal', 0.03, 0.03, 0.05, 0, 0.065, -0.61);                    // freno de boca
    const corredera = new THREE.Group(); a.add(corredera);
    this.caja(corredera, 'armaMetal', 0.012, 0.014, 0.04, 0.032, 0.06, -0.06);
    const cargador = new THREE.Group(); cargador.position.set(0, 0.0, -0.13); a.add(cargador);
    this.caja(cargador, 'armaPolimero', 0.042, 0.15, 0.085, 0, -0.07, -0.01, 0.12);
    this.caja(cargador, 'armaPolimero', 0.048, 0.016, 0.092, 0, -0.145, -0.02, 0.12);
    this.caja(a, 'armaPolimero', 0.036, 0.11, 0.048, 0, -0.03, 0.05, -0.3);
    this.caja(a, 'armaPolimero', 0.044, 0.075, 0.24, 0, -0.02, 0.17, 0.08);
    this.caja(a, 'goma', 0.046, 0.085, 0.014, 0, -0.03, 0.29, 0.08);
    // visor de punto rojo sobre raíl
    this.caja(a, 'armaMetal', 0.022, 0.008, 0.14, 0, 0.084, -0.1);
    this.caja(a, 'armaPolimero', 0.036, 0.034, 0.05, 0, 0.105, -0.08);
    this.caja(a, 'cristalOscuro', 0.026, 0.024, 0.052, 0, 0.11, -0.08);
    this.esfera(a, 'mira', 0.0019, 0, 0.111, -0.105);
    if (brazos) this.brazos(a, new THREE.Vector3(0, -0.035, 0.075), new THREE.Vector3(-0.015, 0.02, -0.33));
    return {
      boca: new THREE.Vector3(0, 0.065, -0.64), corredera, cargador, recorrido: 0.05,
      cadera: new THREE.Vector3(0.13, -0.14, -0.4), apuntar: new THREE.Vector3(0, -0.111, -0.18),
    };
  }

  /** Fusil de tirador semiautomático con mira telescópica. */
  halcon(a, brazos) {
    this.caja(a, 'armaMetal', 0.046, 0.068, 0.32, 0, 0.042, -0.1);
    this.caja(a, 'armaPolimero', 0.052, 0.056, 0.26, 0, 0.042, -0.39);
    this.cil(a, 'armaMetal', 0.0095, 0.34, 0, 0.05, -0.68);
    this.cil(a, 'armaMetal', 0.016, 0.07, 0, 0.05, -0.86);                          // freno de boca
    for (let i = 0; i < 3; i++) this.caja(a, 'armaPolimero', 0.034, 0.005, 0.009, 0, 0.066, -0.84 - i * 0.016);
    const corredera = new THREE.Group(); a.add(corredera);
    this.caja(corredera, 'armaMetal', 0.012, 0.014, 0.035, 0.03, 0.055, -0.04);
    const cargador = new THREE.Group(); cargador.position.set(0, 0.0, -0.12); a.add(cargador);
    this.caja(cargador, 'armaMetal', 0.03, 0.11, 0.06, 0, -0.06, 0, 0.08);
    this.caja(a, 'armaPolimero', 0.034, 0.11, 0.046, 0, -0.03, 0.05, -0.3);
    // culata esqueletizada con carrillera
    this.caja(a, 'armaPolimero', 0.04, 0.02, 0.26, 0, 0.03, 0.18);
    this.caja(a, 'armaPolimero', 0.04, 0.02, 0.22, 0, -0.05, 0.2, 0.25);
    this.caja(a, 'armaPolimero', 0.042, 0.11, 0.03, 0, -0.01, 0.31);
    this.caja(a, 'goma', 0.044, 0.115, 0.012, 0, -0.01, 0.33);
    // mira telescópica
    this.caja(a, 'armaMetal', 0.02, 0.026, 0.022, 0, 0.085, -0.02);
    this.caja(a, 'armaMetal', 0.02, 0.026, 0.022, 0, 0.085, -0.17);
    this.cil(a, 'armaPolimero', 0.017, 0.22, 0, 0.112, -0.095);
    this.cil(a, 'armaPolimero', 0.024, 0.06, 0, 0.112, -0.235);
    this.cil(a, 'armaPolimero', 0.021, 0.045, 0, 0.112, 0.035);
    this.cil(a, 'cristalOscuro', 0.02, 0.002, 0, 0.112, -0.266);
    this.cil(a, 'cristalOscuro', 0.017, 0.002, 0, 0.112, 0.058);
    this.caja(a, 'armaPolimero', 0.012, 0.022, 0.02, 0, 0.134, -0.1);
    this.caja(a, 'armaPolimero', 0.022, 0.012, 0.02, 0.026, 0.112, -0.1);
    // bípode plegado
    for (const s of [-1, 1]) this.caja(a, 'armaMetal', 0.008, 0.008, 0.16, s * 0.016, 0.01, -0.44);
    if (brazos) this.brazos(a, new THREE.Vector3(0, -0.035, 0.075), new THREE.Vector3(-0.015, 0.0, -0.4));
    return {
      boca: new THREE.Vector3(0, 0.05, -0.9), corredera, cargador, recorrido: 0.045,
      cadera: new THREE.Vector3(0.13, -0.14, -0.42), apuntar: new THREE.Vector3(0, -0.112, -0.12),
    };
  }

  /** Botiquín: caja roja con cruz blanca y asa. conMano: versión en primera persona. */
  botiquin(conMano = true) {
    const g = new THREE.Group();
    const cuerpo = new THREE.Group(); g.add(cuerpo);
    this.caja(cuerpo, 'botiquinRojo', 0.17, 0.115, 0.065, 0, 0, 0);
    this.caja(cuerpo, 'armaPolimero', 0.172, 0.008, 0.067, 0, 0.03, 0);
    const tapa = new THREE.Group(); tapa.position.set(0, 0.0575, -0.0325); cuerpo.add(tapa);
    this.caja(tapa, 'botiquinRojo', 0.17, 0.01, 0.065, 0, 0.005, 0.0325);
    for (const sz of [1, -1]) {
      this.caja(cuerpo, 'botiquinCruz', 0.07, 0.022, 0.002, 0, -0.006, sz * 0.0335);
      this.caja(cuerpo, 'botiquinCruz', 0.022, 0.07, 0.002, 0, -0.006, sz * 0.0335);
    }
    const asa = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI), this.rec.mat('armaPolimero'));
    asa.userData.mat = 'armaPolimero'; asa.position.set(0, 0.062, 0); tapa.add(asa);
    if (conMano) {
      this.mano(g, -0.085, -0.03, 0.02, 0.3, 0.2, 0.9);
      this.extremidad(g, 'manga', new THREE.Vector3(-0.12, -0.07, 0.1), new THREE.Vector3(-0.24, -0.3, 0.2), 0.042);
      this.mano(g, 0.085, -0.03, 0.02, 0.3, -0.2, -0.9);
      this.extremidad(g, 'manga', new THREE.Vector3(0.12, -0.07, 0.1), new THREE.Vector3(0.24, -0.3, 0.2), 0.042);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = !conMano; o.receiveShadow = false; } });
    return { grupo: g, tapa, cuerpo };
  }

  /** Granada de mano: cuerpo ovoide segmentado, espoleta, palanca y anilla. */
  granada(conMano = false) {
    const g = new THREE.Group();
    const cuerpo = this.esfera(g, 'metalVerde', 0.034, 0, 0, 0); cuerpo.scale.set(0.068, 0.084, 0.068);
    for (let i = -1; i <= 1; i++) { const a = this.esfera(g, 'armaPolimero', 0.035, 0, i * 0.022, 0); a.scale.set(0.071, 0.008, 0.071); }
    this.cil(g, 'armaMetal', 0.012, 0.022, 0, 0.046, 0).rotation.x = 0;
    this.caja(g, 'armaMetal', 0.01, 0.07, 0.006, 0.018, 0.02, 0, 0, 0, -0.15);           // palanca
    const anilla = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0022, 6, 12), this.rec.mat('armaMetal'));
    anilla.userData.mat = 'armaMetal'; anilla.position.set(-0.016, 0.055, 0); anilla.rotation.y = Math.PI / 2; g.add(anilla);
    if (conMano) {
      this.mano(g, 0.0, -0.035, 0.03, 0.4, 0, 0);
      this.extremidad(g, 'manga', new THREE.Vector3(0.02, -0.07, 0.11), new THREE.Vector3(0.2, -0.3, 0.22), 0.042);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = !conMano; o.receiveShadow = false; } });
    return g;
  }


  // ------------------------------------------------------------ lanzagranadas
  /** Lanzagranadas de un tiro: tubo grueso, mira de hoja y culata de madera. */
  lanzagranadas(a, brazos) {
    this.cil(a, 'armaMetal', 0.03, 0.34, 0, 0.05, -0.3);                             // tubo
    this.cil(a, 'armaPolimero', 0.034, 0.05, 0, 0.05, -0.47);                        // boca
    this.caja(a, 'armaMetal', 0.05, 0.06, 0.16, 0, 0.035, -0.06);                    // cajón
    this.caja(a, 'armaMadera', 0.05, 0.055, 0.12, 0, 0.03, -0.2);                    // guardamanos
    this.caja(a, 'armaMetal', 0.006, 0.05, 0.012, 0, 0.1, -0.12);                    // mira de hoja
    this.caja(a, 'armaMetal', 0.004, 0.012, 0.004, 0, 0.087, -0.44);                 // punto de mira
    this.esfera(a, 'mira', 0.0018, 0, 0.094, -0.44);
    this.caja(a, 'armaMadera', 0.04, 0.1, 0.045, 0, -0.03, 0.03, -0.3);              // empuñadura
    this.caja(a, 'armaMadera', 0.046, 0.075, 0.22, 0, -0.005, 0.15, 0.1);            // culata
    this.caja(a, 'goma', 0.048, 0.085, 0.014, 0, -0.015, 0.265, 0.1);
    const cargador = new THREE.Group(); cargador.position.set(0, 0.05, -0.1); a.add(cargador);
    this.cil(cargador, 'armaLaton', 0.026, 0.05, 0, 0, 0);                           // granada en la recámara (asoma al recargar)
    if (brazos) this.brazos(a, new THREE.Vector3(0, -0.04, 0.04), new THREE.Vector3(-0.015, 0.0, -0.2));
    return {
      boca: new THREE.Vector3(0, 0.05, -0.5), cargador, recorrido: 0,
      cadera: new THREE.Vector3(0.14, -0.15, -0.38), apuntar: new THREE.Vector3(0, -0.094, -0.22),
    };
  }

  // ------------------------------------------------------- armas cuerpo a cuerpo
  // Se construyen a lo largo de +Y desde la empuñadura (origen) y se inclinan sobre el hombro.
  /** Mano que sujeta el mango y brazo hacia abajo a la derecha (en el marco del arma). */
  agarre(a) {
    this.mano(a, 0, 0.02, 0, 0, 0, Math.PI / 2);
    // el antebrazo cuelga del grupo (no gira con la inclinación del arma) hacia la esquina inferior derecha
    const g = a.parent || a;
    this.extremidad(g, 'guante', new THREE.Vector3(0.01, -0.02, 0.03), new THREE.Vector3(0.05, -0.08, 0.12), 0.026);
    this.extremidad(g, 'manga', new THREE.Vector3(0.05, -0.08, 0.12), new THREE.Vector3(0.16, -0.3, 0.3), 0.04);
  }
  poseCuerpo(a) {
    a.rotation.set(-0.95, 0.2, 0.6);                                                  // apoyada, apuntando arriba y a la izquierda
    a.scale.setScalar(0.72);
    return { boca: new THREE.Vector3(0, 0.6, 0), cadera: new THREE.Vector3(0.27, -0.27, -0.46), apuntar: new THREE.Vector3(0.27, -0.27, -0.46), cuerpo: true };
  }

  bate(a, brazos) {
    const m = this.rec.malla(new THREE.CylinderGeometry(0.034, 0.014, 0.72, 12), 'armaMadera');
    m.position.set(0, 0.36, 0); a.add(m);
    this.esfera(a, 'armaMadera', 0.035, 0, 0.72, 0).scale.set(0.068, 0.03, 0.068);
    this.cil(a, 'goma', 0.017, 0.16, 0, 0.05, 0).rotation.x = 0;                     // cinta del mango
    this.esfera(a, 'armaMadera', 0.02, 0, -0.035, 0).scale.set(0.04, 0.018, 0.04);
    for (let i = 0; i < 5; i++) this.caja(a, 'cable', 0.01, 0.01, 0.012, (i % 2 ? 1 : -1) * 0.022, 0.42 + i * 0.05, 0.02);   // clavos
    if (brazos) this.agarre(a);
    return this.poseCuerpo(a);
  }

  hacha(a, brazos) {
    this.cil(a, 'armaMadera', 0.016, 0.62, 0, 0.3, 0).rotation.x = 0;
    this.caja(a, 'metalRojo', 0.03, 0.09, 0.05, 0, 0.6, 0);                          // ojo de la cabeza
    const forma = new THREE.Shape();
    forma.moveTo(0, -0.04); forma.lineTo(0.13, -0.08); forma.quadraticCurveTo(0.17, 0, 0.13, 0.08); forma.lineTo(0, 0.04); forma.closePath();
    const filo = this.rec.malla(new THREE.ExtrudeGeometry(forma, { depth: 0.012, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.004, bevelSegments: 1 }), 'metalRojo');
    filo.position.set(0.012, 0.6, -0.006); filo.rotation.y = 0; a.add(filo);
    this.caja(a, 'hoja', 0.012, 0.15, 0.016, 0.155, 0.6, 0);                        // borde afilado
    this.caja(a, 'metalRojo', 0.07, 0.03, 0.03, -0.045, 0.6, 0);                     // pico trasero
    this.cil(a, 'goma', 0.019, 0.12, 0, 0.04, 0).rotation.x = 0;
    if (brazos) this.agarre(a);
    return this.poseCuerpo(a);
  }

  marro(a, brazos) {
    this.cil(a, 'armaMadera', 0.018, 0.7, 0, 0.34, 0).rotation.x = 0;
    this.caja(a, 'armaMetal', 0.22, 0.1, 0.1, 0, 0.7, 0);                            // cabeza de acero
    this.caja(a, 'metalOxido', 0.03, 0.105, 0.105, 0.1, 0.7, 0);
    this.caja(a, 'metalOxido', 0.03, 0.105, 0.105, -0.1, 0.7, 0);
    this.cil(a, 'goma', 0.022, 0.15, 0, 0.05, 0).rotation.x = 0;
    if (brazos) this.agarre(a);
    const r = this.poseCuerpo(a);
    a.rotation.set(-0.8, 0.15, 0.5);
    return r;
  }

  katana(a, brazos) {
    const forma = new THREE.Shape();                                                  // hoja ligeramente curva
    forma.moveTo(-0.012, 0); forma.lineTo(0.014, 0);
    forma.quadraticCurveTo(0.03, 0.4, 0.016, 0.74); forma.lineTo(-0.004, 0.8);
    forma.quadraticCurveTo(0.004, 0.4, -0.012, 0); 
    const hoja = this.rec.malla(new THREE.ExtrudeGeometry(forma, { depth: 0.005, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.001, bevelSegments: 1 }), 'hoja');
    hoja.position.set(0, 0.2, -0.0025); a.add(hoja);
    this.caja(a, 'armaLaton', 0.012, 0.012, 0.012, 0, 0.215, 0);                     // habaki
    const tsuba = this.rec.malla(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 14), 'armaMetal');
    tsuba.position.set(0, 0.2, 0); a.add(tsuba);
    this.cil(a, 'goma', 0.017, 0.2, 0, 0.09, 0).rotation.x = 0;                      // empuñadura forrada
    for (let i = 0; i < 6; i++) this.caja(a, 'botiquinCruz', 0.036, 0.008, 0.036, 0, 0.01 + i * 0.03, 0, 0, i % 2 ? 0.8 : -0.8);
    this.caja(a, 'armaMetal', 0.03, 0.015, 0.03, 0, -0.015, 0);                      // remate
    if (brazos) this.agarre(a);
    const r = this.poseCuerpo(a);
    a.rotation.set(-1.0, 0.2, 0.7);
    return r;
  }

  /** Botella molotov con trapo encendido. */
  molotov(conMano = false) {
    const g = new THREE.Group();
    const cuerpo = this.rec.malla(new THREE.CylinderGeometry(0.034, 0.036, 0.13, 12), 'vidrioBotella'); cuerpo.position.y = 0; g.add(cuerpo);
    const cuello = this.rec.malla(new THREE.CylinderGeometry(0.013, 0.03, 0.07, 10), 'vidrioBotella'); cuello.position.y = 0.1; g.add(cuello);
    const liquido = this.rec.malla(new THREE.CylinderGeometry(0.03, 0.032, 0.08, 10), 'gasolina'); liquido.position.y = -0.02; g.add(liquido);
    this.caja(g, 'trapo', 0.024, 0.06, 0.02, 0, 0.16, 0, 0.2, 0, 0.3);
    const llama = this.esfera(g, 'llama', 0.02, 0, 0.2, 0); llama.scale.set(0.04, 0.07, 0.04);
    if (conMano) {
      this.mano(g, 0.0, -0.02, 0.035, 0.3, 0, 0);
      this.extremidad(g, 'manga', new THREE.Vector3(0.02, -0.06, 0.11), new THREE.Vector3(0.2, -0.3, 0.22), 0.042);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = !conMano; o.receiveShadow = false; } });
    return g;
  }

  /** Granada de 40 mm del lanzagranadas. */
  proyectil() {
    const g = new THREE.Group();
    this.cil(g, 'metalVerde', 0.02, 0.05, 0, 0, 0);
    this.esfera(g, 'armaLaton', 0.02, 0, 0, -0.025).scale.set(0.04, 0.04, 0.05);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    return g;
  }

  /** Caja de munición militar con asa y balas de latón asomando. */
  /** Lata de bebida energética (la que sueltan los zombis). */
  lataBebida() {
    const g = new THREE.Group();
    const c = this.cil(g, 'lataBebida', 0.033, 0.12, 0, 0.06, 0); c.rotation.x = 0;
    const t = this.cil(g, 'lataTapa', 0.03, 0.008, 0, 0.124, 0); t.rotation.x = 0;
    const f = this.cil(g, 'lataTapa', 0.03, 0.008, 0, 0.002, 0); f.rotation.x = 0;
    this.caja(g, 'botiquinCruz', 0.012, 0.05, 0.002, 0, 0.065, 0.033);              // rayo pintado
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    return g;
  }

  cajaMunicion() {
    const g = new THREE.Group();
    this.caja(g, 'metalVerde', 0.3, 0.16, 0.14, 0, 0.08, 0);
    this.caja(g, 'armaMetal', 0.31, 0.025, 0.15, 0, 0.17, 0);
    this.caja(g, 'armaMetal', 0.12, 0.018, 0.02, 0, 0.2, 0);
    for (let i = 0; i < 6; i++) { const b = this.cil(g, 'armaLaton', 0.009, 0.05, -0.09 + i * 0.036, 0.205, 0.035); b.rotation.x = 0; }
    this.caja(g, 'botiquinCruz', 0.14, 0.04, 0.002, 0, 0.09, 0.071);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    return g;
  }

  /** Cuchillo para el ataque cuerpo a cuerpo. */
  cuchillo() {
    const g = new THREE.Group();
    const forma = new THREE.Shape();
    forma.moveTo(0, 0); forma.lineTo(0.16, 0.0); forma.lineTo(0.2, 0.012); forma.lineTo(0.16, 0.028); forma.lineTo(0, 0.026); forma.closePath();
    const hoja = this.rec.malla(new THREE.ExtrudeGeometry(forma, { depth: 0.004, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.001, bevelSegments: 1 }), 'hoja');
    hoja.rotation.y = Math.PI / 2; hoja.position.set(0, -0.01, -0.01);
    g.add(hoja);
    this.caja(g, 'armaPolimero', 0.03, 0.04, 0.012, 0, 0.003, 0.0);
    this.caja(g, 'armaPolimero', 0.024, 0.03, 0.11, 0, 0.002, 0.06);
    this.mano(g, 0, -0.005, 0.06);
    this.extremidad(g, 'manga', new THREE.Vector3(0.02, -0.03, 0.14), new THREE.Vector3(0.18, -0.22, 0.2), 0.042);
    return g;
  }
}
