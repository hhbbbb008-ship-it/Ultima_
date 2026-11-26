import * as THREE from 'three';

/**
 * Controlador del jugador en primera persona:
 * movimiento con aceleración/fricción, carrera (siempre disponible), dash de
 * esquive con cargas, salto con "coyote time" y búfer, colisiones cilíndricas,
 * salud con regeneración y efectos de cámara (balanceo, inclinación, retroceso
 * con muelle, sacudidas).
 *
 * Valores ajustables del dash:
 *  DASH_DURACION  duración del impulso en segundos (el jugador es invulnerable mientras dura)
 *  DASH_VEL       velocidad del impulso (m/s)
 *  DASH_CARGAS    cargas máximas
 *  DASH_RECARGA   segundos que tarda en volver cada carga (de una en una)
 */
export const C = {
  VEL_ANDAR: 4.4, VEL_CORRER: 7.0, VEL_APUNTAR: 2.5,
  ACEL_SUELO: 11, FRICCION: 9, ACEL_AIRE: 2.2,
  GRAVEDAD: 19, SALTO: 6.0, COYOTE: 0.1, BUFER_SALTO: 0.14,
  RADIO: 0.34, ALTURA: 1.8, OJOS: 1.66,
  REGEN_ESPERA: 4.5, REGEN_VEL: 22,
  DASH_VEL: 19, DASH_DURACION: 0.2, DASH_CARGAS: 3, DASH_RECARGA: 4,
  CHALECO_MAX: 100, CHALECO_ABSORBE: 0.7,
};

export class Jugador {
  constructor(ctx) {
    this.ctx = ctx;
    this.camara = ctx.camara;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.saludMax = 100;
    this.botiquines = 0; this.botiquinesMax = 3;
    this.granadas = 0; this.granadasMax = 4;
    this.chalecos = 0; this.chalecosMax = 2;
    this.bebidas = 0; this.bebidasMax = 3;
    this.molotovs = 0; this.molotovsMax = 3;
    this.chaleco = 0;                              // puntos de protección del chaleco
    this.dashCargas = C.DASH_CARGAS; this.dashCargasMax = C.DASH_CARGAS; this.dashRecargaT = 0;
    this.rec = { p: 0, y: 0, vp: 0, vy: 0 };     // retroceso de cámara (muelle)
    this.reiniciar(new THREE.Vector3(0, 0, 0), 0);
    this._f = new THREE.Vector3(); this._r = new THREE.Vector3();
  }

  reiniciar(pos, yaw) {
    this.pos.copy(pos); this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.salud = this.saludMax; this.vivo = true; this.botiquines = 0; this.granadas = 0;
    this.chaleco = 0; this.dashT = 0;
    this.dashCargas = C.DASH_CARGAS; this.dashRecargaT = 0;
    this.dashDir = this.dashDir || new THREE.Vector2();
    this.enSuelo = true; this.coyote = 0; this.buferSalto = 0;
    this.tiempoSinDano = 99; this.sacudida = 0; this.fase = 0; this.inclinacion = 0;
    this.distPasos = 0; this.caidaCam = 0; this.bloqueoCarrera = 0;
    this.corriendo = false; this.moviendose = false; this.velHoriz = 0;
    this.fov = this.ctx.ajustes.gen.fov; this.muerteT = 0;
    this.rec.p = this.rec.y = this.rec.vp = this.rec.vy = 0;
  }

  get apuntando() { return this.ctx.armas?.ads > 0.5; }
  /** Invulnerable mientras dura el impulso del dash. */
  get invulnerable() { return this.dashT > 0; }
  /** Progreso (0-1) de la carga de dash que se está recargando. */
  get dashProgreso() { return this.dashCargas >= C.DASH_CARGAS ? 1 : this.dashRecargaT / C.DASH_RECARGA; }

