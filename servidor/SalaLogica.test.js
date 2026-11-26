import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SalaLogica } from './SalaLogica.js';
import { T, MAX_BYTES, normalizarCodigo } from '../src/red/protocolo.js';

test('el primero en entrar es anfitrión, el segundo no', () => {
  const s = new SalaLogica();
  assert.deepEqual(s.unir(), { ok: true, id: 1, anfitrion: true });
  assert.deepEqual(s.unir(), { ok: true, id: 2, anfitrion: false });
  assert.equal(s.anfitrionId, 1);
  assert.deepEqual(s.jugadores, [1, 2]);
});

test('el quinto jugador recibe sala llena', () => {
  const s = new SalaLogica(4);
  for (let i = 0; i < 4; i++) assert.equal(s.unir().ok, true);
  assert.deepEqual(s.unir(), { ok: false, motivo: 'llena' });
  assert.equal(s.jugadores.length, 4);
});

test('si sale el anfitrión se cierra la sala; si sale otro, no', () => {
  const s = new SalaLogica();
  s.unir(); s.unir(); s.unir();
  assert.deepEqual(s.salir(2), { cerrar: false });
  assert.deepEqual(s.salir(1), { cerrar: true });
});

test('ids liberados no se reutilizan', () => {
  const s = new SalaLogica();
  s.unir(); s.unir();
  s.salir(2);
  assert.equal(s.unir().id, 3);
});

test('destino de cada tipo de mensaje', () => {
  const s = new SalaLogica();
  s.unir(); s.unir();
  assert.equal(s.destino(2, T.ZOMBIS), 'descartar');
  assert.equal(s.destino(1, T.ZOMBIS), 'todos');
  assert.equal(s.destino(2, T.FIN), 'descartar');
  assert.equal(s.destino(2, T.DANO), 'anfitrion');
  assert.equal(s.destino(2, T.JUGADOR), 'todos');
  assert.equal(s.destino(2, T.DISPARO), 'todos');
  assert.equal(s.destino(9, T.JUGADOR), 'descartar');   // emisor desconocido
  assert.equal(s.destino(2, 'INVENTADO'), 'descartar');
  assert.equal(s.destino(2, T.HOLA), 'descartar');      // solo los emite el servidor
});

test('normalizarCodigo', () => {
  assert.equal(normalizarCodigo(' abcd '), 'ABCD');
  assert.equal(normalizarCodigo('ab'), null);
  assert.equal(normalizarCodigo('AB1D'), null);
  assert.equal(normalizarCodigo('ABCDE'), null);
  assert.equal(normalizarCodigo(null), null);
  assert.equal(MAX_BYTES, 16384);
});

test('si sale el anfitrión tras hibernar (estado reconstruido sin él), la sala se cierra', () => {
  const s = SalaLogica.desde([2], null, 3);          // el socket del anfitrión ya no cuenta como abierto
  assert.deepEqual(s.salir(1, true), { cerrar: true });
});
