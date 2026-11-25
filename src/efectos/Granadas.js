import * as THREE from 'three';
import { GRANADA, MOLOTOV } from '../armas/DefArmas.js';
import { ConstructorArmas } from '../armas/ModelosArmas.js';

/**
 * Granadas de fragmentación en el mundo: vuelo balístico, rebotes contra el
 * escenario (rayos contra las colisiones, restitución y rozamiento), mecha y
 * explosión con daño en área (caída con la distancia y línea de visión),
 * empuje, daño al jugador si está cerca, partículas, destello, marca de
 * quemadura, sonido 3D y sacudida de cámara según la distancia.
 *
 * Tipos: 'granada' (mecha y rebotes), 'impacto' (proyectil del lanzagranadas:
 * explota al tocar el escenario o un zombi) y 'molotov' (se rompe al chocar y deja
 * un charco de fuego que quema a los zombis durante unos segundos).
 */
const _d = new THREE.Vector3(), _c = new THREE.Vector3(), _o = new THREE.Vector3();

export class Granadas {
  constructor(ctx) {
    this.ctx = ctx;
    this.fabrica = new ConstructorArmas(ctx.recursos);
    this.activas = []; this.reserva = { granada: [], impacto: [], molotov: [] };
    this.fuegos = [];
    this.destello = 0;            // la misma luz sirve para el destello de las explosiones y para el fuego (no se añaden luces a la escena)
    this.luz = new THREE.PointLight(0xffa04a, 0, 22, 1.8);
    ctx.escena.add(this.luz);
  }

  /**
   * op: { tipo: 'granada' | 'impacto' | 'molotov', vel, grav, dano, radio, danoJugador }
   */
  lanzar(origen, dir, velJugador, op = {}) {
    const tipo = op.tipo || 'granada';
    let g = this.reserva[tipo].pop();
    if (!g) {
      const m = tipo === 'impacto' ? this.fabrica.proyectil() : tipo === 'molotov' ? this.fabrica.molotov(false) : this.fabrica.granada(false);
      m.scale.setScalar(tipo === 'impacto' ? 1.6 : 1.35);
      g = { m, tipo, pos: new THREE.Vector3(), vel: new THREE.Vector3(), giro: new THREE.Vector3() };
    }
    g.op = op;
    g.pos.copy(origen); g.m.position.copy(origen);
    const arriba = tipo === 'impacto' ? 0.4 : 2.2;
    g.vel.copy(dir).multiplyScalar(op.vel ?? (tipo === 'molotov' ? MOLOTOV.vel : GRANADA.vel)).add(_d.set(velJugador.x * 0.6, arriba, velJugador.z * 0.6));
    if (tipo === 'impacto') g.giro.set(0, 0, 0); else g.giro.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
    g.mecha = tipo === 'granada' ? GRANADA.mecha : 6; g.ultimoRebote = 0; g.recorrido = 0;
    g.grav = op.grav ?? 18;
    this.ctx.escena.add(g.m); g.m.visible = true;
    this.activas.push(g);
  }

