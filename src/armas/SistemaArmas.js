import * as THREE from 'three';
import { ARMAS, CUCHILLO, BOTIQUIN, GRANADA, MOLOTOV, ORDEN_ARMAS, ASISTENCIA, tiempoRecarga } from './DefArmas.js';
import { ConstructorArmas } from './ModelosArmas.js';

/**
 * Sistema de armas: inventario, disparo por rayos (hitscan) con dispersión,
 * caída de daño, penetración, retroceso, recarga (por cargador, cartucho a
 * cartucho o basculante de dos cañones), apuntado (con mira telescópica en el
 * fusil de tirador), cambio de arma por ranuras, cuchillo, botiquín, compras en
 * pared y toda la animación procedural del arma en primera persona.
 *
 * El arma se dibuja en una escena propia con su propia cámara (FOV fijo) y se
 * compone encima del mundo limpiando el búfer de profundidad.
 */
const CAP_CASQUILLOS = [0, 0, 20, 40, 80];
const VIDA_CASQUILLO = [0, 0, 3, 5, 9];
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3();
const suave = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const RANURAS = [1, 2, 3, 4, 5];

export class SistemaArmas {
  constructor(ctx) {
    this.ctx = ctx;
    this.escena = new THREE.Scene();
    this.camara = new THREE.PerspectiveCamera(62, 16 / 9, 0.01, 10);
    // iluminación propia del arma: luz principal, de relleno y de contorno (se lee bien de noche)
    this.escena.add(new THREE.HemisphereLight(0xa8b8d8, 0x302820, 2.2));
    const dl = new THREE.DirectionalLight(0xfff0e0, 2.6); dl.position.set(0.6, 1, 0.5); this.escena.add(dl);
    const relleno = new THREE.DirectionalLight(0x9fb4ff, 1.2); relleno.position.set(-1, 0.3, 0.2); this.escena.add(relleno);
    const contorno = new THREE.DirectionalLight(0xffc48a, 1.8); contorno.position.set(0.2, 0.6, -1); this.escena.add(contorno);
    this.luzVista = new THREE.PointLight(0xffb060, 0, 2, 2); this.luzVista.position.set(0, 0, -0.6); this.escena.add(this.luzVista);

    const fab = new ConstructorArmas(ctx.recursos);
    this.constructorArmas = fab;
    this.modelos = {};
    for (const id of ORDEN_ARMAS) {
      const m = fab.crear(id, true);
      m.grupo.visible = false;
      this.escena.add(m.grupo);
      this.modelos[id] = m;
    }
    this.cuchilloModelo = fab.cuchillo();
    this.cuchilloModelo.visible = false;
    this.escena.add(this.cuchilloModelo);
    this.botiquinModelo = fab.botiquin(true);
    this.botiquinModelo.grupo.visible = false;
    this.escena.add(this.botiquinModelo.grupo);
    this.granadaModelo = fab.granada(true);
    this.granadaModelo.visible = false;
    this.escena.add(this.granadaModelo);
    this.molotovModelo = fab.molotov(true);
    this.molotovModelo.visible = false;
    this.escena.add(this.molotovModelo);
    this.crearBarrido();

    // fogonazo (dos planos cruzados con textura aditiva)
    const matF = new THREE.MeshBasicMaterial({ map: ctx.recursos.textura('fogonazo'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    this.fogonazo = new THREE.Group();
    const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), matF);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.12), matF); pl.rotation.y = Math.PI / 2;
    this.fogonazo.add(pf, pl); this.fogonazo.visible = false;
    // luz del fogonazo en el mundo (cantidad de luces constante)
    this.luzMundo = new THREE.PointLight(0xffb060, 0, 12, 2);
    ctx.escena.add(this.luzMundo);

    // trazadoras y casquillos (reservas)
    this.trazadoras = [];
    const matT = new THREE.MeshBasicMaterial({ color: 0xffd48a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    for (let i = 0; i < 12; i++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matT.clone()); t.visible = false; t.userData.vida = 0;
      ctx.escena.add(t); this.trazadoras.push(t);
    }
    this.geoCasquillo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.022, 6);
    this.casquillos = []; this.iCasquillo = 0;
    this.nivelEfectos = 2;

