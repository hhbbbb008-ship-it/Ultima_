import * as THREE from 'three';

/**
 * Sistema de oleadas con dificultad progresiva:
 * número de zombis, vida, mezcla de tipos, ritmo de aparición, oleadas de jefe
 * (Coloso) cada 5 y límite de zombis simultáneos ajustado al rendimiento.
 */
export const MODOS = {
  clasico: { nombre: 'Supervivencia', desc: 'Resiste 15 oleadas hasta que llegue la evacuación al amanecer.', max: 15, vida: 1, dano: 1, vel: 1 },
  infinito: { nombre: 'Noche eterna', desc: 'Oleadas sin fin. Tu única meta es llegar lo más lejos posible.', max: null, vida: 1, dano: 1, vel: 1 },
  pesadilla: { nombre: 'Pesadilla', desc: 'Zombis más duros, rápidos y numerosos. 10 oleadas. Sin piedad.', max: 10, vida: 1.5, dano: 1.4, vel: 1.12, corredores: 0.15 },
};

export class Oleadas {
  constructor(ctx) {
    this.ctx = ctx;
    this.estado = 'inactiva';
    ctx.eventos.on('zombi:muerto', () => { if (this.estado === 'activa') this.muertos++; });
  }

  reiniciar(modo, oleadaInicial = 1) {
    this.modo = modo; this.cfg = MODOS[modo];
    this.n = oleadaInicial - 1;
    this.prepararSiguiente(oleadaInicial === 1 ? 6 : 8);
  }

  prepararSiguiente(espera = 12) {
    this.n++;
    this.estado = 'preparacion';
    this.cuenta = espera;
    this.ctx.audio.setMusica('calma');
    this.ctx.eventos.emit('oleada:preparacion', { n: this.n, espera });
  }

  /** Composición de la oleada n: lista de tipos a aparecer. */
  composicion(n) {
    const c = this.cfg;
    let total = Math.min(150, Math.floor(6 + n * 2.6 + n * n * 0.18));
    const jefes = n % 5 === 0 ? Math.max(1, Math.floor(n / 5)) : (n > 12 && Math.random() < 0.3 ? 1 : 0);
    if (n % 5 === 0) total = Math.floor(total * 0.7);
    const pCorr = n >= 3 ? Math.min(0.38, 0.08 + (n - 3) * 0.035) + (c.corredores || 0) : (c.corredores && n >= 2 ? c.corredores : 0);
    const pAcor = n >= 4 ? Math.min(0.2, 0.05 + (n - 4) * 0.02) : 0;
    const pEsc = n >= 5 ? Math.min(0.13, 0.04 + (n - 5) * 0.012) : 0;
    const lista = [];
    for (let i = 0; i < total; i++) {
      const r = Math.random();
      lista.push(r < pCorr ? 'corredor' : r < pCorr + pAcor ? 'acorazado' : r < pCorr + pAcor + pEsc ? 'escupidor' : 'caminante');
    }
    // los jefes aparecen a mitad de la oleada
    for (let k = 0; k < jefes; k++) lista.splice(Math.floor(lista.length * (0.35 + k * 0.2)), 0, 'coloso');
    return lista;
  }

  iniciarOleada() {
    const n = this.n;
    this.cola = this.composicion(n);
    this.totalOleada = this.cola.length;
    this.muertos = 0;
    this.intervalo = Math.max(0.35, 1.9 - n * 0.09);
    this.temporizador = 0.5;
    this.mods = { vida: (1 + (n - 1) * 0.09) * this.cfg.vida, dano: (1 + (n - 1) * 0.03) * this.cfg.dano, vel: this.cfg.vel * (1 + Math.min(0.15, n * 0.008)), alerta: n >= 8 };
    this.estado = 'activa';
    const jefe = this.cola.includes('coloso');
    this.ctx.audio.setMusica(jefe ? 'jefe' : 'combate');
    this.ctx.audio.reproducir('oleada_inicio', { bus: 'interfaz', vol: 0.9, reverb: 0.5 });
    this.ctx.eventos.emit('oleada:inicio', { n, total: this.totalOleada, jefe });
    this.ctx.partida.guardarPunto();
  }

  get restantes() { return this.estado === 'activa' ? this.totalOleada - this.muertos : 0; }

  /** Punto de aparición lejos del jugador y preferiblemente fuera de su vista. */
  puntoAparicion() {
    const ctx = this.ctx, j = ctx.jugador, puntos = ctx.mundo.aparicion;
    const f = ctx.camara.getWorldDirection(this._f || (this._f = new THREE.Vector3()));
    const cand = puntos.map(p => {
      const dx = p.x - j.pos.x, dz = p.z - j.pos.z, d = Math.hypot(dx, dz);
      const vista = (dx * f.x + dz * f.z) / (d || 1);
      return { p, d, pun: (d < 16 ? -100 : 0) - vista * 20 - Math.abs(d - 30) * 0.3 + Math.random() * 12 };
    }).sort((a, b) => b.pun - a.pun);
    const base = cand[0]?.p; if (!base) return null;
    return new THREE.Vector3(base.x + (Math.random() - 0.5) * 2.5, 0, base.z + (Math.random() - 0.5) * 2.5);
  }

  actualizar(dt) {
    const ctx = this.ctx;
    if (this.estado === 'preparacion') {
      this.cuenta -= dt;
      if (this.cuenta <= 0) this.iniciarOleada();
      return;
    }
    if (this.estado !== 'activa') return;
    const vivos = ctx.zombis.contarVivos();
    const cap = Math.min(ctx.rendimiento.capZombis, 6 + this.n * 2);
    // intensidad de la música según amenaza cercana y salud
    let cerca = 0;
    for (const z of ctx.zombis.activos) if (z.vivo && z.dist < 15) cerca++;
    ctx.audio.setIntensidad(Math.min(1, 0.3 + cerca * 0.08 + (1 - ctx.jugador.salud / 100) * 0.3));

    this.temporizador -= dt;
    if (this.cola.length && this.temporizador <= 0 && vivos < cap) {
      const tipo = this.cola.shift();
      const p = this.puntoAparicion();
      if (p) ctx.zombis.aparecer(tipo, p, this.mods);
      if (tipo === 'coloso') ctx.eventos.emit('oleada:jefe');
      this.temporizador = this.intervalo * (0.6 + Math.random() * 0.8);
    }
    if (!this.cola.length && this.muertos >= this.totalOleada && vivos === 0) {
      this.estado = 'completada';
      const bono = ctx.puntuacion.bonoOleada(this.n);
      ctx.audio.reproducir('oleada_fin', { bus: 'interfaz', vol: 0.8, reverb: 0.4 });
      ctx.eventos.emit('oleada:fin', { n: this.n, bono });
      if (this.cfg.max && this.n >= this.cfg.max) ctx.partida.terminar(true);
      else this.prepararSiguiente(12);
    }
  }
}
