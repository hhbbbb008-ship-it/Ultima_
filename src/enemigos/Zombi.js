import * as THREE from 'three';
import { T } from '../red/protocolo.js';
import { TIPOS } from './TiposZombi.js';
import { crearModeloZombi, aplicarLOD, mostrarHueso, sustituirMaterial } from './ModeloZombi.js';

/**
 * Zombi individual: máquina de estados de IA, movimiento con evitación,
 * ataques por tipo, reacciones a impactos, muerte y animación procedural.
 *
 * Estados: emerger → (deambular | perseguir) → atacar / escupir / preparaCarga /
 *          cargando / aturdido → muerto → (reserva)
 */
const DURACION_CADAVER = [3, 5, 8, 14, 25];
const _v = new THREE.Vector3(), _d = { x: 0, z: 0 };
const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const rnd = (a) => a[0] + Math.random() * (a[1] - a[0]);

export class Zombi {
  constructor(gestor, tipo) {
    this.g = gestor; this.ctx = gestor.ctx;
    this.tipo = tipo; this.def = TIPOS[tipo];
    this.modelo = crearModeloZombi(this.ctx.recursos, tipo, this.def);
    this.raiz = this.modelo.raiz; this.h = this.modelo.huesos;
    this.raiz.rotation.order = 'YXZ';
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.activo = false; this.lod = -1;
    this.baseCadera = this.h.cadera.position.y;
    this.inclinacionBase = this.h.columna.userData.inclinacion || 0;
  }

  activar(pos, mods) {
    const d = this.def;
    this.pos.copy(pos); this.vel.set(0, 0, 0);
    this.vidaMax = this.vida = d.vida * mods.vida;
    this.danoMult = mods.dano;
    this.velBase = rnd(d.vel) * mods.vel; this.velAlertaV = rnd(d.velAlerta) * mods.vel;
    this.estado = 'emerger'; this.t = 0;
    this.alerta = this.tipo === 'corredor' || this.tipo === 'coloso' || mods.alerta;
    this.fase = Math.random() * 10; this.cojera = this.tipo === 'caminante' && Math.random() < 0.3 ? 0.5 : 0;
    this.balanceoCabeza = Math.random() * 6;
    this.cascoVida = d.cascoVida || 0;
    this.armadura = d.armadura || 0;          // por zombi: la katana puede arrancarla
    if (this.modelo.sust.size) sustituirMaterial(this.modelo, 'armadura', null);
    if (this.modelo.casco) mostrarHueso(this.modelo.casco, true);
    if (this.modelo.placas) mostrarHueso(this.modelo.placas, true);
    mostrarHueso(this.h.cabeza, true);
    this.flinch = { x: 0, z: 0, vx: 0, vz: 0 };
    this.empuje = { x: 0, z: 0 };
    this.cooldown = 0; this.escupirT = 1.5 + Math.random() * 2; this.cargaT = 3 + Math.random() * 3;
    this.vozT = 1 + Math.random() * 5;
    this.vistaT = Math.random() * 0.5; this.veJugador = false;
    this.atascoT = 0; this.ultimaX = pos.x; this.ultimaZ = pos.z; this.revisionT = 2;
    this.yaw = Math.atan2(-pos.x, -pos.z);
    this.caidaDir = 1; this.golpeado = false;
    this.raiz.visible = true;
    this.raiz.rotation.set(0, this.yaw, 0);
    this.raiz.position.set(pos.x, -1.9 * d.escala, pos.z);
    this.activo = true;
    this.lod = -1; this.cuadro = Math.floor(Math.random() * 4);
    if (!this.raiz.parent) this.ctx.escena.add(this.raiz);
    this.ctx.particulas.emitir('tierra', { x: pos.x, y: 0.05, z: pos.z }, null, 1.2, d.escala);
    this.ctx.audio.reproducir('emerger', { pos, vol: 0.7, ref: 3, reverb: 0.1 });
  }

  desactivar() {
    this.activo = false; this.raiz.visible = false;
    if (this.raiz.parent) this.raiz.parent.remove(this.raiz);
  }

  get vivo() { return this.activo && this.estado !== 'muerto'; }

  puntoTorso() { this.h.pecho.getWorldPosition(_v); return _v.clone(); }