    this.inventario = {};
    this.estacionesMontadas = [];
    this.reiniciar();
    this.animarVista(0.016);
  }

  configurar(nivelEfectos) {
    this.nivelEfectos = nivelEfectos;
    const cap = CAP_CASQUILLOS[nivelEfectos];
    while (this.casquillos.length > cap) this.ctx.escena.remove(this.casquillos.pop().m);
    this.iCasquillo = 0;
  }

  /**
   * guardado: inventario de una partida guardada (continuar).
   * equipo: { secundaria, principal } elegidos en la pantalla de equipamiento.
   */
  reiniciar(guardado, equipo) {
    this.inventario = {};
    this.actual = null; this.ultima = null;
    this.estado = 'listo'; this.t = 0;
    this.ads = 0; this.adsEase = 0; this.bloom = 0; this.cadenciaT = 0;
    this.sprintK = 0; this.balanceo = { x: 0, y: 0 }; this.kick = 0; this.kickV = 0;
    this.cambioT = 0; this.siguiente = null; this.correderaT = 0; this.bombaT = 0;
    this.cuchilloT = -1; this.botiquinT = -1; this.granadaT = -1; this.molotovT = -1; this.golpeT = -1; this.barridoT = -1;
    this.disparosSeguidos = 0; this.salidaCarrera = 0;
    this.estacionCercana = null; this.apuntarAlternado = false;
    this.friccion = 1; this.iman = null; this.adsAntes = 0;
    for (const m of Object.values(this.modelos)) m.grupo.visible = false;
    this.botiquinModelo.grupo.visible = false;
    this.granadaModelo.visible = false;
    this.molotovModelo.visible = false;
    if (this.barrido) this.barrido.visible = false;
    if (guardado?.armas) {
      for (const [id, d] of Object.entries(guardado.armas)) if (ARMAS[id]) this.dar(id, false, d);
      const primera = Object.keys(this.inventario)[0] || 'pistola';
      if (!this.inventario[primera]) this.dar('pistola');
      this.equipar(guardado.actual && this.inventario[guardado.actual] ? guardado.actual : primera);
    } else if (equipo) {
      const sec = ARMAS[equipo.secundaria] ? equipo.secundaria : 'pistola';
      this.dar(sec, false);
      if (ARMAS[equipo.principal] && equipo.principal !== sec) { this.dar(equipo.principal, false); this.equipar(equipo.principal); this.ultima = sec; }
      else this.equipar(sec);
      if (ARMAS[equipo.cuerpo]?.cuerpo) this.dar(equipo.cuerpo, false);          // arma cuerpo a cuerpo (ranura 5)
    } else { this.dar('pistola'); this.equipar('pistola'); }
  }

  // ---------------------------------------------------------- asistencia de apuntado
  /** Nivel efectivo (por defecto 'media'; el antiguo valor 'auto' también equivale a media). */
  get asistencia() {
    return null;   // autoapuntado eliminado: sin asistencia
  }

  /**
   * Zombi (pecho o cabeza) más cercano a la línea de mira dentro de un cono de 'grados',
   * a menos de 'maxDist' metros y con línea de visión. Devuelve { punto, ang } o null.
   * Usa las matrices de huesos del último fotograma (no fuerza recálculos).
   */
  objetivoAsistido(grados, maxDist = 50) {
    const ctx = this.ctx, cam = ctx.camara, o = cam.position;
    cam.getWorldDirection(_f);
    const lim = THREE.MathUtils.degToRad(grados);
    let mejor = null, mejorAng = lim;
    for (const z of ctx.zombis.activos) {
      if (!z.vivo || z.estado === 'emerger') continue;
      const dx = z.pos.x - o.x, dz = z.pos.z - o.z;
      if (dx * _f.x + dz * _f.z <= 0 || dx * dx + dz * dz > maxDist * maxDist) continue;
      for (const hueso of [z.h.pecho, z.h.cabeza]) {
        if (!hueso.visible) continue;
        _p.setFromMatrixPosition(hueso.matrixWorld);
        if (hueso === z.h.cabeza) _p.y += z.modelo.cabezaY * z.def.escala;
        _q.subVectors(_p, o);
        const d = _q.length(); if (d < 0.5) continue;
        const ang = Math.acos(THREE.MathUtils.clamp(_q.dot(_f) / d, -1, 1));
        if (ang < mejorAng) { mejorAng = ang; mejor = { punto: _p.clone(), ang, zombi: z }; }
      }
    }
    if (mejor && !ctx.colisiones.lineaVista(o, mejor.punto)) return null;
    return mejor;
  }

  /** Cono de asistencia escalado por el zoom (con mira telescópica el cono en pantalla no crece). */
  conoAsistencia(base) { return base * (1 - (1 - this.factorZoom) * this.adsEase); }

  /** Fricción de mira e "imán" suave al empezar a apuntar. Se llama cada fotograma. */
  actualizarAsistencia(dt) {
    const A = this.asistencia, j = this.ctx.jugador;
    this.friccion = 1;
    if (!A || !j.vivo || j.corriendo) { this.iman = null; this.adsAntes = this.ads; return; }
    this.cuadroAsist = (this.cuadroAsist || 0) + 1;
    if (this.cuadroAsist % 2 === 0) this.objetivoFric = this.objetivoAsistido(this.conoAsistencia(Math.max(A.conoFric, A.seguir)));
    const t0 = this.objetivoFric;
    if (t0 && t0.ang < THREE.MathUtils.degToRad(this.conoAsistencia(A.conoFric))) this.friccion = A.friccion;
    // seguimiento: mientras apuntas, disparas o te mueves, la mira acompaña poco a poco al zombi
    const activo = this.ads > 0.5 || this.ctx.entrada.activo('disparar') || j.moviendose;
    if (A.seguir && t0 && t0.zombi.vivo && activo && t0.ang < THREE.MathUtils.degToRad(this.conoAsistencia(A.seguir))) {
      t0.zombi.h.pecho.getWorldPosition(_p);
      const v = _q.subVectors(_p, this.ctx.camara.position);
      const yaw = Math.atan2(-v.x, -v.z), pitch = Math.atan2(v.y, Math.hypot(v.x, v.z));
      let dy = yaw - j.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const k = 1 - Math.exp(-A.seguirVel * (this.ads > 0.5 ? 1.5 : 1) * dt);
      j.yaw += dy * k; j.pitch += (pitch - j.pitch) * k * 0.6;
    }
    // al empezar a apuntar: giro parcial hacia el objetivo (solo en nivel medio)
    if (A.iman && this.adsAntes < 0.05 && this.ads >= 0.05) {
      const t = this.objetivoAsistido(A.iman);
      if (t) {
        const v = _q.subVectors(t.punto, this.ctx.camara.position);
        const yaw = Math.atan2(-v.x, -v.z), pitch = Math.atan2(v.y, Math.hypot(v.x, v.z));
        let dy = yaw - j.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.iman = { yaw: dy * A.imanK, pitch: (pitch - j.pitch) * A.imanK, t: 0.12 };
      }
    }
    this.adsAntes = this.ads;
    if (this.iman) {
      const k = Math.min(1, dt / this.iman.t);
      j.yaw += this.iman.yaw * k; j.pitch += this.iman.pitch * k;
      this.iman.yaw *= 1 - k; this.iman.pitch *= 1 - k; this.iman.t -= dt;
      if (this.iman.t <= 0) this.iman = null;
    }
  }

  get factorZoom() { return this.actual ? this.actual.def.zoom : 1; }
  /** Mira telescópica a pantalla completa (fusil de tirador apuntando). */
  get miraActiva() { return !!this.actual?.def.mira && this.adsEase > 0.85 && this.estado !== 'recargando'; }
  get usandoBotiquin() { return this.botiquinT >= 0; }
  /** Hay una acción en curso que impide disparar, recargar o cambiar de arma. */
  get ocupadoAccion() { return this.cuchilloT >= 0 || this.botiquinT >= 0 || this.granadaT >= 0 || this.molotovT >= 0 || this.golpeT >= 0; }

  estadoGuardable() {
    const armas = {};
    for (const [id, e] of Object.entries(this.inventario)) armas[id] = { municion: e.municion, reserva: e.reserva };
    return { armas, actual: this.actual?.def.id };
  }

  dar(id, llenar = true, datos) {
    const def = ARMAS[id];
    this.inventario[id] = datos ? { def, municion: datos.municion, reserva: datos.reserva } : { def, municion: def.cargador, reserva: def.reservaInicial };
    if (llenar && !datos) this.inventario[id].reserva = def.reservaMax;
  }

  equipar(id) {
    for (const m of Object.values(this.modelos)) m.grupo.visible = false;
    if (this.actual && this.actual.def.id !== id) this.ultima = this.actual.def.id;
    this.actual = this.inventario[id];
    this.modelo = this.modelos[id];
    this.modelo.grupo.visible = true;
    this.modelo.arma.add(this.fogonazo); this.fogonazo.position.copy(this.modelo.boca.position);
    if (this.modelo.canones) this.modelo.canones.rotation.x = 0;
    if (this.modelo.cartuchos) this.modelo.cartuchos.visible = false;
    if (this.modelo.cartucho) this.modelo.cartucho.visible = false;
    this.bloom = 0;
  }

  cambiar(id) {
    if (!this.inventario[id] || this.actual?.def.id === id || this.estado === 'cambiando' || this.ocupadoAccion) return;
    this.cancelarRecarga();
    this.estado = 'cambiando'; this.cambioT = 0; this.siguiente = id;
    this.ctx.audio.reproducir('cambio_arma', { vol: 0.5, reverb: 0 });
  }

  /** Armas que se poseen, en orden. */
  poseidas() { return ORDEN_ARMAS.filter(id => this.inventario[id]); }

  /** Tecla de ranura: selecciona la categoría; si ya estás en ella, pasa a la siguiente arma de la misma. */
  seleccionarRanura(n) {
    const enRanura = this.poseidas().filter(id => ARMAS[id].ranura === n);
    if (!enRanura.length) return;
    const actual = this.siguiente || this.actual?.def.id;
    const i = enRanura.indexOf(actual);
    this.cambiar(i < 0 ? enRanura[0] : enRanura[(i + 1) % enRanura.length]);
  }

  ciclar(paso) {
    const p = this.poseidas();
    if (p.length < 2) return;
    const i = p.indexOf(this.actual.def.id);
    this.cambiar(p[(i + paso + p.length) % p.length]);
  }

  /** Dispersión actual en grados. */
  dispersion() {
    const d = this.actual.def, j = this.ctx.jugador;
    let s = d.dispCadera + (d.dispApuntar - d.dispCadera) * this.adsEase;
    s += d.dispMovimiento * Math.min(1, j.velHoriz / 4.4) * (1 - this.adsEase * 0.6);
    if (!j.enSuelo) s += d.dispSalto;
    return s + this.bloom;
  }

  // -------------------------------------------------------------------------
  actualizar(dt, entrada) {
    const j = this.ctx.jugador;
    if (!this.actual) return;
    const def = this.actual.def;
    this.cadenciaT -= dt;
    this.bloom = Math.max(0, this.bloom - def.recuperacionDisp * dt * (this.cadenciaT < -0.1 ? 1.5 : 1));
    this.salidaCarrera = Math.max(0, this.salidaCarrera - dt);

    if (j.vivo) {
      // cambio de arma: ranuras, rueda, "anterior" y botón táctil de siguiente
      RANURAS.forEach(n => { if (entrada.pulsado('arma' + n)) this.seleccionarRanura(n); });
      if (entrada.pulsado('armaAnterior') && this.ultima) this.cambiar(this.ultima);
      if (entrada.pulsado('armaSiguiente')) this.ciclar(1);
      const rueda = this.ctx.jugador.ultimoRaton?.rueda || 0;
      if (rueda) this.ciclar(rueda > 0 ? 1 : -1);

      // apuntar (mantener en PC; en pantalla táctil el botón alterna)
      if (entrada.pulsado('apuntarAlternar')) this.apuntarAlternado = !this.apuntarAlternado;
      if (j.corriendo) this.apuntarAlternado = false;
      const ocupado = this.estado === 'cambiando' || this.ocupadoAccion;
      const quiereApuntar = !def.cuerpo && (entrada.activo('apuntar') || this.apuntarAlternado) && !ocupado && !(this.estado === 'recargando' && def.tipo !== 'bomba');
      this.ads = quiereApuntar ? Math.min(1, this.ads + dt / def.tiempoApuntar) : Math.max(0, this.ads - dt / (def.tiempoApuntar * 0.8));
      this.adsEase = this.ads * this.ads * (3 - 2 * this.ads);
      this.actualizarAsistencia(dt);

      if (entrada.pulsado('cuchillo') && !this.ocupadoAccion && this.estado !== 'cambiando') this.iniciarCuchillo();
      if (entrada.pulsado('botiquin')) this.usarBotiquin();
      if (entrada.pulsado('granada')) this.lanzarGranada();
      if (entrada.pulsado('molotov')) this.lanzarMolotov();
      if (entrada.pulsado('recargar')) this.iniciarRecarga();
      if (entrada.pulsado('linterna')) this.ctx.iluminacion.alternarLinterna();

      // disparo
      const gatillo = def.tipo === 'auto' || def.cuerpo ? entrada.activo('disparar') : entrada.pulsado('disparar');
      if (gatillo) {
        if (j.corriendo) { j.bloqueoCarrera = 0.4; this.salidaCarrera = 0.12; }
        else this.intentarDisparo();
      }
      if (!entrada.activo('disparar')) this.disparosSeguidos = 0;

      // interacción con estaciones de compra
      this.buscarEstacion();
      if (entrada.pulsado('interactuar') && this.estacionCercana) this.comprar(this.estacionCercana);
    }

    this.actualizarEstado(dt, entrada);
    this.actualizarEfectos(dt);
    this.animarVista(dt);
  }

  intentarDisparo() {
    const a = this.actual, def = a.def;
    if (this.ocupadoAccion || this.estado === 'cambiando' || this.salidaCarrera > 0) return;
    if (def.cuerpo) { if (this.cadenciaT <= 0) this.iniciarGolpe(); return; }
    if (this.estado === 'recargando') {
      if (def.tipo === 'bomba' && a.municion > 0) { this.estado = 'listo'; this.modelo.cartucho.visible = false; }   // la escopeta interrumpe la recarga
      else return;
    }
    if (this.cadenciaT > 0) return;
    if (a.municion <= 0) {
      if (a.reserva > 0) this.iniciarRecarga();
      else { this.ctx.audio.reproducir('vacio', { vol: 0.6, reverb: 0 }); this.cadenciaT = 0.25; }
      return;
    }
    this.disparar();
  }

  disparar() {
    const ctx = this.ctx, a = this.actual, def = a.def, j = ctx.jugador, cam = ctx.camara;
    a.municion--;
    this.cadenciaT = def.cadencia;
    this.disparosSeguidos++;
    const origen = cam.position.clone();
    cam.getWorldDirection(_f);
    _r.setFromMatrixColumn(cam.matrixWorld, 0);
    _u.setFromMatrixColumn(cam.matrixWorld, 1);
    const disp = THREE.MathUtils.degToRad(this.dispersion());
    let alguno = false, cabeza = false, muerte = false;
    const dir = new THREE.Vector3();
    // asistencia: el centro del disparo se inclina parcialmente hacia un zombi muy cercano a la mira
    const base = new THREE.Vector3().copy(_f);
    const A = def.proyectil ? null : this.asistencia;
    if (def.proyectil) {
      // lanzagranadas: el proyectil sale de la boca hacia donde apuntas (con la dispersión actual)
      const rr = Math.tan(disp) * Math.sqrt(Math.random()), ang = Math.random() * Math.PI * 2;
      dir.copy(base).addScaledVector(_r, Math.cos(ang) * rr).addScaledVector(_u, Math.sin(ang) * rr).normalize();
      const salida = _p.copy(origen).addScaledVector(dir, 0.6).addScaledVector(_u, -0.05);
      ctx.granadas.lanzar(salida, dir, j.vel, { tipo: 'impacto', ...def.proyectil });
    }
    if (A) {
      const t = this.objetivoAsistido(this.conoAsistencia(A.cono) + (def.perdigones > 1 ? 1 : 0));
      if (t) { base.lerp(_q.subVectors(t.punto, origen).normalize(), A.tiron).normalize(); this.ultimaAsistencia = t; }
      cam.getWorldDirection(_f);
    }
    for (let p = 0; p < (def.proyectil ? 0 : def.perdigones); p++) {
      const rr = Math.tan(disp) * Math.sqrt(Math.random()), ang = Math.random() * Math.PI * 2;
      dir.copy(base).addScaledVector(_r, Math.cos(ang) * rr).addScaledVector(_u, Math.sin(ang) * rr).normalize();
      const hm = ctx.colisiones.rayo(origen, dir, 160);
      const maxD = hm ? hm.dist : 160;
      const hits = ctx.zombis.rayo(origen, dir, maxD);
      let restantes = def.penetracion, factor = 1, detenido = false;
      for (const h of hits) {
        if (restantes <= 0) { detenido = true; break; }
        const caida = h.dist <= def.alcance[0] ? 1 : h.dist >= def.alcance[1] ? def.danoMin : 1 - (1 - def.danoMin) * (h.dist - def.alcance[0]) / (def.alcance[1] - def.alcance[0]);
        const mult = h.parte === 'cabeza' ? def.multCabeza : h.parte === 'piernas' ? 0.75 : 1;
        const res = h.zombi.recibirImpacto(def.dano * caida * factor * mult, h.punto, dir, h.parte, def.id);
        ctx.particulas.emitir('sangre', h.punto, _v.copy(dir).negate().lerp(dir, 0.3), def.perdigones > 1 ? 0.4 : 1);
        ctx.particulas.emitir('sangreNiebla', h.punto, dir, def.perdigones > 1 ? 0.3 : 1);
        if (hm && hm.dist - h.dist < 2.6 && Math.random() < (def.perdigones > 1 ? 0.25 : 0.8)) ctx.calcas.manchaSangre(hm, { x: hm.nx, y: hm.ny, z: hm.nz }, 0.55);
        alguno = true; if (h.parte === 'cabeza') cabeza = true; if (res.muerto) muerte = true;
        restantes--; factor *= 0.7;
        if (restantes <= 0) detenido = true;
      }
      if (!detenido && hm) this.impactoMundo(hm, dir);
      if (def.trazadora && this.nivelEfectos >= 2 && (this.disparosSeguidos % def.trazadora === 1 || def.trazadora === 1))
        this.trazadora(hits.length && detenido ? hits[Math.max(0, def.penetracion - 1)]?.punto || origen.clone().addScaledVector(dir, maxD) : origen.clone().addScaledVector(dir, maxD));
    }
    if (!def.proyectil) ctx.puntuacion.registrarDisparo(alguno);
    if (alguno) ctx.eventos.emit('arma:impacto', { cabeza, muerte });

    // retroceso, dispersión acumulada, efectos y sonido
    const kADS = 1 - this.adsEase * 0.35;
    j.retroceso(def.retroceso.v * kADS, def.retroceso.h * kADS);
    this.bloom = Math.min(def.dispCadera * 2, this.bloom + def.aumentoDisp);
    this.kickV += def.patada || 3;
    this.correderaT = 0.07;
    if (def.tipo === 'bomba') this.bombaT = 0.0001;
    this.fogonazo.visible = !this.miraActiva; this.fogonazoT = 0.045;
    this.fogonazo.rotation.z = Math.random() * Math.PI;
    this.fogonazo.scale.setScalar((def.fogonazo || 1) * (0.8 + Math.random() * 0.4));
    if (this.nivelEfectos >= 1) { this.luzMundo.intensity = 30 * Math.min(1.6, def.fogonazo || 1); this.luzMundo.position.copy(origen).addScaledVector(_f, 1.2); }
    this.luzVista.intensity = 4;
    ctx.audio.reproducir(def.sonido, { vol: 0.85, reverb: 0.45 });
    ctx.particulas.emitir('humoCanon', _v.copy(origen).addScaledVector(_f, 0.7).addScaledVector(_r, 0.08).addScaledVector(_u, -0.06), _f, def.perdigones > 1 ? 1.6 : 1);
    if (def.tipo !== 'bomba' && def.recargaTipo !== 'basculante' && !def.proyectil) this.expulsarCasquillo(def.perdigones > 1);
    ctx.zombis.alertar(origen, 38);
    ctx.eventos.emit('arma:disparo', { arma: def.id });
  }

  impactoMundo(h, dir) {
    const ctx = this.ctx, n = { x: h.nx, y: h.ny, z: h.nz };
    const sup = h.superficie;
    if (sup === 'metal') { ctx.particulas.emitir('chispas', h, n, 1); ctx.particulas.emitir('polvo', h, n, 0.4); }
    else if (sup === 'madera') { ctx.particulas.emitir('astillas', h, n, 1); ctx.particulas.emitir('polvo', h, n, 0.5); }
    else if (sup === 'tierra' || sup === 'suelo') ctx.particulas.emitir('polvo', h, n, 1.2);
    else { ctx.particulas.emitir('polvo', h, n, 1); ctx.particulas.emitir('chispas', h, n, 0.35); }
    ctx.calcas.agujero(h, n);
    if (Math.random() < 0.6) ctx.audio.reproducir('impacto_' + (sup === 'suelo' ? 'hormigon' : sup), { pos: h, vol: 0.45, ref: 3, reverb: 0.2 });
  }

  trazadora(fin) {
    const cam = this.ctx.camara;
    const ini = _v.copy(cam.position).addScaledVector(_f, 0.6).addScaledVector(_r, 0.1).addScaledVector(_u, -0.08);
    const t = this.trazadoras.find(x => !x.visible) || this.trazadoras[0];
    const L = ini.distanceTo(fin);
    if (L < 2) return;
    t.position.copy(ini).lerp(fin, 0.5);
    t.lookAt(fin);
    t.scale.set(0.012, 0.012, L);
    t.visible = true; t.userData.vida = 0.05; t.material.opacity = 0.9;
  }

  expulsarCasquillo(cartuchoEscopeta = false) {
    const cap = CAP_CASQUILLOS[this.nivelEfectos]; if (!cap) return;
    let c;
    if (this.casquillos.length < cap) {
      const m = this.ctx.recursos.malla(this.geoCasquillo, 'armaLaton');
      m.castShadow = false; this.ctx.escena.add(m);
      c = { m, v: new THREE.Vector3(), w: new THREE.Vector3(), vida: 0, sonado: false }; this.casquillos.push(c);
    } else { c = this.casquillos[this.iCasquillo]; this.iCasquillo = (this.iCasquillo + 1) % cap; }
    c.m.scale.setScalar(cartuchoEscopeta ? 2.4 : 1);
    const cam = this.ctx.camara, j = this.ctx.jugador;
    c.m.position.copy(cam.position).addScaledVector(_f, 0.35).addScaledVector(_r, 0.12).addScaledVector(_u, -0.06);
    c.v.copy(_r).multiplyScalar(1.6 + Math.random()).addScaledVector(_u, 1.6 + Math.random()).addScaledVector(_f, -0.3).add(j.vel);
    c.w.set(Math.random() * 30, Math.random() * 30, Math.random() * 30);
    c.vida = VIDA_CASQUILLO[this.nivelEfectos]; c.sonado = false; c.m.visible = true;
  }

  actualizarEfectos(dt) {
    if (this.fogonazoT > 0) { this.fogonazoT -= dt; if (this.fogonazoT <= 0) this.fogonazo.visible = false; }
    this.luzMundo.intensity = Math.max(0, this.luzMundo.intensity - dt * 600);
    this.luzVista.intensity = Math.max(0, this.luzVista.intensity - dt * 80);
    for (const t of this.trazadoras) if (t.visible) { t.userData.vida -= dt; t.material.opacity = Math.max(0, t.userData.vida / 0.05); if (t.userData.vida <= 0) t.visible = false; }
    for (const c of this.casquillos) {
      if (!c.m.visible) continue;
      c.vida -= dt; if (c.vida <= 0) { c.m.visible = false; continue; }
      if (c.v.lengthSq() > 0.0004) {
        c.v.y -= 9.8 * dt;
        c.m.position.addScaledVector(c.v, dt);
        c.m.rotation.x += c.w.x * dt; c.m.rotation.y += c.w.y * dt; c.m.rotation.z += c.w.z * dt;
        const suelo = this.ctx.colisiones.alturaSuelo(c.m.position.x, c.m.position.z, 0.01, c.m.position.y) + 0.005;
        if (c.m.position.y < suelo) {
          c.m.position.y = suelo; c.v.y *= -0.35; c.v.x *= 0.5; c.v.z *= 0.5; c.w.multiplyScalar(0.5);
          if (!c.sonado) { c.sonado = true; this.ctx.audio.reproducir('casquillo', { pos: c.m.position, vol: 0.25, ref: 1, reverb: 0 }); }
          if (Math.abs(c.v.y) < 0.4) { c.v.set(0, 0, 0); c.m.rotation.x = Math.PI / 2; }
        }
      }
    }
  }

  // ------------------------------------------------------------------ recarga
  iniciarRecarga() {
    const a = this.actual, def = a.def;
    if (def.cuerpo || this.estado !== 'listo' || this.ocupadoAccion || a.municion >= def.cargador || a.reserva <= 0) return;
    this.estado = 'recargando'; this.t = 0;
    if (def.tipo === 'bomba') { this.fase = 'inicio'; this.recargaVacia = a.municion === 0; this.tFase = tiempoRecarga(def, 'recargaInicio'); return; }
    this.recargaVacia = a.municion === 0;
    this.recargaTotal = tiempoRecarga(def, this.recargaVacia ? 'recargaVacia' : 'recarga');
    const au = this.ctx.audio, T = this.recargaTotal;
    if (def.recargaTipo === 'basculante') {
      au.reproducir('basculante_abrir', { vol: 0.7, reverb: 0.05, retraso: T * 0.12 });
      au.reproducir('cartucho', { vol: 0.6, reverb: 0.05, retraso: T * 0.5 });
      au.reproducir('cartucho', { vol: 0.6, reverb: 0.05, retraso: T * 0.6 });
      au.reproducir('basculante_cerrar', { vol: 0.8, reverb: 0.05, retraso: T * 0.82 });
      return;
    }
    au.reproducir('cargador_fuera', { vol: 0.6, reverb: 0.05, retraso: T * 0.18 });
    au.reproducir('cargador_dentro', { vol: 0.7, reverb: 0.05, retraso: T * 0.55 });
    if (this.recargaVacia) au.reproducir('corredera', { vol: 0.7, reverb: 0.05, retraso: T * 0.82 });
  }

  cancelarRecarga() {
    if (this.estado !== 'recargando') return;
    this.estado = 'listo';
    if (this.modelo.cartucho) this.modelo.cartucho.visible = false;
    if (this.modelo.cartuchos) this.modelo.cartuchos.visible = false;
    if (this.modelo.canones) this.modelo.canones.rotation.x = 0;
  }

  actualizarEstado(dt) {
    const a = this.actual, def = a.def;
    if (this.estado === 'recargando') {
      this.t += dt;
      if (def.tipo === 'bomba') {
        this.tFase -= dt;
        if (this.tFase <= 0) {
          if (this.fase === 'inicio' || this.fase === 'cartucho') {
            if (this.fase === 'cartucho') { a.municion++; a.reserva--; this.modelo.cartucho.visible = false; }
            if (a.municion < def.cargador && a.reserva > 0) {
              this.fase = 'cartucho'; this.tFase = tiempoRecarga(def, 'recargaCartucho'); this.modelo.cartucho.visible = true;
              this.ctx.audio.reproducir('cartucho', { vol: 0.6, reverb: 0.05, retraso: this.tFase * 0.6 });
            } else {
              this.fase = 'fin'; this.tFase = tiempoRecarga(def, 'recargaFin');
              if (this.recargaVacia) { this.bombaT = 0.0001; this.ctx.audio.reproducir('bomba', { vol: 0.7, reverb: 0.05 }); }
            }
          } else { this.estado = 'listo'; }
        }
      } else if (this.t >= this.recargaTotal) {
        const n = Math.min(def.cargador - a.municion, a.reserva);
        a.municion += n; a.reserva -= n;
        this.estado = 'listo';
      }
    } else if (this.estado === 'cambiando') {
      this.cambioT += dt;
      if (this.siguiente && this.cambioT >= 0.25) { this.equipar(this.siguiente); this.siguiente = null; }
      if (this.cambioT >= 0.55) this.estado = 'listo';
    }
    // cuchillo
    if (this.cuchilloT >= 0) {
      const antes = this.cuchilloT;
      this.cuchilloT += dt;
      if (antes < CUCHILLO.golpe && this.cuchilloT >= CUCHILLO.golpe) this.golpeCuchillo();
      if (this.cuchilloT >= CUCHILLO.duracion) { this.cuchilloT = -1; this.cuchilloModelo.visible = false; }
    }
    // botiquín: a mitad de la animación se aplica la cura
    if (this.botiquinT >= 0) {
      const antes = this.botiquinT;
      this.botiquinT += dt;
      if (antes < BOTIQUIN.momento && this.botiquinT >= BOTIQUIN.momento) {
        const j = this.ctx.jugador;
        if (j.vivo && j.botiquines > 0) {
          j.botiquines--;
          const curado = j.curar(BOTIQUIN.cura);
          this.ctx.audio.reproducir('botiquin_cura', { bus: 'interfaz', vol: 0.8, reverb: 0 });
          this.ctx.eventos.emit('jugador:curado', { cant: Math.round(curado) });
        }
      }
      if (this.botiquinT >= BOTIQUIN.duracion) { this.botiquinT = -1; this.botiquinModelo.grupo.visible = false; }
    }
    // granada: se quita la anilla, se lanza en el momento 'suelta' y el arma vuelve
    if (this.granadaT >= 0) {
      const antes = this.granadaT;
      this.granadaT += dt;
      if (antes < GRANADA.suelta && this.granadaT >= GRANADA.suelta) this.soltarGranada();
      if (this.granadaT >= GRANADA.lanzamiento) { this.granadaT = -1; this.granadaModelo.visible = false; }
    }
    // golpe cuerpo a cuerpo: impacta en el momento 'golpe' de la animación
    if (this.golpeT >= 0) {
      const antes = this.golpeT, d = this.actual.def;
      this.golpeT += dt;
      if (antes < d.golpe * d.cadencia && this.golpeT >= d.golpe * d.cadencia) this.impactoCuerpo(d);
      if (this.golpeT >= d.cadencia) this.golpeT = -1;
    }
    // molotov: se enciende, se lanza en el momento 'suelta' y el arma vuelve
    if (this.molotovT >= 0) {
      const antes = this.molotovT;
      this.molotovT += dt;
      if (antes < MOLOTOV.suelta && this.molotovT >= MOLOTOV.suelta) this.soltarMolotov();
      if (this.molotovT >= MOLOTOV.lanzamiento) { this.molotovT = -1; this.molotovModelo.visible = false; }
    }
    if (this.barridoT >= 0) {
      this.barridoT += dt;
      const b = this.barridoCfg, B = this.barrido;
      const k = (this.barridoT - b.retraso) / b.duracion;
      if (k >= 1) { this.barridoT = -1; B.visible = false; }
      else if (k < 0) B.visible = false;                              // aún en la preparación del golpe
      else {
        B.visible = true;
        B.material.opacity = Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) * (1 - k) * 1.3;
        // horizontal: cruza de derecha a izquierda · vertical: gira 90° y baja de arriba abajo
        B.rotation.z = (b.vertical ? -Math.PI / 2 + 0.15 : 0) + 0.5 - k * 1.1;
        B.scale.setScalar(b.escala * (0.85 + k * 0.35));
      }
    }
    // la escopeta acciona la bomba tras cada disparo
    if (this.bombaT > 0) {
      this.bombaT += dt;
      if (this.bombaT > 0.12 && !this.bombaSonada) { this.bombaSonada = true; if (def.tipo === 'bomba' && this.estado !== 'recargando') this.ctx.audio.reproducir('bomba', { vol: 0.6, reverb: 0.05 }); }
      if (this.bombaT > 0.62) { this.bombaT = 0; this.bombaSonada = false; }
    }
  }

  // ----------------------------------------------------------------- cuchillo
  iniciarCuchillo() {
    this.cancelarRecarga();
    this.cuchilloT = 0; this.cuchilloModelo.visible = true;
    this.ctx.audio.reproducir('cuchillo_aire', { vol: 0.6, reverb: 0 });
  }

  golpeCuchillo() {
    const ctx = this.ctx, cam = ctx.camara;
    cam.getWorldDirection(_f);
    const z = ctx.zombis.cuerpoACuerpo(cam.position, _f, CUCHILLO.alcance, CUCHILLO.angulo);
    if (!z) return;
    const punto = z.puntoTorso();
    const res = z.recibirImpacto(CUCHILLO.dano, punto, _f, 'torso', 'cuchillo');
    z.empujar(_f.x * CUCHILLO.empuje, _f.z * CUCHILLO.empuje);
    ctx.particulas.emitir('sangre', punto, _v.copy(_f).negate(), 1.4);
    ctx.audio.reproducir('impacto_carne', { vol: 0.9, reverb: 0.1 });
    ctx.jugador.sacudir(0.25);
    ctx.eventos.emit('arma:impacto', { cabeza: false, muerte: res.muerto });
  }

  // ------------------------------------------------------ armas cuerpo a cuerpo
  iniciarGolpe() {
    const def = this.actual.def;
    this.golpeT = 0; this.cadenciaT = def.cadencia;
    this.ctx.audio.reproducir(def.sonido, { vol: 0.7, reverb: 0, retraso: def.golpe * def.cadencia * 0.6 });
    if (def.barrido) this.iniciarBarrido(def);
  }

  /** Zombis dentro del arco del golpe, del más cercano al más lejano. */
  objetivosCuerpo(def) {
    const ctx = this.ctx, o = ctx.camara.position;
    ctx.camara.getWorldDirection(_f);
    const L = Math.hypot(_f.x, _f.z) || 1, fx = _f.x / L, fz = _f.z / L, cos = Math.cos(def.angulo);
    const r = [];
    for (const z of ctx.zombis.activos) {
      if (!z.vivo) continue;
      const dx = z.pos.x - o.x, dz = z.pos.z - o.z, dist = Math.hypot(dx, dz);
      if (dist > def.alcance[0] + z.def.radio) continue;
      if (dist > 0.4 && (dx * fx + dz * fz) / dist < cos) continue;
      if (Math.abs(z.pos.y - ctx.jugador.pos.y) > 1.6 * z.def.escala) continue;
      r.push({ z, dist });
    }
    return r.sort((a, b) => a.dist - b.dist).slice(0, def.objetivos).map(x => x.z);
  }

  impactoCuerpo(def) {
    const ctx = this.ctx, j = ctx.jugador;
    ctx.camara.getWorldDirection(_f);
    const dir = _q.set(_f.x, 0, _f.z).normalize().clone();
    let alguno = false, muerte = false;
    for (const z of this.objetivosCuerpo(def)) {
      const punto = z.puntoTorso();
      let dano = def.dano;
      if (def.id === 'katana') {
        // katana: arranca armadura y casco de un tajo; a los débiles los mata de un golpe
        const teniaArmadura = z.quitarArmadura(dir);
        if (z.def.jefe) dano *= 1.6;
        else if (!teniaArmadura) dano = Math.max(dano, z.vida + 1);
        ctx.particulas.emitir('chispas', punto, dir, teniaArmadura ? 1.5 : 0.4);
      }
      const res = z.recibirImpacto(dano, punto, dir, 'torso', def.id);
      z.empujar(dir.x * def.empuje, dir.z * def.empuje);
      if (!res.muerto && def.aturdir && !z.def.jefe && z.estado !== 'muerto') { z.estado = 'aturdido'; z.t = 0; z.duracionAturdido = def.aturdir; }
      ctx.particulas.emitir('sangre', punto, _v.copy(dir).negate(), def.impacto === 'golpe_filo' ? 1.6 : 1.1);
      if (def.impacto === 'golpe_filo') ctx.particulas.emitir('sangreNiebla', punto, dir, 1);
      alguno = true; if (res.muerto) muerte = true;
    }
    if (alguno) {
      ctx.audio.reproducir(def.impacto, { vol: 0.95, reverb: 0.1 });
      j.sacudir(def.id === 'marro' ? 0.45 : 0.25);
      this.kickV -= def.id === 'marro' ? 6 : 3;
      ctx.eventos.emit('arma:impacto', { cabeza: false, muerte });
    }
    ctx.zombis.alertar(ctx.camara.position, 12);
  }

  /** Prepara el barrido del arma cuerpo a cuerpo con su color, tamaño, duración y orientación. */
  iniciarBarrido(def) {
    const b = def.barrido;
    this.barridoCfg = {
      color: b.color ?? 0xffffff, escala: b.escala ?? 1, duracion: b.duracion ?? 0.26, vertical: !!b.vertical,
      retraso: b.retraso ?? def.golpe * def.cadencia * 0.7,        // por defecto, al acabar la preparación
    };
    this.barrido.material.color.setHex(this.barridoCfg.color);
    this.barrido.material.opacity = 0;
    this.barrido.visible = this.barridoCfg.retraso <= 0;
    this.barridoT = 0;
  }

  /**
   * Efecto de barrido de las armas cuerpo a cuerpo: una media luna que cruza la pantalla
   * delante del jugador (textura dibujada en un canvas, sin imágenes externas). Cada arma
   * le da su color, tamaño, duración y orientación (ver 'barrido' en DefArmas.js).
   */
  crearBarrido() {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const g = cv.getContext('2d');
    const cx = 128, cy = 118;
    for (let i = 0; i < 6; i++) {                       // varias pasadas finas: media luna con estrías
      const r = 92 + i * 3.5, w = 9 - i;
      g.strokeStyle = `rgba(255,255,255,${0.95 - i * 0.13})`;
      g.lineWidth = w; g.lineCap = 'round';
      g.beginPath(); g.arc(cx, cy, r, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
    }
    const fade = g.createLinearGradient(0, 0, 256, 0);  // se desvanece en las puntas
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.2, 'rgba(0,0,0,0)'); fade.addColorStop(0.8, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = fade; g.fillRect(0, 0, 256, 128);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    this.barrido = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), mat);
    this.barrido.position.set(0, -0.02, -0.75);
    this.barrido.renderOrder = 10; this.barrido.visible = false;
    this.escena.add(this.barrido);
  }

  // ------------------------------------------------------------------ molotov
  lanzarMolotov() {
    const j = this.ctx.jugador;
    if (this.ocupadoAccion || this.estado === 'cambiando' || !j.vivo) return false;
    if (j.molotovs <= 0) { this.ctx.interfaz?.notificar('No tienes molotovs (cómpralos en la Tienda)'); return false; }
    this.cancelarRecarga();
    this.apuntarAlternado = false;
    this.molotovT = 0; this.molotovModelo.visible = true;
    this.ctx.audio.reproducir('granada_anilla', { vol: 0.4, reverb: 0, tono: 0.6 });
    return true;
  }

  soltarMolotov() {
    const ctx = this.ctx, j = ctx.jugador, cam = ctx.camara;
    if (!j.vivo || j.molotovs <= 0) return;
    j.molotovs--;
    cam.getWorldDirection(_f);
    _r.setFromMatrixColumn(cam.matrixWorld, 0);
    const origen = _v.copy(cam.position).addScaledVector(_f, 0.45).addScaledVector(_r, 0.18); origen.y -= 0.1;
    const dir = _q.copy(_f); dir.y += 0.14; dir.normalize();
    ctx.granadas.lanzar(origen, dir, j.vel, { tipo: 'molotov' });
    ctx.audio.reproducir('granada_lanzar', { vol: 0.6, reverb: 0 });
  }

  // ----------------------------------------------------------------- botiquín
  usarBotiquin() {
    const j = this.ctx.jugador;
    if (this.ocupadoAccion || this.estado === 'cambiando' || !j.vivo) return false;
    if (j.botiquines <= 0) { this.ctx.interfaz?.notificar('No tienes botiquines'); return false; }
    if (j.salud >= j.saludMax) { this.ctx.interfaz?.notificar('Ya tienes la salud al máximo'); return false; }
    this.cancelarRecarga();
    this.botiquinT = 0;
    this.botiquinModelo.grupo.visible = true;
    this.ctx.audio.reproducir('botiquin_abrir', { vol: 0.7, reverb: 0 });
    return true;
  }

  // ----------------------------------------------------------------- granada
  lanzarGranada() {
    const j = this.ctx.jugador;
    if (this.ocupadoAccion || this.estado === 'cambiando' || !j.vivo) return false;
    if (j.granadas <= 0) { this.ctx.interfaz?.notificar('No tienes granadas (cómpralas en la Tienda)'); return false; }
    this.cancelarRecarga();
    this.apuntarAlternado = false;
    this.granadaT = 0;
    this.granadaModelo.visible = true;
    this.ctx.audio.reproducir('granada_anilla', { vol: 0.6, reverb: 0 });
    return true;
  }

  soltarGranada() {
    const ctx = this.ctx, j = ctx.jugador, cam = ctx.camara;
    if (!j.vivo || j.granadas <= 0) return;
    j.granadas--;
    cam.getWorldDirection(_f);
    _r.setFromMatrixColumn(cam.matrixWorld, 0);
    const origen = _v.copy(cam.position).addScaledVector(_f, 0.45).addScaledVector(_r, 0.18); origen.y -= 0.12;
    const dir = _q.copy(_f); dir.y += 0.16; dir.normalize();
    ctx.granadas.lanzar(origen, dir, j.vel);
    ctx.audio.reproducir('granada_lanzar', { vol: 0.6, reverb: 0 });
  }

  // ------------------------------------------------------------ compras en pared
  montarEstaciones(estaciones) {
    for (const o of this.estacionesMontadas) {
      this.ctx.escena.remove(o);
      o.traverse(x => { if (x.isMesh && x.material?.map?.isCanvasTexture) { x.material.map.dispose(); x.material.dispose(); } });
    }
    this.estacionesMontadas = [];
    this.estaciones = estaciones;
    for (const e of estaciones) {
      const g = new THREE.Group();
      const esBot = e.tipo === 'botiquin';
      const m = esBot ? this.constructorArmas.botiquin(false).grupo : this.constructorArmas.crear(e.arma, false).grupo;
      m.scale.setScalar(esBot ? 2.6 : 1.7);
      if (esBot) m.rotation.y = Math.PI / 2;
      g.add(m);
      g.position.copy(e.pos).addScaledVector(e.normal, esBot ? 0.12 : 0.09);
      g.rotation.y = Math.atan2(-e.normal.z, e.normal.x);
      // placa con nombre y precio
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
      const c2 = cv.getContext('2d');
      c2.fillStyle = '#0c0f0c'; c2.fillRect(0, 0, 512, 128);
      c2.strokeStyle = esBot ? '#ff5a4e' : '#7dff4f'; c2.lineWidth = 6; c2.strokeRect(6, 6, 500, 116);
      c2.fillStyle = esBot ? '#ffd0cc' : '#c8ffb0'; c2.font = 'bold 44px Impact, "Arial Black", sans-serif'; c2.textAlign = 'center';
      c2.fillText(esBot ? 'BOTIQUÍN' : ARMAS[e.arma].nombre.toUpperCase(), 256, 56);
      c2.fillStyle = '#ffd24a'; c2.font = 'bold 38px "Courier New", monospace';
      c2.fillText(`${e.precio} PTS`, 256, 104);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const placa = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.275), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      placa.position.copy(e.pos).addScaledVector(e.normal, 0.03); placa.position.y += 0.55;
      placa.lookAt(_v.copy(placa.position).add(e.normal));
      this.ctx.escena.add(g, placa);
      this.estacionesMontadas.push(g, placa);
    }
  }

  buscarEstacion() {
    const j = this.ctx.jugador;
    this.estacionCercana = null;
    if (!this.estaciones) return;
    this.ctx.camara.getWorldDirection(_f);
    for (const e of this.estaciones) {
      const d = Math.hypot(j.pos.x - e.pos.x, j.pos.z - e.pos.z);
      if (d < 2.0 && -(_f.x * e.normal.x + _f.z * e.normal.z) > 0.2) { this.estacionCercana = e; return; }
    }
  }

  /** Texto y coste de la compra disponible en la estación. */
  infoEstacion(e) {
    if (e.tipo === 'botiquin') {
      const j = this.ctx.jugador, lleno = j.botiquines >= j.botiquinesMax;
      return { precio: e.precio, texto: lleno ? `Botiquines al máximo (${j.botiquines}/${j.botiquinesMax})` : `Comprar botiquín (${j.botiquines}/${j.botiquinesMax})`, lleno };
    }
    const tiene = this.inventario[e.arma];
    const precio = tiene ? Math.floor(e.precio / 2) : e.precio;
    const lleno = tiene && tiene.reserva >= ARMAS[e.arma].reservaMax;
    return { precio, texto: lleno ? `${ARMAS[e.arma].nombre}: munición llena` : tiene ? `Munición para ${ARMAS[e.arma].nombre}` : `Comprar ${ARMAS[e.arma].nombre}`, tiene, lleno };
  }

  comprar(e) {
    const info = this.infoEstacion(e);
    if (info.lleno) return;
    if (!this.ctx.puntuacion.gastar(info.precio)) { this.ctx.audio.reproducir('sin_puntos', { bus: 'interfaz', reverb: 0 }); return; }
    this.ctx.audio.reproducir('compra', { bus: 'interfaz', reverb: 0 });
    if (e.tipo === 'botiquin') { this.ctx.jugador.botiquines++; return; }
    if (info.tiene) this.inventario[e.arma].reserva = ARMAS[e.arma].reservaMax;
    else { this.dar(e.arma, false); this.cambiar(e.arma); }
  }

  // ------------------------------------------------------- animación en 1ª persona
  animarVista(dt) {
    const m = this.modelo, j = this.ctx.jugador, def = this.actual.def;
    if (!m) return;
    const g = m.grupo;
    // con la mira telescópica a pantalla completa el arma no se dibuja
    g.visible = !this.miraActiva;
    const pos = _v.copy(m.cadera).lerp(m.apuntar, this.adsEase);
    let rx = 0, ry = 0, rz = 0;
    // carrera
    this.sprintK = suave(this.sprintK, j.corriendo ? 1 : 0, 10, dt);
    pos.x -= 0.05 * this.sprintK; pos.y -= 0.05 * this.sprintK; pos.z += 0.04 * this.sprintK;
    ry += 0.75 * this.sprintK; rx -= 0.28 * this.sprintK; rz += 0.2 * this.sprintK;
    // balanceo al andar (figura en ocho)
    const amp = j.enSuelo ? Math.min(1, j.velHoriz / 5) * (1 - this.adsEase * 0.85) * (j.corriendo ? 1.6 : 1) : 0;
    pos.x += Math.cos(j.fase) * 0.011 * amp; pos.y += Math.sin(j.fase * 2) * 0.008 * amp;
    rz += Math.cos(j.fase) * 0.02 * amp;
    // respiración en reposo
    const t = performance.now() * 0.001;
    pos.y += Math.sin(t * 1.6) * 0.0018 * (1 - this.adsEase * 0.8);
    // inercia con el ratón (sway)
    const r = j.ultimoRaton || { dx: 0, dy: 0 };
    const k = 1 - this.adsEase * 0.7;
    this.balanceo.x = suave(this.balanceo.x, THREE.MathUtils.clamp(-r.dx * 0.0006, -0.04, 0.04) * k, 9, dt);
    this.balanceo.y = suave(this.balanceo.y, THREE.MathUtils.clamp(r.dy * 0.0006, -0.04, 0.04) * k, 9, dt);
    pos.x += this.balanceo.x; pos.y += this.balanceo.y; ry += this.balanceo.x * 1.5; rx += this.balanceo.y * 1.2;
    // retroceso (muelle)
    this.kickV += (-this.kick * 260 - this.kickV * 22) * dt; this.kick += this.kickV * dt;
    pos.z += this.kick * 0.012 * (1 - this.adsEase * 0.5); rx += this.kick * 0.04 * (1 - this.adsEase * 0.6);
    // recarga
    if (this.estado === 'recargando') {
      let f;
      if (def.tipo === 'bomba') { f = Math.min(1, this.t / 0.25); if (this.fase === 'fin') f = Math.max(0, this.tFase / tiempoRecarga(def, 'recargaFin')); }
      else { const p = this.t / this.recargaTotal; f = Math.sin(Math.min(1, p) * Math.PI); }
      if (def.recargaTipo === 'basculante') {
        // se abre por la bisagra, entran los dos cartuchos y se cierra de golpe
        const p = this.t / this.recargaTotal;
        const abierto = p < 0.12 ? p / 0.12 : p < 0.78 ? 1 : p < 0.86 ? 1 - (p - 0.78) / 0.08 : 0;
        m.canones.rotation.x = -0.62 * abierto;
        m.cartuchos.visible = p > 0.36 && p < 0.66;
        if (m.cartuchos.visible) m.cartuchos.position.set(0, 0.05 - Math.min(1, (p - 0.36) / 0.25) * 0.05, 0.05 - Math.min(1, (p - 0.36) / 0.25) * 0.06);
        pos.y -= 0.03 * f; rx += 0.3 * f; rz += 0.25 * f;
      } else {
        pos.y -= 0.05 * f; pos.x -= 0.02 * f; rz += 0.55 * f; rx += 0.22 * f;
      }
      if (def.tipo !== 'bomba' && m.cargador) {
        const p = this.t / this.recargaTotal;
        const fuera = p < 0.18 ? 0 : p < 0.35 ? (p - 0.18) / 0.17 : p < 0.5 ? 1 : p < 0.62 ? 1 - (p - 0.5) / 0.12 : 0;
        m.cargador.position.y = (m.cargadorY0 ?? (m.cargadorY0 = m.cargador.position.y)) - fuera * 0.22;
        m.cargador.visible = !(p > 0.3 && p < 0.42);
      } else if (def.tipo === 'bomba' && this.fase === 'cartucho') {
        const c = 1 - this.tFase / tiempoRecarga(def, 'recargaCartucho');
        m.cartucho.position.y = 0.0 + Math.sin(c * Math.PI) * 0.02; rx -= Math.sin(c * Math.PI) * 0.06;
      }
    } else {
      if (m.cargador && m.cargadorY0 !== undefined) { m.cargador.position.y = m.cargadorY0; m.cargador.visible = true; }
      if (m.canones) m.canones.rotation.x = suave(m.canones.rotation.x, 0, 20, dt);
    }
    // corredera / bomba
    if (m.corredera) {
      this.correderaT = Math.max(0, this.correderaT - dt);
      let atras = this.correderaT > 0 ? 1 : 0;
      if (this.estado === 'recargando' && this.recargaVacia && def.tipo !== 'bomba') { const p = this.t / this.recargaTotal; if (p > 0.8 && p < 0.9) atras = 1; }
      if (def.ranura === 1 && this.actual.municion === 0 && this.estado !== 'recargando') atras = 1;   // corredera abierta sin balas
      m.corredera.position.z = atras * m.recorrido;
    }
    if (m.bomba) {
      const b = this.bombaT > 0 ? Math.sin(Math.min(1, (this.bombaT - 0.12) / 0.4) * Math.PI) : 0;
      m.bomba.position.z = Math.max(0, b) * m.recorrido;
      if (this.bombaT > 0.12) rz -= Math.max(0, b) * 0.05;
    }
    // cambio de arma
    if (this.estado === 'cambiando') {
      const c = this.cambioT < 0.25 ? this.cambioT / 0.25 : 1 - (this.cambioT - 0.25) / 0.3;
      pos.y -= 0.3 * Math.max(0, c); rx -= 0.6 * Math.max(0, c);
    }
    // cuchillo: el arma se aparta y el cuchillo cruza la pantalla
    if (this.cuchilloT >= 0) {
      const c = this.cuchilloT / CUCHILLO.duracion;
      const fuera = Math.sin(Math.min(1, c * 1.4) * Math.PI);
      pos.y -= 0.25 * fuera; pos.x += 0.08 * fuera;
      const kn = this.cuchilloModelo;
      const s = Math.min(1, c / 0.45);
      kn.position.set(0.25 - s * 0.45, -0.1 + Math.sin(s * Math.PI) * 0.06, -0.38 + Math.sin(s * Math.PI) * -0.06);
      kn.rotation.set(-0.3, 0.6 - s * 1.6, -0.9 + s * 0.6);
      if (c > 0.6) kn.position.y -= (c - 0.6) * 0.8;
    }
    // granada: el arma baja, el brazo echa la granada atrás y la lanza hacia delante
    if (this.granadaT >= 0) {
      const c = this.granadaT / GRANADA.lanzamiento;
      const fuera = Math.sin(Math.min(1, c * 1.15) * Math.PI);
      pos.y -= 0.3 * fuera; rx -= 0.45 * fuera;
      const gm = this.granadaModelo, k = this.granadaT / GRANADA.suelta;
      if (k < 1) { const e = Math.sin(k * Math.PI * 0.5); gm.position.set(0.16 + 0.04 * e, -0.16 + 0.1 * e, -0.3 + 0.12 * e); gm.rotation.set(-0.4 - 0.6 * e, 0.2, -0.2); }
      else gm.visible = false;                                   // ya va volando por el mundo
    }
    // golpe cuerpo a cuerpo: preparación (atrás), tajo cruzando la pantalla y vuelta
    if (this.golpeT >= 0 && def.cuerpo) {
      const c = this.golpeT / def.cadencia, gp = def.golpe;
      let prep, tajo;
      if (c < gp * 0.7) { prep = c / (gp * 0.7); tajo = 0; }
      else if (c < gp * 1.25) { prep = 1; tajo = (c - gp * 0.7) / (gp * 0.55); }
      else { prep = Math.max(0, 1 - (c - gp * 1.25) / (1 - gp * 1.25)); tajo = prep; }
      const e = prep * prep * (3 - 2 * prep), t = 1 - Math.pow(1 - Math.min(1, tajo), 3);
      // preparación: el arma se echa hacia atrás y arriba
      pos.x += 0.08 * e * (1 - t); pos.y += 0.06 * e * (1 - t); rz -= 0.5 * e * (1 - t); rx -= 0.35 * e * (1 - t);
      // tajo: cruza de derecha a izquierda y baja
      pos.x -= 0.42 * t * e; pos.y -= 0.1 * t * e; pos.z -= 0.12 * t * e;
      ry += 1.1 * t * e; rz += 1.3 * t * e; rx -= 0.5 * t * e;
    }
    // molotov: igual que la granada, con la botella encendida
    if (this.molotovT >= 0) {
      const c = this.molotovT / MOLOTOV.lanzamiento;
      const fuera = Math.sin(Math.min(1, c * 1.15) * Math.PI);
      pos.y -= 0.3 * fuera; rx -= 0.45 * fuera;
      const gm = this.molotovModelo, k = this.molotovT / MOLOTOV.suelta;
      if (k < 1) { const e = Math.sin(k * Math.PI * 0.5); gm.position.set(0.16 + 0.04 * e, -0.18 + 0.1 * e, -0.3 + 0.12 * e); gm.rotation.set(-0.3 - 0.6 * e, 0.2, -0.2); }
      else gm.visible = false;
    }
    // botiquín: el arma baja, el botiquín sube, se abre la tapa y vuelve a bajar
    if (this.botiquinT >= 0) {
      const c = this.botiquinT / BOTIQUIN.duracion;
      const fuera = Math.sin(Math.min(1, c * 1.2) * Math.PI);
      pos.y -= 0.35 * fuera; rx -= 0.5 * fuera;
      const b = this.botiquinModelo, sube = c < 0.25 ? c / 0.25 : c > 0.82 ? 1 - (c - 0.82) / 0.18 : 1;
      b.grupo.position.set(0.0, -0.32 + 0.2 * sube, -0.32);
      b.grupo.rotation.set(0.5 - 0.3 * sube, 0, 0.05);
      b.tapa.rotation.x = -1.6 * (c > 0.35 && c < 0.85 ? Math.min(1, (c - 0.35) / 0.15) : 0);
    }
    g.position.copy(pos);
    g.rotation.set(rx, ry, rz);
  }

  redimensionar(aspecto) { this.camara.aspect = aspecto; this.camara.updateProjectionMatrix(); }
}
