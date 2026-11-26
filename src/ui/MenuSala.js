import { T, codigoAleatorio } from '../red/protocolo.js';
import { PALETA } from '../jugador/CuerpoJugador.js';

/**
 * Pantalla "Multijugador": crear o unirse a una sala con código de 4 letras,
 * lista de jugadores y botón de empezar (solo el anfitrión).
 */
const $ = id => document.getElementById(id);
const CLAVE_NOMBRE = 'ultimaNoche.nombre';
const ERRORES = {
  codigo: 'El código debe tener 4 letras (por ejemplo: KZMR).',
  llena: 'La sala está llena (máximo 4 jugadores).',
  conexion: 'No se pudo conectar con el servidor de salas. Revisa tu conexión e inténtalo de nuevo.',
};

export class MenuSala {
  constructor(ctx) {
    this.ctx = ctx;
    let n = ''; try { n = localStorage.getItem(CLAVE_NOMBRE) || ''; } catch {}
    $('salaNombre').value = n;
    $('salaCodigoIn').addEventListener('keydown', e => { if (e.key === 'Enter') this.accion('salaUnir'); });
    $('salaSkin').addEventListener('click', e => {
      const b = e.target.closest('[data-skin]'); if (!b) return;
      const campo = b.dataset.skin, i = +b.dataset.valor;
      ctx.ajustes.cambiarSkin(campo, campo === 'mochila' ? i === 1 : PALETA[campo][i]);
      this.construirSkin();
      if (ctx.red.activa) this.presentarme();          // los demás ven el cambio al momento
    });
    this.construirSkin();
    const red = ctx.red;
    red.alMensaje(T.ENTRO, () => { this.presentarme(); this.refrescar(); });
    red.alMensaje(T.SALIO, () => this.refrescar());
    red.alMensaje(T.JUGADOR, m => { if (m.n) this.refrescar(); });
    red.alMensaje(T.FIN, m => { if (m.motivo === 'anfitrion') this.volverPorCierre('El anfitrión cerró la sala.'); });
    ctx.eventos.on('red:caida', () => this.volverPorCierre('Se perdió la conexión con la sala.'));
  }

  /** Muestras de color para ropa, piel y gorra, y la mochila. */
  construirSkin() {
    const sk = this.ctx.ajustes.skin, hex = c => '#' + c.toString(16).padStart(6, '0');
    const fila = (titulo, campo, valores, pintar) => `<span>${titulo}</span><div class="muestras">${valores.map((v, i) => pintar(v, i, campo)).join('')}</div>`;
    const color = (v, i, campo) => v === null
      ? `<button class="texto${sk[campo] === null ? ' activa' : ''}" data-skin="${campo}" data-valor="${i}">Sin</button>`
      : `<button class="${sk[campo] === v ? 'activa' : ''}" style="background:${hex(v)}" data-skin="${campo}" data-valor="${i}" aria-label="${campo} ${i + 1}"></button>`;
    $('salaSkin').innerHTML = fila('Ropa', 'ropa', PALETA.ropa, color) + fila('Piel', 'piel', PALETA.piel, color) + fila('Gorra', 'gorra', PALETA.gorra, color)
      + fila('Mochila', 'mochila', [true, false], (v, i) => `<button class="texto${sk.mochila === v ? ' activa' : ''}" data-skin="mochila" data-valor="${v ? 1 : 0}">${v ? 'Sí' : 'No'}</button>`);
  }

  get nombre() {
    const n = ($('salaNombre').value || '').trim().slice(0, 16);
    return n || `Jugador ${this.ctx.red.id || ''}`.trim();
  }

  abrir() {
    $('salaError').textContent = '';
    this.vista(this.ctx.red.activa ? 'lobby' : 'inicio');
    this.ctx.interfaz.mostrar('pantallaSala');
    this.refrescar();
  }

  vista(v) { $('salaInicio').hidden = v !== 'inicio'; $('salaLobby').hidden = v !== 'lobby'; }

  async entrar(codigo) {
    try { localStorage.setItem(CLAVE_NOMBRE, ($('salaNombre').value || '').trim().slice(0, 16)); } catch {}
    $('salaError').textContent = '';
    $('salaEstado').textContent = 'Conectando…';
    try {
      await this.ctx.red.conectar(codigo);
    } catch (e) {
      $('salaError').textContent = ERRORES[e.message] || ERRORES.conexion;
      $('salaEstado').textContent = '';
      return;
    }
    this.presentarme();
    this.vista('lobby');
    this.refrescar();
  }

  /** Manda nombre y skin a los demás (al entrar y cada vez que llega alguien nuevo). */
  presentarme() { this.ctx.red.mandar({ t: T.JUGADOR, n: this.nombre, skin: this.ctx.ajustes.skin }); }

  refrescar() {
    const red = this.ctx.red;
    if (!red.activa) return;
    $('salaCodigo').textContent = red.codigo;
    const anf = Math.min(...red.jugadores);
    $('salaLista').innerHTML = '';
    for (const id of [...red.jugadores].sort((a, b) => a - b)) {
      const li = document.createElement('li');
      const nombre = id === red.id ? this.nombre : (red.perfiles.get(id)?.n || `Jugador ${id}`);
      li.textContent = `${nombre}${id === anf ? ' · anfitrión' : ''}${id === red.id ? ' (tú)' : ''}`;
      $('salaLista').appendChild(li);
    }
    $('bSalaEmpezar').hidden = !red.esAnfitrion;
    const P = this.ctx.partida;
    $('salaEstado').textContent = red.esAnfitrion
      ? `Comparte el código con tus amigos. Mapa: ${this.ctx.interfaz.nombreSeleccion()}`
      : (P.modoSala ? 'Partida en curso…' : 'Esperando a que el anfitrión empiece la partida…');
  }

  volverPorCierre(texto) {
    const P = this.ctx.partida;
    this.ctx.red.cerrar();
    if (P.modoSala) P.salirAlMenu();
    this.vista('inicio');
    if (this.ctx.interfaz.visible() === 'pantallaSala' || !P.jugando) {
      this.ctx.interfaz.mostrar('pantallaSala');
      $('salaError').textContent = texto;
    }
    this.ctx.interfaz.notificar(texto);
  }

  accion(a) {
    const red = this.ctx.red;
    if (a === 'multi') this.abrir();
    else if (a === 'salaCrear') this.entrar(codigoAleatorio());
    else if (a === 'salaUnir') this.entrar($('salaCodigoIn').value);
    else if (a === 'salaEmpezar') { if (red.esAnfitrion) this.ctx.interfaz.abrirEquipo(); }
    else if (a === 'salaSalir') { red.cerrar(); this.vista('inicio'); $('salaEstado').textContent = ''; }
    else return false;
    return true;
  }
}