  actualizar(dt) {
    const col = this.ctx.colisiones;
    for (let i = this.activas.length - 1; i >= 0; i--) {
      const g = this.activas[i];
      g.ultimoRebote -= dt;
      for (let paso = 0; paso < 2; paso++) {
        const h = dt / 2;
        g.vel.y -= g.grav * h;
        const v = g.vel.length(), recorrido = v * h;
        if (recorrido > 1e-5) {
          _d.copy(g.vel).divideScalar(v);
          const hit = col.rayo(g.pos, _d, recorrido + 0.06);
          // proyectil y molotov: también chocan contra los zombis
          if (g.tipo !== 'granada') {
            const zs = this.ctx.zombis.rayo(g.pos, _d, hit ? Math.min(hit.dist, recorrido + 0.1) : recorrido + 0.1);
            if (zs.length) { g.pos.copy(zs[0].punto); g.choque = true; break; }
          }
          if (hit && hit.dist <= recorrido + 0.06 && g.tipo !== 'granada') {
            g.pos.set(hit.x - _d.x * 0.08, hit.y - _d.y * 0.08, hit.z - _d.z * 0.08); g.choque = true; break;
          }
          if (hit && hit.dist <= recorrido + 0.06) {
            // rebote: refleja la componente normal (con pérdida) y frena la tangencial
            g.pos.set(hit.x - _d.x * 0.065, hit.y - _d.y * 0.065, hit.z - _d.z * 0.065);
            const n = _c.set(hit.nx, hit.ny, hit.nz), vn = g.vel.dot(n);
            if (vn < 0) g.vel.addScaledVector(n, -(1 + GRANADA.rebote) * vn).multiplyScalar(0.72);
            if (Math.abs(vn) > 1.8 && g.ultimoRebote <= 0) { g.ultimoRebote = 0.1; this.ctx.audio.reproducir('granada_rebote', { pos: g.pos, vol: Math.min(0.7, Math.abs(vn) * 0.08), ref: 2, reverb: 0.1 }); }
            g.giro.multiplyScalar(0.6);
          } else { g.pos.addScaledVector(g.vel, h); g.recorrido += recorrido; }
        }
        const suelo = col.alturaSuelo(g.pos.x, g.pos.z, 0.05, g.pos.y + 0.1) + 0.065;
        if (g.pos.y < suelo && g.tipo !== 'granada') { g.pos.y = suelo; g.choque = true; break; }
        if (g.pos.y < suelo) { g.pos.y = suelo; if (g.vel.y < 0) g.vel.y *= -GRANADA.rebote; g.vel.x *= 0.82; g.vel.z *= 0.82; }
      }
      g.m.position.copy(g.pos);
      if (g.tipo === 'impacto') g.m.lookAt(_c.copy(g.pos).add(g.vel));          // el proyectil apunta hacia donde vuela
      else { g.m.rotation.x += g.giro.x * dt; g.m.rotation.y += g.giro.y * dt; g.m.rotation.z += g.giro.z * dt; }
      if (g.tipo === 'molotov' && Math.random() < 0.5) this.ctx.particulas.emitir('fuego', _c.copy(g.pos).setY(g.pos.y + 0.15), { x: 0, y: 1, z: 0 }, 0.25, 0.15);
      g.mecha -= dt;
      if (g.choque || g.mecha <= 0) {
        g.choque = false;
        if (g.tipo === 'molotov') this.romperMolotov(g.pos.clone());
        else this.explotar(g.pos.clone(), g.op);
        this.retirar(i);
      }
    }
    this.destello = Math.max(0, this.destello - dt * 420);
    this.actualizarFuegos(dt);
  }

  // --------------------------------------------------------------- molotov
  romperMolotov(p) {
    const ctx = this.ctx;
    const y = ctx.colisiones.alturaSuelo(p.x, p.z, 0.3, p.y + 0.3);
    const centro = new THREE.Vector3(p.x, y, p.z);
    ctx.audio.reproducir('vidrio_roto', { pos: p, vol: 0.9, ref: 4, reverb: 0.2 });
    ctx.particulas.emitir('explosion', centro, { x: 0, y: 1, z: 0 }, 0.35, 0.6);
    ctx.calcas.quemadura({ x: p.x, y, z: p.z }, MOLOTOV.radio);
    ctx.zombis.alertar(p, 20);
    const sonido = ctx.audio.bucle('fuego', centro, 0.7);
    this.fuegos.push({ pos: centro, t: MOLOTOV.duracion, tick: 0, sonido });
    if (this.fuegos.length > 4) this.apagar(0);
  }

  apagar(i) {
    const f = this.fuegos[i];
    try { f.sonido?.stop(); } catch (e) { /* ya parado */ }
    this.fuegos.splice(i, 1);
  }