  empujar(x, z) { this.empuje.x += x / this.def.masa; this.empuje.z += z / this.def.masa; }

  // ----------------------------------------------------------------- daño
  recibirImpacto(dano, punto, dir, parte, fuente) {
    if (!this.vivo) return { muerto: false };
    if (this.replica) this.ctx.replicacion.registrarDano(this, dano, parte, fuente, dir);
    const d = this.def;
    let real = dano;
    if (this.armadura && parte === 'torso') {
      real *= this.armadura;
      if (Math.random() < 0.4) this.ctx.particulas.emitir('chispas', punto, dir, 0.4);
    }
    if (parte === 'cabeza' && this.cascoVida > 0) {
      this.cascoVida -= real; real *= 0.3;
      this.ctx.particulas.emitir('chispas', punto, _v.copy(dir).negate(), 0.8);
      this.ctx.audio.reproducir('impacto_metal', { pos: punto, vol: 0.7, ref: 3 });
      if (this.cascoVida <= 0) this.perderCasco(dir);
    }
    if (this.estado === 'emerger') real *= 1.2;
    this.vida -= real;
    this.alerta = true;
    // reacción física: el torso se sacude en la dirección del impacto
    const k = Math.min(2.5, real / 25) / d.masa;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    this.flinch.vx += (dir.x * sy + dir.z * cy) * k * 6;    // eje adelante local
    this.flinch.vz += (dir.x * cy - dir.z * sy) * k * 6;    // eje lateral local
    this.empujar(dir.x * k * 0.6, dir.z * k * 0.6);
    this.ctx.eventos.emit('zombi:impacto', { zombi: this, parte, dano: real });
    this.ctx.audio.reproducir(parte === 'cabeza' ? 'impacto_cabeza' : 'impacto_carne', { pos: punto, vol: 0.55, ref: 3, reverb: 0.1 });
    if (this.vida <= 0) { this.morir(dir, parte, fuente); return { muerto: true }; }
    if (Math.random() < 0.25) this.voz('dolor', 0.7);
    // aturdimiento con golpes fuertes (no afecta al coloso salvo cargas)
    if (!d.jefe && real > this.vidaMax * 0.33 && this.estado !== 'atacar') { this.estado = 'aturdido'; this.t = 0; this.duracionAturdido = 0.35; }
    return { muerto: false };
  }

  /** Arranca de golpe la armadura del torso y el casco (katana). Devuelve si tenía algo que quitar. */
  quitarArmadura(dir, remoto = false) {
    if (!this.armadura && this.cascoVida <= 0) return false;
    if (this.replica && !remoto) this.ctx.replicacion.registrarDano(this, 0, 'torso', '!arm', dir);
    this.armadura = 0;
    sustituirMaterial(this.modelo, 'armadura', 'ropaMarron');
    if (this.modelo.placas) mostrarHueso(this.modelo.placas, false);     // las placas salen volando
    if (this.cascoVida > 0) { this.cascoVida = 0; this.perderCasco(dir); }
    const p = this.puntoTorso();
    this.ctx.particulas.emitir('chispas', p, dir, 3);
    this.ctx.particulas.emitir('escombro', p, dir, 0.6, 0.6);
    this.ctx.audio.reproducir('impacto_metal', { pos: p, vol: 1, ref: 4 });
    return true;
  }

  /** Daño de fuego (molotov): sin sacudidas ni sonidos de impacto por cada llama. */
  quemar(dano) {
    if (!this.vivo) return false;
    if (this.replica) this.ctx.replicacion.registrarDano(this, dano, 'torso', 'fuego', null);
    this.vida -= dano; this.alerta = true;
    this.ctx.eventos.emit('zombi:impacto', { zombi: this, parte: 'torso', dano });
    if (this.vida <= 0) { this.morir(new THREE.Vector3(0, 0, 1), 'torso', 'fuego'); return true; }
    if (Math.random() < 0.08) this.voz('dolor', 0.8);
    return false;
  }

  perderCasco(dir) {
    if (!this.modelo.casco) return;
    mostrarHueso(this.modelo.casco, false);
    this.h.cabeza.getWorldPosition(_v);
    this.ctx.particulas.emitir('chispas', _v, dir, 2);
    this.ctx.particulas.emitir('escombro', _v, dir, 0.3, 0.6);
  }

