import * as THREE from 'three';
import { Guardado } from './Guardado.js';
import { MODOS } from './Oleadas.js';
import { MAPAS } from '../mundo/mapas/index.js';
import { T } from '../red/protocolo.js';

/**
 * Orquestador de la partida: estados (menú, jugando, pausa, muriendo, fin),
 * inicio/continuación (con carga del mapa elegido), pausa con liberación del
 * ratón, fin de partida y orden de actualización de los sistemas de juego.
 */
export class Partida {
  constructor(ctx) {
    this.ctx = ctx;
    this.estado = 'menu';
    this.modo = 'clasico';
    this.mapa = ctx.mapaActual || 'barrio';
    this.dios = false;            // modo de pruebas (invulnerable)
    this.menuT = 0;
    ctx.eventos.on('jugador:muerto', () => {
      if (this.estado !== 'jugando') return;
      this.estado = 'muriendo'; this.muerteT = 0;
      ctx.audio.setMusica('derrota');
    });
    // con ratón: soltar el puntero (Esc) pausa. En pantallas táctiles no hay puntero que soltar.
    ctx.eventos.on('entrada:liberado', () => { if (this.estado === 'jugando' && this.necesitaRaton) this.pausar(); });
    // Si el navegador no deja capturar el ratón (p. ej. al reanudar justo después de pulsar Esc,
    // Chrome lo impide durante ~1 s), la partida espera en pausa a que hagas clic en vez de seguir sin cámara.
    ctx.eventos.on('entrada:errorBloqueo', () => { if (this.estado === 'jugando' && this.necesitaRaton) this.esperarRaton(); });
    ctx.eventos.on('entrada:bloqueado', () => { if (this.esperandoRaton) this.seguirConRaton(); });
    this.esperandoRaton = false; this.sinRatonT = 0;
    this.modoSala = false;        // partida en una sala multijugador
    this.enlazarRed();
  }

  // ------------------------------------------------------------ multijugador
  enlazarRed() {
    const red = this.ctx.red;
    if (!red) return;
    // el anfitrión anuncia la partida; quien llega tarde la recibe al entrar
    red.alMensaje(T.EVENTO, m => {
      if (m.e === 'inicio' && !red.esAnfitrion && !(this.modoSala && this.jugando && this.mapa === m.mapa)) this.nuevaSala(m.modo, m.mapa);
    });
    red.alMensaje(T.ENTRO, () => { if (red.esAnfitrion && this.modoSala) this.anunciarInicio(); });
  }

  anunciarInicio() { this.ctx.red.enviar(T.EVENTO, { e: 'inicio', modo: this.modo, mapa: this.mapa }); }

  /** Partida en sala: el anfitrión la empieza y la anuncia; los clientes la siguen. */
  async nuevaSala(modo, mapa, equipo = this.ctx.interfaz?.equipo) {
    await this.nueva(modo, mapa, equipo ? { ...equipo } : this.equipo, true);
    if (this.ctx.red.esAnfitrion) this.anunciarInicio();
  }

  /** En PC (sin pantalla táctil ni control en uso) se juega con el ratón capturado. */
  get necesitaRaton() { return !this.ctx.tactil.activo && !this.ctx.entrada.mandoActivo && !this.ctx.editorHud?.activo; }

  pedirRaton() { if (this.necesitaRaton) this.ctx.entrada.bloquear(); }

  /** Pausa sin menú: aviso "Haz clic para seguir jugando". */
  esperarRaton() {
    if (this.estado !== 'jugando') return;
    this.estado = 'pausa'; this.esperandoRaton = true;
    this.ctx.entrada.soltarTodo();
    this.ctx.interfaz.mostrarEsperaRaton(true);
  }

  seguirConRaton() {
    this.esperandoRaton = false;
    this.ctx.interfaz.mostrarEsperaRaton(false);
    if (this.estado === 'pausa') { this.estado = 'jugando'; this.sinRatonT = 0; this.ctx.interfaz.mostrarJuego(); }
  }

