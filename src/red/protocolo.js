/**
 * Protocolo de red compartido entre el cliente (navegador) y el servidor (Worker).
 * Cada mensaje es JSON con un campo `t` (tipo). El servidor añade `de` (id del emisor)
 * a los mensajes que reenvía.
 */
export const T = Object.freeze({
  HOLA: 'hola',       // servidor → recién llegado: {id, anfitrion, jugadores}
  ENTRO: 'entro',     // servidor → todos: {id}
  SALIO: 'salio',     // servidor → todos: {id}
  JUGADOR: 'jug',     // cliente → todos: estado del jugador
  ZOMBIS: 'zom',      // anfitrión → todos: instantánea de zombis y oleada
  DISPARO: 'dis',     // cliente → todos: efecto de disparo
  DANO: 'dan',        // cliente → anfitrión: daño a un zombi
  EVENTO: 'eve',      // anfitrión → todos: sucesos puntuales (oleada, caída, reaparición)
  FIN: 'fin',         // anfitrión o servidor → todos: la partida termina
  PAQUETE: 'paq',     // varios mensajes en uno: {m: [...]} (un solo mensaje entrante facturable)
});

export const MAX_BYTES = 16384;
export const RED_HZ = 12;           // envíos por segundo de cada jugador (un paquete por envío)
export const MAX_JUGADORES = 4;

/** Código de sala: exactamente 4 letras A–Z (se aceptan minúsculas y espacios alrededor). */
export function normalizarCodigo(c) {
  if (typeof c !== 'string') return null;
  const s = c.trim().toUpperCase();
  return /^[A-Z]{4}$/.test(s) ? s : null;
}

/** Código aleatorio sin letras confusas (I, O). */
export function codigoAleatorio(azar = Math.random) {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 4; i++) s += L[Math.floor(azar() * L.length)];
  return s;
}