  morir(dir, parte, fuente) {
    const ctx = this.ctx, d = this.def;
    this.estado = 'muerto'; this.t = 0;
    if (this.replica) this.previstoT = performance.now();    // muerte prevista hasta que el anfitrión la confirme
    this.h.cabeza.getWorldPosition(_v);
    const posCabeza = _v.clone();
    if (parte === 'cabeza' && ctx.ajustes.gen.gore && !d.jefe) {
      mostrarHueso(this.h.cabeza, false);                    // decapitación por disparo a la cabeza
      ctx.particulas.emitir('sangreCabeza', posCabeza, dir, 1);
      ctx.particulas.emitir('sangreNiebla', posCabeza, dir, 3);
    }
    // cae hacia delante si le disparan por la espalda; si no, hacia atrás
    const adelante = Math.sin(this.yaw) * dir.x + Math.cos(this.yaw) * dir.z;
    this.caidaDir = adelante > 0 ? 1 : -1;
    this.duracionCaida = d.jefe ? 1.3 : 0.75;
    this.vidaCadaver = DURACION_CADAVER[ctx.ajustes.g.efectos];
    this.voz('muerte', 1);
    ctx.calcas.manchaSangre({ x: this.pos.x + dir.x * 0.6, y: 0.0, z: this.pos.z + dir.z * 0.6 }, { x: 0, y: 1, z: 0 }, 1.4 * d.escala);
    if (this.tipo === 'escupidor') {
      ctx.particulas.emitir('acido', this.puntoTorso(), null, 2.5);
      ctx.calcas.charcoAcido(this.pos, 1.6, 9, 4);
      ctx.audio.reproducir('acido_impacto', { pos: this.pos, vol: 0.9, ref: 4 });
      if (!this.replica) for (const j of this.g.objetivos()) if (Math.hypot(j.pos.x - this.pos.x, j.pos.z - this.pos.z) < 2.2) j.recibirDano(12, this.pos, 'acido');
    }
    // autor: null = lo mató este jugador; id = otro jugador de la sala; 'replica' = solo visual (cliente)
    ctx.eventos.emit('zombi:muerto', { zombi: this, tipo: this.tipo, parte, fuente, pos: this.pos.clone(), dir: dir.clone(), autor: this.replica ? 'replica' : (this.autor ?? null) });
  }

  voz(clase, vol = 0.8) {
    this.ctx.audio.reproducir(`voz_${this.def.voz}_${clase}`, { pos: _v.set(this.pos.x, 1.6 * this.def.escala, this.pos.z), vol, ref: this.def.jefe ? 6 : 3, voz: true, reverb: 0.25 });
  }

  // ------------------------------------------------------------- actualización
  actualizar(dt, info) {
    const ctx = this.ctx, d = this.def, j = this.obj = this.g.objetivoPara(this);
    this.t += dt;
    this.cooldown -= dt;
    const dx = j.pos.x - this.pos.x, dz = j.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    // distancia al jugador de ESTE equipo (LOD, sonido, sacudidas); en solitario es la misma
    this.dist = j === ctx.jugador ? dist : this.distJugador();

    if (this.estado === 'muerto') { this.actualizarMuerte(dt); this.animar(dt, info, this.dist); return; }
    if (this.estado === 'emerger') {
      const k = Math.min(1, this.t / 1.4);
      this.raiz.position.set(this.pos.x, -1.9 * d.escala * (1 - ease(k)), this.pos.z);
      if (Math.random() < dt * 8) ctx.particulas.emitir('tierra', { x: this.pos.x, y: 0.05, z: this.pos.z }, null, 0.2, d.escala);
      if (k >= 1) { this.estado = 'perseguir'; this.t = 0; }
      this.animar(dt, info, this.dist);
      return;
    }

    // percepción: distancia cercana o línea de visión
    this.vistaT -= dt;
    if (this.vistaT <= 0) {
      this.vistaT = 0.35 + Math.random() * 0.2;
      this.veJugador = dist < 30 && ctx.zombis.nav.lineaLibre(this.pos.x, this.pos.z, j.pos.x, j.pos.z);
      if (!this.alerta && (dist < 7 || (this.veJugador && dist < 26))) { this.alerta = true; this.voz('gemido', 0.9); }
    }
    // voces periódicas
    this.vozT -= dt;
    if (this.vozT <= 0) { this.vozT = (this.alerta ? 2.5 : 5) + Math.random() * 5; if (dist < 35) this.voz('gemido', 0.6); }

    if (!j.vivo) { this.estado = 'perseguir'; }
    switch (this.estado) {
      case 'atacar': this.estadoAtacar(dt, dist); break;
      case 'escupir': this.estadoEscupir(dt, dist); break;
      case 'preparaCarga': this.estadoPreparaCarga(dt); break;
      case 'cargando': this.estadoCargando(dt, dist); break;
      case 'aturdido': this.vel.multiplyScalar(Math.exp(-6 * dt)); if (this.t > this.duracionAturdido) { this.estado = 'perseguir'; this.t = 0; } break;
      default: this.estadoPerseguir(dt, dist, dx, dz);
    }
    this.mover(dt);
    this.animar(dt, info, this.dist);
  }

