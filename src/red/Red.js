import { T, MAX_BYTES, RED_HZ, normalizarCodigo } from './protocolo.js';

/**
 * Cliente de red de las salas multijugador (WebSocket al Durable Object de la sala).
 *
 * - La dirección del servidor sale de la página (mismo Worker que sirve el juego);
 *   se puede cambiar con ?servidor=ws://host:puerto (p. ej. un servidor en la laptop).
 * - Envío por ticks fijos (RED_HZ, 12 por segundo): todo lo pendiente sale en UN paquete
 *   por tick. Cloudflare factura por mensaje entrante, no por tamaño, así que esto fija
 *   el gasto en 12 mensajes/s por jugador sin importar los FPS ni cuántas cosas pasen.
 *   De los tipos "continuos" (estado del jugador, zombis) solo se manda el último.
 *   Antes de cada envío se llama a los `alTick` (los sistemas escriben ahí su estado).
 * - Sin reconexión automática: si se cae la conexión la partida en sala termina
 *   con un aviso (el servidor asignaría un id nuevo y otro anfitrión).
 */
const CONTINUOS = new Set([T.JUGADOR, T.ZOMBIS]);

export class Red {
  constructor(ctx) {
    this.ctx = ctx;
    this.ws = null;
    this.activa = false;
    this.id = null; this.esAnfitrion = false; this.codigo = null;
    this.jugadores = [];
    this.perfiles = new Map();          // id → { n: nombre, skin }
    this.oyentes = new Map();
    this.pendientes = new Map();        // tipo continuo → último mensaje sin enviar
    this.cola = [];                     // mensajes puntuales (eventos, daño) hasta el próximo tick
    this.tickT = 0;
    this.antesDeTick = [];
    this.enviados = 0; this.recibidos = 0;
    this.pingT = null;
  }

  get base() {
    const q = new URLSearchParams(location.search).get('servidor');
    if (q && /^wss?:\/\//.test(q)) return q.replace(/\/$/, '');
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  }

  alMensaje(tipo, fn) {
    if (!this.oyentes.has(tipo)) this.oyentes.set(tipo, []);
    this.oyentes.get(tipo).push(fn);
  }
  emitir(tipo, msg) { for (const fn of this.oyentes.get(tipo) || []) fn(msg); }
  /** fn(dtTick) se llama justo antes de cada envío. */
  alTick(fn) { this.antesDeTick.push(fn); }

  /** Conecta a la sala. Rechaza con Error('codigo' | 'llena' | 'conexion'). */
  conectar(codigo) {
    const cod = normalizarCodigo(codigo);
    if (!cod) return Promise.reject(new Error('codigo'));
    this.cerrar();
    return new Promise((resolver, rechazar) => {
      let ws;
      try { ws = new WebSocket(`${this.base}/sala/${cod}`); } catch { rechazar(new Error('conexion')); return; }
      this.ws = ws;
      let dentro = false;
      const limite = setTimeout(() => { if (!dentro) { try { ws.close(); } catch {} rechazar(new Error('conexion')); } }, 8000);
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch { return; }   // 'pong' y basura
        if (!m || typeof m.t !== 'string') return;
        this.recibidos++;
        if (m.t === T.PAQUETE) {
          if (!Array.isArray(m.m)) return;
          for (const s of m.m) if (s && typeof s.t === 'string' && s.t !== T.PAQUETE) { s.de = m.de; procesar(s); }
          return;
        }
        procesar(m);
      };
      const procesar = m => {
        if (m.t === T.HOLA) {
          dentro = true; clearTimeout(limite);
          Object.assign(this, { activa: true, id: m.id, esAnfitrion: m.anfitrion, codigo: cod, jugadores: m.jugadores });
          this.pingT = setInterval(() => { if (ws.readyState === 1) ws.send('ping'); }, 25000);
          resolver({ id: m.id, anfitrion: m.anfitrion });
        } else if (m.t === T.ENTRO) { if (!this.jugadores.includes(m.id)) this.jugadores.push(m.id); }
        else if (m.t === T.SALIO) { this.jugadores = this.jugadores.filter(x => x !== m.id); this.perfiles.delete(m.id); }
        else if (m.t === T.FIN && !dentro) { clearTimeout(limite); rechazar(new Error(m.motivo === 'llena' ? 'llena' : 'conexion')); return; }
        if (m.n && m.de) this.perfiles.set(m.de, { n: String(m.n).slice(0, 16), skin: m.skin });
        this.emitir(m.t, m);
        this.ctx.eventos?.emit('red:cambio', m);
      };
      ws.onerror = () => { if (!dentro) { clearTimeout(limite); rechazar(new Error('conexion')); } };
      ws.onclose = e => {
        clearTimeout(limite);
        const estaba = this.activa;
        this.limpiar();
        if (!dentro) rechazar(new Error(e.reason === 'llena' ? 'llena' : 'conexion'));
        else if (estaba && this.ws === null) this.ctx.eventos?.emit('red:caida', { motivo: e.reason || 'conexion' });
      };
    });
  }

  /** Pone un mensaje en el próximo paquete (los continuos sustituyen al anterior del mismo tipo). */
  enviar(tipo, datos = {}) {
    if (!this.activa) return;
    const m = { t: tipo, ...datos };
    if (CONTINUOS.has(tipo)) this.pendientes.set(tipo, m);
    else this.cola.push(m);
  }

  /** Cada fotograma: cuando toca tick, recoge el estado de los sistemas y manda un paquete. */
  vaciar(dt = 0) {
    this.tickT -= dt;
    if (this.tickT > 0) return;
    const paso = 1 / RED_HZ;
    this.tickT = Math.max(0, this.tickT + paso);          // ritmo fijo aunque los FPS varíen
    for (const fn of this.antesDeTick) fn(paso);
    const l = [...this.pendientes.values(), ...this.cola];
    this.pendientes.clear(); this.cola = [];
    if (!l.length) return;
    // si el paquete se pasa de tamaño, se parte (no debería pasar: ~60 zombis ≈ 3 KB)
    let actual = [], bytes = 0;
    for (const m of l) {
      const n = JSON.stringify(m).length;
      if (actual.length && bytes + n > MAX_BYTES - 200) { this.mandarPaquete(actual); actual = []; bytes = 0; }
      actual.push(m); bytes += n;
    }
    this.mandarPaquete(actual);
  }
  mandarPaquete(l) { this.mandar(l.length === 1 ? l[0] : { t: T.PAQUETE, m: l }); }
  mandar(m) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return;
    const texto = JSON.stringify(m);
    if (texto.length > MAX_BYTES) { console.warn('[red] mensaje demasiado grande, descartado', m.t, texto.length); return; }
    ws.send(texto); this.enviados++;
  }

  limpiar() {
    clearInterval(this.pingT); this.pingT = null;
    this.activa = false; this.ws = null; this.id = null; this.esAnfitrion = false; this.codigo = null;
    this.jugadores = []; this.perfiles.clear(); this.pendientes.clear(); this.cola = []; this.tickT = 0;
  }

  cerrar() {
    const ws = this.ws;
    this.limpiar();
    if (ws) { ws.onclose = null; try { ws.close(1000, 'salir'); } catch {} }
  }
}
