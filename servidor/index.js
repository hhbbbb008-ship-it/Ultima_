/**
 * Worker de Última Noche.
 *  - /sala/<CODIGO>  → WebSocket hacia el Durable Object de esa sala.
 *  - cualquier otra ruta → archivos estáticos del juego (gratis e ilimitados en Cloudflare).
 */
import { normalizarCodigo } from '../src/red/protocolo.js';
export { Sala } from './Sala.js';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/sala/')) {
      const codigo = normalizarCodigo(decodeURIComponent(url.pathname.slice(6)));
      if (!codigo) return new Response('Código de sala inválido', { status: 400 });
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Se esperaba WebSocket', { status: 426 });
      return env.SALA.getByName(codigo).fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
};