  /** Reinicia todos los sistemas dinámicos. */
  limpiarMundo() {
    const c = this.ctx;
    c.zombis.limpiar(); c.proyectiles.limpiar(); c.particulas.limpiar(); c.calcas.limpiar(); c.botiquines.limpiar(); c.granadas.limpiar(); c.municion.limpiar(); c.suministros.limpiar();
  }

  get defMapa() { return MAPAS[this.mapa] || MAPAS.barrio; }

  colocarJugador() {
    const i = this.defMapa.inicio;
    this.ctx.jugador.reiniciar(new THREE.Vector3(i.x, 0, i.z), i.yaw);
  }

  /** equipo: { secundaria, principal } de la pantalla de equipamiento (se recuerda para "jugar de nuevo"). */
  async nueva(modo = this.modo, mapa = this.mapa, equipo = this.equipo, sala = false) {
    const c = this.ctx;
    if (this.modoSala && !sala) this.ctx.red?.cerrar();
    this.modoSala = sala;
    this.modo = modo; this.mapa = MAPAS[mapa] ? mapa : 'barrio'; this.equipo = equipo;
    await c.cargarMapa(this.mapa);
    this.limpiarMundo();
    c.puntuacion.reiniciar();
    c.armas.reiniciar(null, equipo);
    this.colocarJugador();
    // suministros comprados en la Tienda (salen de la reserva)
    const sum = c.tienda.tomarSuministros();
    c.jugador.botiquines = sum.botiquines; c.jugador.granadas = sum.granadas;
    c.jugador.chalecos = sum.chalecos || 0; c.jugador.bebidas = sum.bebidas || 0; c.jugador.molotovs = sum.molotovs || 0;
    c.oleadas.reiniciar(modo, 1);
    this.empezar();
  }

  async continuar() {
    const g = Guardado.cargar(); if (!g) return false;
    const c = this.ctx;
    this.modo = g.modo; this.mapa = MAPAS[g.mapa] ? g.mapa : 'barrio';
    await c.cargarMapa(this.mapa);
    this.limpiarMundo();
    c.puntuacion.reiniciar(g.puntuacion);
    c.armas.reiniciar(g.armas);
    this.colocarJugador();
    c.jugador.botiquines = Math.min(c.jugador.botiquinesMax, g.botiquines || 0);
    c.jugador.granadas = Math.min(c.jugador.granadasMax, g.granadas || 0);
    c.jugador.chalecos = Math.min(c.jugador.chalecosMax, g.chalecos || 0);
    c.jugador.bebidas = Math.min(c.jugador.bebidasMax, g.bebidas || 0);
    c.jugador.molotovs = Math.min(c.jugador.molotovsMax, g.molotovs || 0);
    c.jugador.chaleco = Math.min(100, g.chaleco || 0);
    c.tienda.partida = 0;
    c.oleadas.reiniciar(g.modo, g.oleada);
    this.empezar();
    return true;
  }

  empezar() {
    this.estado = 'jugando'; this.sinRatonT = 0;
    this.esperandoRaton = false; this.ctx.interfaz.mostrarEsperaRaton(false);
    this.ctx.interfaz.mostrarJuego();
    this.pedirRaton();
  }

  guardarPunto() {
    if (this.modoSala) return;      // en sala no hay "Continuar"
    const c = this.ctx;
    Guardado.guardar({ modo: this.modo, mapa: this.mapa, oleada: c.oleadas.n, puntuacion: c.puntuacion.guardable(), armas: c.armas.estadoGuardable(), botiquines: c.jugador.botiquines, granadas: c.jugador.granadas, chalecos: c.jugador.chalecos, bebidas: c.jugador.bebidas, molotovs: c.jugador.molotovs, chaleco: Math.round(c.jugador.chaleco) });
  }

  pausar() {
    if (this.estado !== 'jugando') return;
    this.estado = 'pausa'; this.pausaT = performance.now();
    this.esperandoRaton = false; this.ctx.interfaz.mostrarEsperaRaton(false);
    this.ctx.entrada.liberar();
    this.ctx.entrada.soltarTodo();
    this.ctx.interfaz.mostrarPausa();
  }