  actualizar(dt, entrada) {
    const aj = this.ctx.ajustes.gen;
    if (!this.vivo) { this.animarMuerte(dt); return; }

    // --- Ratón ---
    const r = entrada.consumirRaton();
    const zoomSens = this.ctx.armas ? 1 - (1 - this.ctx.armas.factorZoom) * this.ctx.armas.ads : 1;
    const friccion = this.ctx.armas?.friccion ?? 1;            // asistencia: la mira "frena" sobre un zombi
    const s = 0.0021 * aj.sensibilidad * zoomSens * friccion;
    this.yaw -= r.dx * s;
    this.pitch -= r.dy * s * (aj.invertirY ? -1 : 1);
    this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch));
    this.ultimoRaton = r;

    // --- Intención de movimiento ---
    let ix = 0, iz = 0;
    if (entrada.activo('adelante')) iz -= 1;
    if (entrada.activo('atras')) iz += 1;
    if (entrada.activo('izquierda')) ix -= 1;
    if (entrada.activo('derecha')) ix += 1;
    if (entrada.eje.activo) { ix += entrada.eje.x; iz += entrada.eje.z; }   // joystick táctil (analógico)
    if (entrada.ejeMando.activo) { ix += entrada.ejeMando.x; iz += entrada.ejeMando.z; }   // stick izquierdo del control
    let L = Math.hypot(ix, iz); if (L > 1) { ix /= L; iz /= L; L = 1; }
    this.moviendose = L > 0.12;
    if (!this.moviendose) { ix = 0; iz = 0; }

    // --- Carrera (no gasta nada: siempre disponible, también hacia atrás) ---
    this.bloqueoCarrera = Math.max(0, this.bloqueoCarrera - dt);
    const quiereCorrer = entrada.activo('correr') && Math.abs(iz) > 0.3 && this.enSuelo !== false && !this.apuntando && this.bloqueoCarrera <= 0;
    this.corriendo = quiereCorrer && this.moviendose;

    const pesoArma = this.ctx.armas?.actual?.def.velMov ?? 1;
    let vmax = (this.corriendo ? C.VEL_CORRER : C.VEL_ANDAR) * pesoArma;
    if (this.apuntando) vmax = C.VEL_APUNTAR;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const dx = ix * cy + iz * sy, dz = -ix * sy + iz * cy;
    const objX = dx * vmax, objZ = dz * vmax;

    // --- Dash de esquive (cargas) y bebida energética (recupera una carga) ---
    this.actualizarDash(dt);
    if (entrada.pulsado('dash')) this.dash(ix, iz);
    if (entrada.pulsado('bebida')) this.beberBebida();
    if (entrada.pulsado('chaleco')) this.ponerseChaleco();


    // --- Aceleración / fricción (sensación de shooter de PC: respuesta rápida pero no instantánea) ---
    if (this.dashT > 0) {
      this.dashT = Math.max(0, this.dashT - dt);
      this.vel.x = this.dashDir.x * C.DASH_VEL; this.vel.z = this.dashDir.y * C.DASH_VEL;
    } else if (this.enSuelo) {
      const k = this.moviendose ? C.ACEL_SUELO : C.FRICCION;
      const f = 1 - Math.exp(-k * dt);
      this.vel.x += (objX - this.vel.x) * f;
      this.vel.z += (objZ - this.vel.z) * f;
    } else {
      const f = 1 - Math.exp(-C.ACEL_AIRE * dt);
      if (this.moviendose) { this.vel.x += (objX - this.vel.x) * f; this.vel.z += (objZ - this.vel.z) * f; }
    }

    // --- Salto ---
    this.coyote = this.enSuelo ? C.COYOTE : this.coyote - dt;
    this.buferSalto = entrada.pulsado('saltar') ? C.BUFER_SALTO : this.buferSalto - dt;
    if (this.buferSalto > 0 && this.coyote > 0) {
      this.vel.y = C.SALTO; this.enSuelo = false; this.coyote = 0; this.buferSalto = 0;
    }
    this.vel.y -= C.GRAVEDAD * dt;

    // --- Integración y colisiones ---
    const vyAntes = this.vel.y;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    const col = this.ctx.colisiones;
    col.resolverCilindro(this.pos, C.RADIO, C.ALTURA, true);
    this.pos.y += this.vel.y * dt;
    const suelo = col.alturaSuelo(this.pos.x, this.pos.z, C.RADIO, this.pos.y + 0.05);
    const estabaSuelo = this.enSuelo;
    if (this.pos.y <= suelo) {
      // subir bordillos suavemente
      this.pos.y = suelo; this.vel.y = 0; this.enSuelo = true;
      if (!estabaSuelo && vyAntes < -4) {
        this.caidaCam = Math.min(0.12, -vyAntes * 0.012);
        this.ctx.audio.reproducir('aterrizaje', { vol: 0.5, reverb: 0.05 });
      }
    } else if (this.pos.y - suelo > 0.25 || this.vel.y > 0) this.enSuelo = false;
    else { this.pos.y = suelo; this.enSuelo = true; this.vel.y = Math.min(0, this.vel.y); }
    // techo de cajas (salto bajo una plataforma)
    this.velHoriz = Math.hypot(this.vel.x, this.vel.z);

    // --- Pasos ---
    if (this.enSuelo && this.velHoriz > 0.5) {
      this.distPasos += this.velHoriz * dt;
      const zancada = this.corriendo ? 2.6 : 2.1;
      if (this.distPasos > zancada) { this.distPasos = 0; this.ctx.audio.reproducir('paso', { vol: this.corriendo ? 0.45 : 0.3, reverb: 0.05 }); }
      this.fase += dt * this.velHoriz * 2.1;
    }

    // --- Salud ---
    this.tiempoSinDano += dt;
    if (this.tiempoSinDano > C.REGEN_ESPERA && this.salud < this.saludMax) this.salud = Math.min(this.saludMax, this.salud + C.REGEN_VEL * dt);
    if (this.salud < 35) {
      this.latido = (this.latido || 0) - dt;
      if (this.latido <= 0) { this.latido = 0.5 + this.salud / 50; this.ctx.audio.reproducir('latido', { bus: 'interfaz', vol: 0.9, reverb: 0 }); }
    }
    this.aplicarCamara(dt, ix);
  }

  aplicarCamara(dt, ix) {
    const aj = this.ctx.ajustes.gen;
    // muelle del retroceso
    const R = this.rec;
    R.vp += (-R.p * 140 - R.vp * 18) * dt; R.p += R.vp * dt;
    R.vy += (-R.y * 140 - R.vy * 18) * dt; R.y += R.vy * dt;
    // balanceo de cabeza al andar
    const amp = this.enSuelo ? Math.min(1, this.velHoriz / 6) * (this.apuntando ? 0.25 : 1) : 0;
    const bobY = Math.sin(this.fase * 2) * 0.035 * amp;
    const bobX = Math.cos(this.fase) * 0.025 * amp;
    this.caidaCam *= Math.exp(-8 * dt);
    this.inclinacion += ((-ix * 0.018) - this.inclinacion) * (1 - Math.exp(-8 * dt));
    // sacudida
    this.sacudida = Math.max(0, this.sacudida - dt * 2.5);
    const sh = this.sacudida * this.sacudida * aj.sacudida;
    const t = performance.now() * 0.001;
    const shx = (Math.sin(t * 47) + Math.sin(t * 23.7)) * 0.02 * sh, shy = (Math.sin(t * 39) + Math.sin(t * 17.3)) * 0.02 * sh;

    const cam = this.camara;
    const ox = Math.cos(this.yaw) * bobX, oz = -Math.sin(this.yaw) * bobX;
    cam.position.set(this.pos.x + ox, this.pos.y + C.OJOS + bobY - this.caidaCam, this.pos.z + oz);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch + R.p + shy, this.yaw + R.y + shx, this.inclinacion + shx * 0.5);
    // FOV: zoom al apuntar, ensanche al correr
    const armas = this.ctx.armas;
    let fovObj = aj.fov * (armas ? 1 - (1 - armas.factorZoom) * armas.ads : 1);
    if (this.corriendo) fovObj += 5;
    this.fov += (fovObj - this.fov) * (1 - Math.exp(-12 * dt));
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }

  animarMuerte(dt) {
    this.muerteT += dt;
    const k = Math.min(1, this.muerteT / 1.1);
    const e = 1 - Math.pow(1 - k, 3);
    const cam = this.camara;
    cam.position.set(this.pos.x, this.pos.y + C.OJOS - e * 1.35, this.pos.z);
    cam.rotation.set(this.pitch * (1 - e) + e * 0.5, this.yaw, e * 1.2, 'YXZ');
  }

  /** Recarga de las cargas de dash: vuelven de una en una, cada C.DASH_RECARGA segundos. */
  actualizarDash(dt) {
    if (this.dashCargas >= C.DASH_CARGAS) { this.dashCargas = C.DASH_CARGAS; this.dashRecargaT = 0; return; }
    this.dashRecargaT += dt;
    while (this.dashRecargaT >= C.DASH_RECARGA && this.dashCargas < C.DASH_CARGAS) { this.dashRecargaT -= C.DASH_RECARGA; this.dashCargas++; }
    if (this.dashCargas >= C.DASH_CARGAS) this.dashRecargaT = 0;
  }

  /**
   * Dash de esquive (tecla Q, botón B del control o botón ⇥): impulso corto y muy rápido
   * hacia donde te mueves (o hacia atrás si estás quieto). Gasta una carga y te hace
   * invulnerable mientras dura el impulso. Devuelve true si se hizo.
   */
  dash(ix = 0, iz = 0) {
    if (!this.vivo || this.dashT > 0) return false;
    if (this.dashCargas <= 0) { this.ctx.interfaz?.notificar('Dash recargando…'); return false; }
    this.dashCargas--;
    const L = Math.hypot(ix, iz), sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fx = L > 0.12 ? (ix / L) * cy + (iz / L) * sy : sy;       // quieto: hacia atrás
    const fz = L > 0.12 ? -(ix / L) * sy + (iz / L) * cy : cy;
    this.dashDir.set(fx, fz);
    this.dashT = C.DASH_DURACION;
    this.sacudir(0.2);
    this.ctx.audio.reproducir('recoger', { bus: 'interfaz', vol: 0.5, reverb: 0 });
    this.ctx.eventos.emit('jugador:dash', { cargas: this.dashCargas });
    return true;
  }

  /** Bebida energética (tecla B): recupera al instante una carga de dash. */
  beberBebida() {
    if (!this.vivo) return false;
    if (this.bebidas <= 0) { this.ctx.interfaz?.notificar('No tienes bebidas energéticas'); return false; }
    if (this.dashCargas >= C.DASH_CARGAS) { this.ctx.interfaz?.notificar('Las cargas de dash ya están llenas'); return false; }
    this.bebidas--;
    this.dashCargas++;
    if (this.dashCargas >= C.DASH_CARGAS) this.dashRecargaT = 0;
    this.ctx.audio.reproducir('beber', { bus: 'interfaz', vol: 0.7, reverb: 0 });
    this.ctx.interfaz?.notificar(`+1 carga de dash (${this.dashCargas}/${C.DASH_CARGAS})`);
    return true;
  }

  /** Chaleco: se llena hasta el máximo; absorbe parte del daño mientras tenga protección. */
  ponerseChaleco() {
    if (!this.vivo || this.chalecos <= 0 || this.chaleco >= C.CHALECO_MAX) {
      if (this.chalecos <= 0) this.ctx.interfaz?.notificar('No tienes chalecos');
      return false;
    }
    this.chalecos--; this.chaleco = C.CHALECO_MAX;
    this.ctx.audio.reproducir('chaleco', { bus: 'interfaz', vol: 0.8, reverb: 0 });
    return true;
  }

  /** Daño recibido. origen (opcional) sirve para el indicador direccional. */
  recibirDano(cant, origen, tipo) {
    if (!this.vivo || this.ctx.partida?.dios || this.invulnerable) return;
    if (this.chaleco > 0 && tipo !== 'acido') {
      const absorbido = Math.min(this.chaleco, cant * C.CHALECO_ABSORBE);
      this.chaleco -= absorbido; cant -= absorbido;
    }
    this.salud -= cant;
    this.tiempoSinDano = 0;
    if (tipo !== 'acido' || Math.random() < 0.1) this.sacudida = Math.min(1, this.sacudida + cant / 40);
    let angulo = null;
    if (origen) {
      const dx = origen.x - this.pos.x, dz = origen.z - this.pos.z;
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      angulo = Math.atan2(dx * c - dz * s, -dx * s - dz * c);   // 0 = delante, positivo = derecha
    }
    this.ctx.eventos.emit('jugador:dano', { cant, angulo, tipo });
    if (tipo !== 'acido') this.ctx.audio.reproducir('dano_jugador', { bus: 'interfaz', vol: 0.8, reverb: 0 });
    if (this.salud <= 0) {
      this.salud = 0; this.vivo = false; this.muerteT = 0;
      this.ctx.eventos.emit('jugador:muerto');
      this.ctx.armas.escena.visible = false;
    }
  }

  /** Reaparición en sala: salud completa en pos, conservando inventario y equipo. */
  revivir(pos, yaw) {
    this.pos.copy(pos); this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.salud = this.saludMax; this.vivo = true; this.muerteT = 0;
    this.tiempoSinDano = 99; this.sacudida = 0; this.caidaCam = 0;
    this.ctx.eventos.emit('jugador:revivido');
  }

  /** Cura (botiquín). Devuelve la cantidad realmente curada. */
  curar(cant) {
    const antes = this.salud;
    this.salud = Math.min(this.saludMax, this.salud + cant);
    return this.salud - antes;
  }

  empujar(x, y, z) { this.vel.x += x; this.vel.y += y; this.vel.z += z; if (y > 0) this.enSuelo = false; }

  /** Retroceso en grados (vertical y horizontal). */
  retroceso(v, h) {
    const k = Math.PI / 180;
    this.rec.vp += v * k * 22;
    this.rec.vy += (Math.random() - 0.5) * 2 * h * k * 22;
    // parte del retroceso se queda (hay que compensarlo con el ratón, como en un shooter de PC)
    this.pitch = Math.min(1.52, this.pitch + v * k * 0.35);
  }

  sacudir(i) { this.sacudida = Math.min(1.2, this.sacudida + i); }

  /** Vector "adelante" de la cámara. */
  adelante(v = this._f) { return this.camara.getWorldDirection(v); }
}
