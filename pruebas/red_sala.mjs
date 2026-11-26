/**
 * Prueba de integración del servidor de salas.
 * Uso: node pruebas/red_sala.mjs ws://127.0.0.1:8787   (con `npx wrangler dev` activo)
 *      node pruebas/red_sala.mjs wss://<tu-worker>.workers.dev
 */
const BASE = process.argv[2] || 'ws://127.0.0.1:8787';
const HTTP = BASE.replace(/^ws/, 'http');
let fallos = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLO') + ' ' + m); if (!c) fallos++; };
const espera = ms => new Promise(r => setTimeout(r, ms));
const codigo = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');

function cliente(cod) {
  const ws = new WebSocket(`${BASE}/sala/${cod}`);
  const c = { ws, msgs: [], cerrado: null };
  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch { c.msgs.push({ crudo: e.data }); return; }
    if (m.t === 'paq') { c.paquetes = (c.paquetes || 0) + 1; for (const s of m.m) c.msgs.push({ ...s, de: m.de }); } else c.msgs.push(m);
  };
  ws.onclose = e => { c.cerrado = { code: e.code, reason: e.reason }; };
  c.listo = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  c.enviar = o => ws.send(typeof o === 'string' ? o : JSON.stringify(o));
  c.de = t => c.msgs.filter(m => m.t === t);
  return c;
}

try {
  // 1) Dos jugadores: anfitrión y cliente
  const cod = codigo();
  const a = cliente(cod); await a.listo; await espera(150);
  const b = cliente(cod.toLowerCase()); await b.listo; await espera(250);
  const ha = a.de('hola')[0], hb = b.de('hola')[0];
  ok(ha && ha.anfitrion === true && ha.id === 1, 'el primero recibe HOLA como anfitrión');
  ok(hb && hb.anfitrion === false && hb.id === 2, 'el segundo (código en minúsculas) entra como cliente');
  ok(hb && hb.jugadores.length === 2, 'HOLA trae la lista de jugadores');
  ok(a.de('entro').some(m => m.id === 2), 'el anfitrión recibe ENTRO del segundo');

  // 2) Reenvío
  b.enviar({ t: 'jug', p: [1, 0, 2] }); await espera(250);
  ok(a.de('jug').some(m => m.de === 2 && m.p[0] === 1), 'JUGADOR del cliente llega al anfitrión con de:2');
  ok(b.de('jug').length === 0, 'el emisor no recibe su propio mensaje');
  b.enviar({ t: 'zom', z: [] }); await espera(250);
  ok(a.de('zom').length === 0, 'ZOMBIS de un no-anfitrión se descarta');
  b.enviar({ t: 'dan', zid: 3, cantidad: 10 }); await espera(250);
  ok(a.de('dan').some(m => m.de === 2 && m.zid === 3), 'DANO llega al anfitrión');

  // 2b) Paquetes: varios mensajes en uno (un solo mensaje entrante facturable), cada uno con su destino
  const antesJug = a.de('jug').length, antesDan = a.de('dan').length;
  b.enviar({ t: 'paq', m: [{ t: 'jug', p: [9, 0, 9] }, { t: 'dan', l: [[1, 5, 'torso', 'pistola', 0, 1]] }, { t: 'zom', z: [] }, 'basura', null] });
  await espera(300);
  ok(a.de('jug').length === antesJug + 1 && a.de('jug').some(m => m.de === 2 && m.p[0] === 9), 'un paquete entrega cada mensaje a su destino (JUGADOR)');
  ok(a.de('dan').length === antesDan + 1, 'y el DANO del paquete llega al anfitrión');
  ok(a.de('zom').length === 0, 'un ZOMBIS dentro del paquete de un cliente se descarta');
  ok(b.de('jug').filter(m => m.p && m.p[0] === 9).length === 0, 'el emisor no recibe su propio paquete');
  a.enviar({ t: 'paq', m: [{ t: 'zom', z: [[1]] }, { t: 'jug', p: [4, 0, 4] }] });
  await espera(300);
  ok(b.de('zom').length === 1 && b.de('jug').some(m => m.de === 1 && m.p[0] === 4), 'el paquete del anfitrión llega completo a los clientes');

  // 3) Basura no tumba la sala
  b.enviar('esto no es json'); b.enviar(JSON.stringify({ t: 'jug', x: 'x'.repeat(20000) }));
  await espera(250);
  b.enviar({ t: 'jug', p: [7, 0, 7] }); await espera(300);
  ok(a.de('jug').some(m => m.p && m.p[0] === 7), 'tras basura y un mensaje de 20 KB la sala sigue reenviando');
  ok(!a.de('jug').some(m => m.x), 'el mensaje de 20 KB no se reenvió');

  // 4) Sala llena
  const c3 = cliente(cod), c4 = cliente(cod); await Promise.all([c3.listo, c4.listo]); await espera(250);
  const c5 = cliente(cod); await c5.listo.catch(() => {}); await espera(500);
  ok(c5.cerrado && c5.cerrado.reason === 'llena', 'el quinto jugador es rechazado con motivo "llena"');
  ok(c3.de('hola').length === 1 && !c3.cerrado, 'los demás siguen conectados');

  // 5) Sale el anfitrión → FIN a todos
  a.ws.close(1000, 'adios'); await espera(600);
  ok(b.de('fin').some(m => m.motivo === 'anfitrion'), 'si sale el anfitrión, los demás reciben FIN');
  ok(b.cerrado !== null, 'y sus conexiones se cierran');

  // 6) Código inválido → 400
  const r = await fetch(`${HTTP}/sala/ab1`);
  ok(r.status === 400, `código inválido responde 400 (recibido ${r.status})`);
  const r2 = await fetch(`${HTTP}/sala/ABCD`);
  ok(r2.status === 426, `sin cabecera Upgrade responde 426 (recibido ${r2.status})`);

  // 7) El juego estático sigue sirviéndose
  const r3 = await fetch(`${HTTP}/`);
  ok(r3.status === 200 && (await r3.text()).includes('Última Noche'), 'la página del juego se sirve en /');
  const r4 = await fetch(`${HTTP}/servidor/Sala.js`);
  ok(r4.status === 404, `el código del servidor no se publica como archivo (recibido ${r4.status})`);

  for (const c of [b, c3, c4, c5]) try { c.ws.close(); } catch {}
} catch (e) { ok(false, 'excepción: ' + (e && e.message || e)); }

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