  /** Del aviso "Haz clic para seguir jugando" al menú de pausa (Esc). */
  pausaDesdeEspera() {
    this.esperandoRaton = false; this.ctx.interfaz.mostrarEsperaRaton(false);
    this.pausaT = performance.now();
    this.ctx.interfaz.mostrarPausa();
  }

  reanudar() {
    if (this.estado !== 'pausa') return;
    this.estado = 'jugando'; this.sinRatonT = 0;
    this.esperandoRaton = false; this.ctx.interfaz.mostrarEsperaRaton(false);
    this.ctx.interfaz.mostrarJuego();
    this.pedirRaton();
  }

  salirAlMenu() {
    if (this.modoSala) { this.modoSala = false; this.ctx.red?.cerrar(); this.ctx.remotos?.limpiar(); }
    this.estado = 'menu';
    this.esperandoRaton = false; this.ctx.interfaz.mostrarEsperaRaton(false);
    this.limpiarMundo();
    this.ctx.entrada.liberar();
    this.ctx.entrada.soltarTodo();
    this.ctx.audio.setMusica('menu');
    this.ctx.interfaz.mostrarMenu();
  }

  terminar(victoria) {
    if (this.estado === 'fin') return;
    const c = this.ctx;
    this.estado = 'fin';
    this.esperandoRaton = false; c.interfaz.mostrarEsperaRaton(false);
    c.entrada.liberar();
    c.entrada.soltarTodo();
    Guardado.borrar();
    const oleada = c.oleadas.n;
    const p = c.puntuacion;
    const record = Guardado.registrar(this.modo, this.mapa, p.total, oleada);
    c.audio.setMusica(victoria ? 'calma' : 'derrota');
    c.interfaz.mostrarFin({
      victoria, modo: MODOS[this.modo].nombre, mapa: this.defMapa.nombre, oleada, total: p.total, bajas: p.bajas, cabezas: p.cabezas,
      precision: p.precision, racha: p.mejorRacha, tiempo: p.tiempo, record, porTipo: p.porTipo,
      mejor: Guardado.record(this.modo, this.mapa), monedas: c.tienda.partida, cartera: c.tienda.monedas,
    });
  }

  actualizar(dt) {
    const c = this.ctx;
    if (this.estado === 'menu' || this.estado === 'fin') { this.camaraMenu(dt); return; }
    if (this.estado === 'pausa') return;
    // en PC, si el ratón no está capturado la partida no corre (los zombis no atacan a un jugador sin cámara)
    if (this.estado === 'jugando' && this.necesitaRaton && !c.entrada.bloqueado) {
      this.sinRatonT += dt;
      if (this.sinRatonT > 1.5) { this.esperarRaton(); return; }
    } else this.sinRatonT = 0;
    c.jugador.actualizar(dt, c.entrada);
    c.armas.actualizar(dt, c.entrada);
    c.zombis.actualizar(dt);
    c.proyectiles.actualizar(dt);
    c.calcas.actualizar(dt, c.jugador);
    c.botiquines.actualizar(dt);
    c.granadas.actualizar(dt);
    c.municion.actualizar(dt);
    c.suministros.actualizar(dt);
    if (this.estado === 'jugando') { c.oleadas.actualizar(dt); c.puntuacion.actualizar(dt); }
    if (this.estado === 'muriendo') {
      this.muerteT += dt;
      if (this.muerteT > 3) this.terminar(false);
    }
  }

  /** Cámara de presentación que recorre el mapa cargado detrás de los menús. */
  camaraMenu(dt) {
    this.menuT += dt * 0.05;
    const cam = this.ctx.camara;
    (MAPAS[this.ctx.mapaActual] || MAPAS.barrio).camaraMenu(cam, this.menuT);
    if (cam.fov !== 70) { cam.fov = 70; cam.updateProjectionMatrix(); }
  }

  get jugando() { return this.estado === 'jugando' || this.estado === 'muriendo'; }
}
