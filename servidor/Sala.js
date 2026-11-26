import { DurableObject } from 'cloudflare:workers';
import { SalaLogica } from './SalaLogica.js';
import { T, MAX_BYTES } from '../src/red/protocolo.js';

/**
 * Una sala multijugador = un Durable Object (uno por código).
 *
 * Solo retransmite: la simulación (zombis, oleadas) corre en el navegador del anfitrión.
 * Usa la API de hibernación de WebSockets: una sala sin tráfico no consume duración
 * en el plan gratis. Por eso el estado se reconstruye desde los adjuntos de cada socket
 * cuando el objeto despierta.
 */
export class Sala extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.logica = null;
    this.siguiente = 1;
    // "ping" → "pong" sin despertar al objeto (mantiene viva la conexión gratis).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => { this.siguiente = (await ctx.storage.get('siguiente')) || 1; });
  }

  /** Sockets aceptados que siguen abiertos. */
  abiertos() { return this.ctx.getWebSockets().filter(ws => ws.readyState === 1 && ws.deserializeAttachment()); }

  estado() {
    if (!this.logica) {
      const adj = this.abiertos().map(ws => ws.deserializeAttachment());
      const anf = adj.find(a => a.anfitrion);
      this.logica = SalaLogica.desde(adj.map(a => a.id), anf ? anf.id : null, this.siguiente);
    }
    return this.logica;
  }

  async fetch() {
    const [cliente, servidor] = Object.values(new WebSocketPair());
    const s = this.estado();
    const r = s.unir();
    if (!r.ok) {
      servidor.accept();
      servidor.send(JSON.stringify({ t: T.FIN, motivo: r.motivo }));
      servidor.close(4001, r.motivo);
      return new Response(null, { status: 101, webSocket: cliente });
    }
    this.siguiente = s.siguiente;
    await this.ctx.storage.put('siguiente', this.siguiente);
    this.ctx.acceptWebSocket(servidor);
    servidor.serializeAttachment({ id: r.id, anfitrion: r.anfitrion });
    servidor.send(JSON.stringify({ t: T.HOLA, id: r.id, anfitrion: r.anfitrion, jugadores: s.jugadores }));
    this.difundir({ t: T.ENTRO, id: r.id }, r.id);
    return new Response(null, { status: 101, webSocket: cliente });
  }

  webSocketMessage(ws, datos) {
    if (typeof datos !== 'string' || datos.length > MAX_BYTES) return;
    let msg;
    try { msg = JSON.parse(datos); } catch { return; }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    const yo = ws.deserializeAttachment();
    if (!yo) return;
    const s = this.estado();
    // paquete: cada mensaje va a su destino; a cada receptor le llega un solo paquete
    const lista = msg.t === T.PAQUETE ? (Array.isArray(msg.m) ? msg.m.slice(0, 64) : []) : [msg];
    const paraTodos = [], paraAnf = [];
    for (const m of lista) {
      if (!m || typeof m !== 'object' || typeof m.t !== 'string' || m.t === T.PAQUETE) continue;
      const destino = s.destino(yo.id, m.t);
      if (destino === 'todos') paraTodos.push(m);
      else if (destino === 'anfitrion') paraAnf.push(m);
    }
    if (!paraTodos.length && !paraAnf.length) return;
    const empaquetar = l => JSON.stringify(l.length === 1 ? { ...l[0], de: yo.id } : { t: T.PAQUETE, de: yo.id, m: l });
    for (const w of this.abiertos()) {
      const id = w.deserializeAttachment().id;
      if (id === yo.id) continue;
      const l = id === s.anfitrionId ? paraTodos.concat(paraAnf) : paraTodos;
      if (l.length) try { w.send(empaquetar(l)); } catch {}
    }
  }

  webSocketClose(ws) { this.salida(ws); }
  webSocketError(ws) { this.salida(ws); }

  async salida(ws) {
    const yo = ws.deserializeAttachment();
    if (!yo) return;
    ws.serializeAttachment(null);            // no contarlo dos veces (close + error)
    try { ws.close(1000, 'adios'); } catch {}
    const s = this.estado();
    const { cerrar } = s.salir(yo.id, !!yo.anfitrion);
    if (cerrar) {
      for (const w of this.abiertos()) {
        try { w.send(JSON.stringify({ t: T.FIN, motivo: 'anfitrion' })); w.serializeAttachment(null); w.close(4000, 'anfitrion'); } catch {}
      }
      s.ids = [];
    } else this.difundir({ t: T.SALIO, id: yo.id }, yo.id);
    if (s.jugadores.length === 0) {           // sala vacía: no dejar datos guardados
      this.logica = null; this.siguiente = 1;
      await this.ctx.storage.deleteAll();
    }
  }

  difundir(msg, excepto) {
    const texto = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const w of this.abiertos()) {
      if (w.deserializeAttachment().id === excepto) continue;
      try { w.send(texto); } catch {}
    }
  }
}