  /** Réplica cuya muerte prevista no confirmó el anfitrión: vuelve a estar en pie. */
  revivir(vida) {
    this.estado = 'perseguir'; this.t = 0; this.vida = vida; this.previstoT = 0;
    this.raiz.rotation.x = 0; this.raiz.visible = true;
    mostrarHueso(this.h.cabeza, true);
  }

  distJugador() { const j = this.ctx.jugador; return Math.hypot(j.pos.x - this.pos.x, j.pos.z - this.pos.z); }

  /**
   * Réplica (cliente de una sala): sin IA. Sigue el estado que manda el anfitrión
   * (posición objetivo, orientación, estado de animación) y solo se anima.
   */
  actualizarReplica(dt, info) {
    const d = this.def;
    this.t += dt;
    this.dist = this.distJugador();
    if (this.estado === 'muerto') { this.actualizarMuerte(dt); this.animar(dt, info, this.dist); return; }
    const k = 1 - Math.exp(-12 * dt);
    this.pos.x += (this.objX - this.pos.x) * k + this.vel.x * dt * 0.5;
    this.pos.z += (this.objZ - this.pos.z) * k + this.vel.z * dt * 0.5;
    this.pos.y = this.ctx.colisiones.alturaSuelo(this.pos.x, this.pos.z, d.radio * 0.6, this.pos.y + 0.05);
    let dy = this.objYaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 10);
    if (this.estado === 'emerger') {
      const e = Math.min(1, this.t / 1.4);
      this.raiz.position.set(this.pos.x, -1.9 * d.escala * (1 - ease(e)), this.pos.z);
    } else this.raiz.position.copy(this.pos);
    this.raiz.rotation.y = this.yaw;
    this.animar(dt, info, this.dist);
  }

  estadoPerseguir(dt, dist, dx, dz) {
    const d = this.def, j = this.obj, nav = this.ctx.zombis.nav;
    let vel = this.alerta ? this.velAlertaV : this.velBase;
    let dirX, dirZ;
    // decisiones especiales
    if (j.vivo && this.tipo === 'escupidor' && this.alerta && this.veJugador && dist < d.rangoEscupir) {
      this.escupirT -= dt;
      if (this.escupirT <= 0 && dist > 3) { this.estado = 'escupir'; this.t = 0; this.lanzado = false; return; }
      if (dist < d.distancia + 2 && dist > 3) {                 // mantiene la distancia y se mueve en círculo
        const lado = Math.sin(this.fase * 0.3) > 0 ? 1 : -1;
        dirX = (-dz * lado) / dist - (dist < d.distancia ? dx / dist : 0);
        dirZ = (dx * lado) / dist - (dist < d.distancia ? dz / dist : 0);
        vel *= 0.6;
      }
    }
    if (j.vivo && this.tipo === 'coloso') {
      this.cargaT -= dt;
      if (this.cargaT <= 0 && this.veJugador && dist > d.rangoCarga[0] && dist < d.rangoCarga[1]) { this.estado = 'preparaCarga'; this.t = 0; this.voz('ataque', 1); return; }
    }
    if (dirX === undefined) {
      if (dist < 3.5 || (this.veJugador && dist < 22)) { dirX = dx / (dist || 1); dirZ = dz / (dist || 1); }
      else if (nav.direccion(this.pos.x, this.pos.z, _d)) { dirX = _d.x; dirZ = _d.z; }
      else { dirX = dx / (dist || 1); dirZ = dz / (dist || 1); }
    }
    // ataque cuerpo a cuerpo
    if (j.vivo && dist < d.alcance && this.cooldown <= 0 && Math.abs(j.pos.y - this.pos.y) < 1.6) {
      this.estado = 'atacar'; this.t = 0; this.golpeado = false;
      if (Math.random() < 0.6) this.voz('ataque', 0.9);
      return;
    }
    if (j.vivo && dist < d.alcance * 0.75) vel = 0;               // no se mete dentro del jugador
    // separación entre zombis (evita amontonamientos artificiales)
    let sx = 0, sz = 0;
    for (const o of this.ctx.zombis.vecinos(this.pos.x, this.pos.z, 1.6)) {
      if (o === this || !o.vivo) continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z, od = Math.hypot(ox, oz) || 0.01;
      const min = d.radio + o.def.radio + 0.12;
      if (od < min) { const f = (min - od) / min; sx += ox / od * f * 2.2; sz += oz / od * f * 2.2; }
    }
    // detección de atascos: pequeño desvío lateral si apenas avanza
    this.revisionT -= dt;
    if (this.revisionT <= 0) {
      const mov = Math.hypot(this.pos.x - this.ultimaX, this.pos.z - this.ultimaZ);
      this.atascoT = mov < 0.25 && vel > 0 && dist > d.alcance ? this.atascoT + 1 : 0;
      this.ultimaX = this.pos.x; this.ultimaZ = this.pos.z; this.revisionT = 1;
      if (this.atascoT >= 5 && dist > 25) this.g.reubicar(this);     // muy atascado y lejos: reaparece
    }
    if (this.atascoT >= 2) { const l = Math.sin(this.fase) > 0 ? 1 : -1; sx += -dirZ * l * 0.9; sz += dirX * l * 0.9; }
    let vx = dirX * vel + sx, vz = dirZ * vel + sz;
    const f = 1 - Math.exp(-(this.tipo === 'corredor' ? 6 : 4) * dt);
    this.vel.x += (vx - this.vel.x) * f; this.vel.z += (vz - this.vel.z) * f;
    // orientación: hacia el movimiento, o hacia el jugador si está cerca
    const objYaw = dist < 4 || this.tipo === 'escupidor' && this.alerta ? Math.atan2(dx, dz) : Math.atan2(this.vel.x, this.vel.z);
    this.girarHacia(objYaw, dt, this.tipo === 'corredor' ? 8 : 4);
  }

  girarHacia(obj, dt, vel) {
    let dif = obj - this.yaw;
    while (dif > Math.PI) dif -= Math.PI * 2;
    while (dif < -Math.PI) dif += Math.PI * 2;
    this.yaw += dif * Math.min(1, vel * dt);
  }

  estadoAtacar(dt, dist) {
    const d = this.def, j = this.obj;
    this.vel.multiplyScalar(Math.exp(-8 * dt));
    this.girarHacia(Math.atan2(j.pos.x - this.pos.x, j.pos.z - this.pos.z), dt, 6);
    if (!this.golpeado && this.t >= d.preparacion) {
      this.golpeado = true;
      if (d.jefe) {                                              // golpe en el suelo con área
        this.h.manoD.getWorldPosition(_v);
        this.ctx.particulas.emitir('escombro', { x: _v.x, y: 0.1, z: _v.z }, null, 1);
        this.ctx.audio.reproducir('golpe_suelo', { pos: this.pos, vol: 1, ref: 6 });
        j.sacudir(0.6);
        if (dist < d.alcance + 0.7 && j.vivo) {
          j.recibirDano(d.dano * this.danoMult, this.pos);
          const k = 6 / (dist || 1); j.empujar((j.pos.x - this.pos.x) * k, 3.5, (j.pos.z - this.pos.z) * k);
        }
      } else if (dist < d.alcance + 0.45 && j.vivo) {
        j.recibirDano(d.dano * this.danoMult, this.pos);
        this.ctx.audio.reproducir('impacto_carne', { vol: 0.6, reverb: 0 });
      }
    }
    if (this.t >= d.preparacion + d.recuperacion) { this.estado = 'perseguir'; this.t = 0; this.cooldown = 0.25; }
  }

  estadoEscupir(dt) {
    const j = this.obj;
    this.vel.multiplyScalar(Math.exp(-8 * dt));
    this.girarHacia(Math.atan2(j.pos.x - this.pos.x, j.pos.z - this.pos.z), dt, 6);
    if (!this.lanzado && this.t >= 0.5) {
      this.lanzado = true;
      this.h.cabeza.getWorldPosition(_v); _v.y -= 0.05;
      const obj = new THREE.Vector3(j.pos.x + j.vel.x * 0.45, j.pos.y + 1.0, j.pos.z + j.vel.z * 0.45);
      this.ctx.proyectiles.lanzar(_v, obj, this.def.danoAcido * this.danoMult);
      if (this.ctx.partida.modoSala) this.ctx.red.enviar(T.EVENTO, { e: 'proy', o: [_v.x, _v.y, _v.z].map(v => Math.round(v * 100) / 100), d: [obj.x, obj.y, obj.z].map(v => Math.round(v * 100) / 100) });
      this.ctx.audio.reproducir('escupir', { pos: _v, vol: 0.9, ref: 3 });
    }
    if (this.t >= 0.95) { this.estado = 'perseguir'; this.t = 0; this.escupirT = this.def.recargaEscupir * (0.8 + Math.random() * 0.5); }
  }

  estadoPreparaCarga(dt) {
    const j = this.obj;
    this.vel.multiplyScalar(Math.exp(-6 * dt));
    this.girarHacia(Math.atan2(j.pos.x - this.pos.x, j.pos.z - this.pos.z), dt, 5);
    if (this.t >= 0.9) {
      this.estado = 'cargando'; this.t = 0;
      this.cargaDir = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    }
  }

  estadoCargando(dt, dist) {
    const d = this.def, j = this.obj;
    this.vel.x = this.cargaDir.x * d.velCarga; this.vel.z = this.cargaDir.z * d.velCarga;
    if (Math.random() < dt * 10) this.ctx.particulas.emitir('polvo', { x: this.pos.x, y: 0.1, z: this.pos.z }, null, 0.6, 1.5);
    if (dist < 1.8 && j.vivo) {
      j.recibirDano(d.danoCarga * this.danoMult, this.pos);
      j.empujar(this.cargaDir.x * 10, 4, this.cargaDir.z * 10);
      j.sacudir(0.9);
      this.ctx.audio.reproducir('golpe_suelo', { pos: this.pos, vol: 0.8, ref: 6 });
      this.estado = 'aturdido'; this.t = 0; this.duracionAturdido = 0.9; this.cargaT = d.recargaCarga;
    } else if (this.t > 2.2) { this.estado = 'perseguir'; this.t = 0; this.cargaT = d.recargaCarga; }
  }

  mover(dt) {
    const d = this.def;
    // empuje externo (cuchillo, explosiones) con amortiguación
    this.pos.x += (this.vel.x + this.empuje.x) * dt;
    this.pos.z += (this.vel.z + this.empuje.z) * dt;
    this.empuje.x *= Math.exp(-6 * dt); this.empuje.z *= Math.exp(-6 * dt);
    const choca = this.ctx.colisiones.resolverCilindro(this.pos, d.radio, 1.8 * d.escala, false, 0.45);
    if (choca && this.estado === 'cargando' && this.t > 0.3) {       // el coloso se estrella contra un obstáculo
      this.estado = 'aturdido'; this.t = 0; this.duracionAturdido = 1.8; this.cargaT = d.recargaCarga;
      this.ctx.audio.reproducir('golpe_suelo', { pos: this.pos, vol: 0.9, ref: 6 });
      this.ctx.particulas.emitir('escombro', { x: this.pos.x, y: 1, z: this.pos.z }, null, 1);
      if (this.distJugador() < 10) this.ctx.jugador.sacudir(0.4);
    }
    this.pos.y = this.ctx.colisiones.alturaSuelo(this.pos.x, this.pos.z, d.radio * 0.6, this.pos.y + 0.05);
    this.raiz.position.copy(this.pos);
    this.raiz.rotation.y = this.yaw;
    // pasos pesados del coloso
    if (d.jefe) {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      const antes = Math.sin(this.fase);
      this.faseSonido = this.fase;
      if (sp > 0.5 && Math.sign(antes) !== Math.sign(this.pasoPrevio || 0)) {
        this.ctx.audio.reproducir('paso_zombi', { pos: this.pos, vol: 1, tono: 0.55, ref: 5, reverb: 0.2 });
        if (this.distJugador() < 12) this.ctx.jugador.sacudir(0.08);
      }
      this.pasoPrevio = antes;
    }
  }

  actualizarMuerte(dt) {
    const d = this.def;
    const k = ease(this.t / this.duracionCaida);
    this.raiz.rotation.x = this.caidaDir * k * 1.48;
    this.raiz.rotation.y = this.yaw;
    if (d.jefe && this.t > this.duracionCaida && !this.golpeSuelo) {
      this.golpeSuelo = true;
      this.ctx.audio.reproducir('golpe_suelo', { pos: this.pos, vol: 1, ref: 8 });
      this.ctx.particulas.emitir('escombro', { x: this.pos.x, y: 0.2, z: this.pos.z }, null, 1.5, 2);
      if (this.distJugador() < 15) this.ctx.jugador.sacudir(0.7);
    }
    if (this.t > this.duracionCaida + this.vidaCadaver) {
      this.raiz.position.y -= dt * 0.35;                       // se hunde en el suelo antes de reciclarse
      if (this.raiz.position.y < -0.8 * d.escala) { this.golpeSuelo = false; this.g.reciclar(this); }
    } else this.raiz.position.y = this.pos.y;
  }

  // ------------------------------------------------------------- animación
  animar(dt, info, dist) {
    // LOD geométrico según distancia
    const lod = info.lodPara(dist);
    if (lod !== this.lod) { this.lod = lod; aplicarLOD(this.modelo, lod, info.detalle); }
    // LOD de animación: fuera de cámara o lejos se actualiza menos a menudo
    this.cuadro++;
    const visible = info.enCamara(this);
    const salto = !visible ? 6 : dist > 40 ? 3 : dist > 22 ? 2 : 1;
    this.dtAcum = (this.dtAcum || 0) + dt;
    if (this.cuadro % salto !== 0) return;
    dt = this.dtAcum; this.dtAcum = 0;

    const H = this.h, d = this.def;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const corre = d.anim === 'correr' || this.estado === 'cargando' || sp > 3;
    const zancada = corre ? 1.6 : 2.4 * d.escala;
    this.fase += dt * (sp / zancada) * Math.PI * 1.1 + (sp < 0.1 ? dt * 0.5 : 0);
    const t = this.fase;
    const amp = Math.min(1, sp / (corre ? 3.5 : 1.4));
    // muelle del retroceso por impactos
    const F = this.flinch;
    F.vx += (-F.x * 120 - F.vx * 14) * dt; F.x += F.vx * dt;
    F.vz += (-F.z * 120 - F.vz * 14) * dt; F.z += F.vz * dt;

    // reposo
    H.cadera.position.y = this.baseCadera + Math.abs(Math.cos(t)) * 0.035 * amp - (corre ? 0.04 : 0);
    H.cadera.rotation.set(0, Math.sin(t) * 0.12 * amp, Math.sin(t) * 0.04 * amp);
    H.columna.rotation.set(this.inclinacionBase + (corre ? 0.42 : 0.16) + F.x * 0.5, 0, Math.sin(t) * 0.06 + F.z * 0.4);
    H.pecho.rotation.set(F.x * 0.3, -Math.sin(t) * 0.1 * amp, F.z * 0.2);
    H.cabeza.rotation.set(0.1 + Math.sin(this.balanceoCabeza + t * 0.3) * 0.12 - (corre ? 0.3 : 0), Math.sin(t * 0.35 + this.balanceoCabeza) * 0.25, Math.sin(this.balanceoCabeza * 2 + t * 0.5) * 0.25);
    H.mandibula.rotation.x = 0.15 + Math.max(0, Math.sin(t * 0.7 + this.balanceoCabeza)) * 0.25;

    // piernas
    const ampP = (corre ? 0.85 : 0.45) * amp;
    const cI = 1 - this.cojera;
    H.musloI.rotation.set(-Math.sin(t) * ampP * cI, 0, 0.02);
    H.musloD.rotation.set(Math.sin(t) * ampP, 0, -0.02);
    H.piernaI.rotation.x = Math.max(0, Math.cos(t)) * ampP * 1.3 * cI + (corre ? 0.2 : 0.05);
    H.piernaD.rotation.x = Math.max(0, -Math.cos(t)) * ampP * 1.3 + (corre ? 0.2 : 0.05);
    H.pieI.rotation.x = -H.musloI.rotation.x * 0.3; H.pieD.rotation.x = -H.musloD.rotation.x * 0.3;

    // brazos: estirados hacia delante (andar) o bombeando (correr)
    if (corre) {
      H.brazoI.rotation.set(Math.sin(t) * 0.9 - 0.3, 0, 0.15); H.brazoD.rotation.set(-Math.sin(t) * 0.9 - 0.3, 0, -0.15);
      H.antebrazoI.rotation.x = -1.1; H.antebrazoD.rotation.x = -1.1;
    } else {
      H.brazoI.rotation.set(-1.3 + Math.sin(t * 0.5 + 1) * 0.15, 0.1, 0.1 + Math.sin(t) * 0.05);
      H.brazoD.rotation.set(-1.2 + Math.sin(t * 0.5) * 0.15, -0.1, -0.1 - Math.sin(t) * 0.05);
      H.antebrazoI.rotation.x = -0.25; H.antebrazoD.rotation.x = -0.35;
    }

    // estados especiales
    if (this.estado === 'emerger') {
      const k = Math.min(1, this.t / 1.4);
      H.brazoI.rotation.set(-2.6 + Math.sin(this.t * 9) * 0.3, 0, 0.3); H.brazoD.rotation.set(-2.5 + Math.cos(this.t * 9) * 0.3, 0, -0.3);
      H.columna.rotation.x = 0.5 * (1 - k);
    } else if (this.estado === 'atacar') {
      const p = this.t / d.preparacion;
      const brazo = p < 1 ? -1.3 - ease(p) * 1.4 : -2.7 + ease((this.t - d.preparacion) / 0.18) * 2.2;
      H.brazoI.rotation.set(brazo, 0, 0.2); H.brazoD.rotation.set(brazo + (d.jefe ? 0 : 0.2), 0, -0.2);
      H.antebrazoI.rotation.x = H.antebrazoD.rotation.x = -0.3;
      H.columna.rotation.x = this.inclinacionBase + (p < 1 ? -0.15 * ease(p) : 0.5);
      H.mandibula.rotation.x = 0.5;
    } else if (this.estado === 'escupir') {
      const p = this.t / 0.5;
      H.columna.rotation.x = p < 1 ? -0.35 * ease(p) : 0.45 - (this.t - 0.5) * 0.6;
      H.cabeza.rotation.x = p < 1 ? -0.4 : 0.35;
      H.mandibula.rotation.x = p < 1 ? 0.2 : 0.75;
    } else if (this.estado === 'preparaCarga') {
      H.columna.rotation.x = this.inclinacionBase - 0.25 + Math.sin(this.t * 30) * 0.03;
      H.brazoI.rotation.set(-0.3, 0, 0.9); H.brazoD.rotation.set(-0.3, 0, -0.9);
      H.mandibula.rotation.x = 0.7; H.cabeza.rotation.x = -0.4;
    } else if (this.estado === 'aturdido') {
      H.columna.rotation.x = this.inclinacionBase - 0.25 + Math.sin(this.t * 14) * 0.08;
      H.cabeza.rotation.z = Math.sin(this.t * 9) * 0.4;
    } else if (this.estado === 'muerto') {
      const k = ease(this.t / this.duracionCaida);
      H.brazoI.rotation.set(-0.6 * k - 0.3, 0, 0.9 * k); H.brazoD.rotation.set(-0.5 * k - 0.3, 0, -0.8 * k);
      H.musloI.rotation.x = -0.2 * k; H.musloD.rotation.x = 0.15 * k;
      H.piernaI.rotation.x = 0.4 * k; H.piernaD.rotation.x = 0.1 * k;
      H.columna.rotation.x = this.inclinacionBase * (1 - k);
      H.mandibula.rotation.x = 0.6;
    }
  }
}
