/**
 * Puntuación y economía:
 * - "puntos": moneda para comprar armas y munición en las paredes.
 * - "total": puntuación acumulada (nunca baja), con multiplicador por racha de bajas.
 * - Estadísticas: bajas, disparos a la cabeza, precisión, tiempo.
 */
const VENTANA_RACHA = 2.6;

export class Puntuacion {
  constructor(ctx) {
    this.ctx = ctx;
    this.reiniciar();
    ctx.eventos.on('zombi:impacto', () => this.sumar(10, null));
    ctx.eventos.on('zombi:muerto', d => this.alMorir(d));
  }

  reiniciar(g) {
    this.puntos = g?.puntos ?? 500;
    this.total = g?.total ?? 0;
    this.bajas = g?.bajas ?? 0;
    this.cabezas = g?.cabezas ?? 0;
    this.disparos = g?.disparos ?? 0;
    this.aciertos = g?.aciertos ?? 0;
    this.tiempo = g?.tiempo ?? 0;
    this.porTipo = g?.porTipo ?? {};
    this.racha = 0; this.rachaT = 0; this.mejorRacha = g?.mejorRacha ?? 0;
  }

  get multiplicador() { return 1 + Math.min(this.racha, 10) * 0.1; }
  get precision() { return this.disparos ? Math.round(this.aciertos / this.disparos * 100) : 0; }

  sumar(cant, motivo, pos) {
    this.puntos += cant;
    this.total += Math.round(cant * this.multiplicador);
    if (motivo) this.ctx.eventos.emit('puntos', { cant, motivo, pos, mult: this.multiplicador });
  }

  gastar(c) {
    if (this.puntos < c) return false;
    this.puntos -= c;
    this.ctx.eventos.emit('puntos', { cant: -c, motivo: 'compra' });
    return true;
  }

  registrarDisparo(acierto) { this.disparos++; if (acierto) this.aciertos++; }

  alMorir({ zombi, tipo, parte, fuente, pos }) {
    this.bajas++;
    this.porTipo[tipo] = (this.porTipo[tipo] || 0) + 1;
    this.racha = this.rachaT > 0 ? this.racha + 1 : 1;
    this.rachaT = VENTANA_RACHA;
    this.mejorRacha = Math.max(this.mejorRacha, this.racha);
    let p = zombi.def.puntos, motivo = 'Baja';
    if (fuente === 'cuchillo') { p += 70; motivo = 'Cuchillada'; }
    else if (parte === 'cabeza') { p = Math.round(p * 1.5); motivo = 'Tiro a la cabeza'; this.cabezas++; }
    if (zombi.def.jefe) motivo = '¡Coloso abatido!';
    this.sumar(p, motivo, pos);
  }

  bonoOleada(n) { const b = 100 + n * 40; this.sumar(b, `Oleada ${n} superada`); return b; }

  actualizar(dt) {
    this.tiempo += dt;
    if (this.rachaT > 0) { this.rachaT -= dt; if (this.rachaT <= 0) this.racha = 0; }
  }

  guardable() {
    const { puntos, total, bajas, cabezas, disparos, aciertos, tiempo, porTipo, mejorRacha } = this;
    return { puntos, total, bajas, cabezas, disparos, aciertos, tiempo, porTipo, mejorRacha };
  }
}
