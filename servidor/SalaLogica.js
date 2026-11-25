import { T, MAX_JUGADORES } from '../src/red/protocolo.js';

/**
 * Reglas de una sala, sin dependencias de Cloudflare (se prueba con node:test).
 * El servidor solo decide quién está, quién es anfitrión y a quién va cada mensaje;
 * la simulación del juego corre en el navegador del anfitrión.
 */
const DE_ANFITRION = new Set([T.ZOMBIS, T.FIN, T.EVENTO]);
const A_TODOS = new Set([T.JUGADOR, T.DISPARO]);

export class SalaLogica {
  constructor(max = MAX_JUGADORES) {
    this.max = max;
    this.ids = [];
    this.anfitrion = null;
    this.siguiente = 1;
  }

  /** Reconstruye el estado tras despertar de la hibernación. */
  static desde(ids, anfitrion, siguiente, max = MAX_JUGADORES) {
    const s = new SalaLogica(max);
    s.ids = [...ids].sort((a, b) => a - b);
    s.anfitrion = s.ids.includes(anfitrion) ? anfitrion : null;
    s.siguiente = Math.max(siguiente || 1, (s.ids.at(-1) || 0) + 1);
    return s;
  }

  get anfitrionId() { return this.anfitrion; }
  get jugadores() { return [...this.ids]; }

  unir() {
    if (this.ids.length >= this.max) return { ok: false, motivo: 'llena' };
    const id = this.siguiente++;
    this.ids.push(id);
    if (this.anfitrion === null) this.anfitrion = id;
    return { ok: true, id, anfitrion: this.anfitrion === id };
  }

  salir(id) {
    this.ids = this.ids.filter(x => x !== id);
    if (id === this.anfitrion) { this.anfitrion = null; return { cerrar: true }; }
    return { cerrar: false };
  }

  destino(emisor, tipo) {
    if (!this.ids.includes(emisor)) return 'descartar';
    if (DE_ANFITRION.has(tipo)) return emisor === this.anfitrion ? 'todos' : 'descartar';
    if (tipo === T.DANO) return emisor === this.anfitrion ? 'descartar' : 'anfitrion';
    if (A_TODOS.has(tipo)) return 'todos';
    return 'descartar';
  }
}