  actualizarFuegos(dt) {
    const ctx = this.ctx, R = MOLOTOV.radio;
    let luz = null;
    for (let i = this.fuegos.length - 1; i >= 0; i--) {
      const f = this.fuegos[i];
      f.t -= dt;
      if (f.t <= 0) { this.apagar(i); continue; }
      const fuerza = Math.min(1, f.t / 1.5);                     // se apaga poco a poco al final
      // llamas repartidas por el charco
      const n = Math.random() < 0.9 * fuerza ? 2 : 0;
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R * 0.9;
        _c.set(f.pos.x + Math.cos(a) * r, f.pos.y + 0.05, f.pos.z + Math.sin(a) * r);
        ctx.particulas.emitir('fuego', _c, { x: 0, y: 1, z: 0 }, 0.8, 0.4);
      }
      if (Math.random() < 0.25 * fuerza) ctx.particulas.emitir('humoFuego', _c.set(f.pos.x, f.pos.y + 0.6, f.pos.z), { x: 0, y: 1, z: 0 }, 1, 1);
      if (Math.random() < 0.15) ctx.particulas.emitir('brasa', f.pos, { x: 0, y: 1, z: 0 }, 1, 1);
      if (!luz) luz = f;
      // daño cada 0,2 s a los zombis (y al jugador) que pisan el fuego
      f.tick -= dt;
      if (f.tick <= 0) {
        f.tick = 0.2;
        let muerte = false, alguno = false;
        for (const z of [...ctx.zombis.activos]) {
          if (!z.vivo) continue;
          if (Math.hypot(z.pos.x - f.pos.x, z.pos.z - f.pos.z) > R + z.def.radio) continue;
          alguno = true;
          if (z.quemar(MOLOTOV.dps * 0.2 * (z.def.jefe ? 0.6 : 1))) muerte = true;
          if (Math.random() < 0.5) ctx.particulas.emitir('fuego', z.puntoTorso(), { x: 0, y: 1, z: 0 }, 0.5, 0.3);
        }
        if (muerte) ctx.eventos.emit('arma:impacto', { cabeza: false, muerte });
        const j = ctx.jugador;
        if (j.vivo && Math.hypot(j.pos.x - f.pos.x, j.pos.z - f.pos.z) < R * 0.85 && Math.abs(j.pos.y - f.pos.y) < 1.2)
          j.recibirDano(MOLOTOV.dpsJugador * 0.2, f.pos, 'fuego');
      }
    }
    const fuego = luz ? (14 + Math.random() * 6) * Math.min(1, luz.t / 1.5) : 0;
    if (this.destello >= fuego) this.luz.intensity = this.destello;
    else { this.luz.position.set(luz.pos.x, luz.pos.y + 0.8, luz.pos.z); this.luz.intensity = fuego; }
  }

  retirar(i) {
    const g = this.activas[i];
    this.ctx.escena.remove(g.m);
    this.activas.splice(i, 1);
    this.reserva[g.tipo].push(g);
  }

  explotar(p, op = {}) {
    const ctx = this.ctx, R = op.radio ?? GRANADA.radio, DANO = op.dano ?? GRANADA.dano, DANO_J = op.danoJugador ?? GRANADA.danoJugador;
    const arriba = { x: 0, y: 1, z: 0 };
    ctx.particulas.emitir('explosion', p, arriba, 1, 1);
    ctx.particulas.emitir('humoExplosion', p, arriba, 1, 1);
    ctx.particulas.emitir('metralla', p, arriba, 1, 1);
    ctx.particulas.emitir('escombro', p, arriba, 1.2, 1.2);
    ctx.particulas.emitir('chispas', p, arriba, 3, 1);
    ctx.calcas.quemadura({ x: p.x, y: ctx.colisiones.alturaSuelo(p.x, p.z, 0.2, p.y + 0.2), z: p.z }, 3.4);
    this.luz.position.set(p.x, p.y + 0.6, p.z); this.destello = 160; this.luz.intensity = 160;
    ctx.audio.reproducir('explosion', { pos: p, vol: 1, ref: 9, reverb: 0.7 });
    ctx.zombis.alertar(p, 45);
    // daño a los zombis dentro del radio con línea de visión desde el centro de la explosión
    _o.set(p.x, p.y + 0.35, p.z);
    let alguno = false, muerte = false;
    for (const z of [...ctx.zombis.activos]) {
      if (!z.vivo) continue;
      z.h.pecho.getWorldPosition(_c);
      const d = _c.distanceTo(_o);
      if (d > R + 0.3 * z.def.escala || !ctx.colisiones.lineaVista(_o, _c)) continue;
      const k = Math.max(0.12, 1 - d / (R + 0.3 * z.def.escala));
      _d.subVectors(_c, _o).normalize();
      const res = z.recibirImpacto(DANO * Math.pow(k, 0.8), _c.clone(), _d.clone(), 'torso', 'granada');
      z.empujar(_d.x * 7 * k, _d.z * 7 * k);
      alguno = true; if (res.muerto) muerte = true;
    }
    if (alguno) ctx.eventos.emit('arma:impacto', { cabeza: false, muerte });
    // jugador: daño si está cerca y expuesto; sacudida según la distancia
    const j = ctx.jugador, cam = ctx.camara.position;
    const dj = cam.distanceTo(_o);
    if (dj < R * 0.9 && ctx.colisiones.lineaVista(_o, cam)) j.recibirDano(DANO_J * (1 - dj / (R * 0.9)), p, 'explosion');
    if (dj < 28) j.sacudir(Math.max(0, 1 - dj / 28) * 1.1);
  }

  limpiar() {
    while (this.activas.length) this.retirar(0);
    while (this.fuegos.length) this.apagar(0);
    this.luz.intensity = 0; this.destello = 0;
  }
}
