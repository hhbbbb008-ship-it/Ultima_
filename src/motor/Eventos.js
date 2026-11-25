/**
 * Bus de eventos mínimo para desacoplar sistemas.
 * Ejemplo: ctx.eventos.on('zombi:muerto', fn) / ctx.eventos.emit('zombi:muerto', datos)
 */
export class Eventos {
  constructor() { this.oyentes = new Map(); }

  on(nombre, fn) {
    if (!this.oyentes.has(nombre)) this.oyentes.set(nombre, new Set());
    this.oyentes.get(nombre).add(fn);
    return () => this.off(nombre, fn);
  }

  off(nombre, fn) { this.oyentes.get(nombre)?.delete(fn); }

  emit(nombre, datos) {
    const set = this.oyentes.get(nombre);
    if (!set) return;
    for (const fn of set) fn(datos);
  }
}
