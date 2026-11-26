/**
 * ÚLTIMA NOCHE — punto de entrada.
 * Crea el contexto compartido (ctx), inicializa los sistemas en orden,
 * muestra la pantalla de carga y arranca el bucle principal.
 */
import { Eventos } from './motor/Eventos.js';
import { Ajustes } from './config/Ajustes.js';
import { Graficos, DISTANCIAS } from './config/Graficos.js';
import { Motor } from './motor/Motor.js';
import { Recursos } from './motor/Recursos.js';
import { Entrada } from './motor/Entrada.js';
import { Colisiones } from './motor/Colisiones.js';
import { Mundo } from './mundo/Mundo.js';
import { Iluminacion } from './mundo/Iluminacion.js';
import { Particulas } from './efectos/Particulas.js';
import { Calcas } from './efectos/Calcas.js';
import { Proyectiles } from './efectos/Proyectiles.js';
import { Audio } from './audio/Audio.js';
import { Jugador } from './jugador/Jugador.js';
import { SistemaArmas } from './armas/SistemaArmas.js';
import { GestorZombis } from './enemigos/GestorZombis.js';
import { cargarCuerpoZombi } from './enemigos/CuerpoGLB.js';
import { Puntuacion } from './juego/Puntuacion.js';
import { Oleadas } from './juego/Oleadas.js';
import { Partida } from './juego/Partida.js';
import { Rendimiento } from './rendimiento/Rendimiento.js';
import { Interfaz } from './ui/Interfaz.js';
import { Botiquines } from './juego/Botiquines.js';
import { Granadas } from './efectos/Granadas.js';
import { Tienda } from './juego/Tienda.js';
import { Municion } from './juego/Municion.js';
import { Suministros } from './juego/Suministros.js';
import { Tactil } from './motor/Tactil.js';
import { Mando } from './motor/Mando.js';
import { EditorHud } from './ui/EditorHud.js';
import { Navegacion } from './enemigos/Navegacion.js';
import { MAPAS } from './mundo/mapas/index.js';
import { Guardado } from './juego/Guardado.js';
import { Red } from './red/Red.js';
import { MenuSala } from './ui/MenuSala.js';
import { Remotos } from './red/Remotos.js';
import { Replicacion } from './red/Replicacion.js';

const $ = id => document.getElementById(id);
const fotograma = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
function progreso(texto, p) { $('cargaTexto').textContent = texto; $('cargaBarra').style.width = Math.round(p * 100) + '%'; }

/**
 * Cambia de mapa en caliente: descarga la geometría y colisiones del anterior,
 * construye el nuevo, recalcula la navegación, recoloca las estaciones de compra,
 * reinicia luces y sonidos ambientales y precompila los materiales nuevos.
 */
async function cargarMapa(ctx, id) {
  const def = MAPAS[id] || MAPAS.barrio;
  if (ctx.mapaActual === def.id) return false;
  const aviso = document.getElementById('cargandoMapa');
  aviso.textContent = `Cargando ${def.nombre}…`; aviso.classList.add('ver');
  await fotograma();
  ctx.partida.limpiarMundo();
  ctx.audio.detenerBucles();
  ctx.mundo.destruir();
  ctx.colisiones.limpiar();
  ctx.mundo.construir(def);
  ctx.zombis.nav = new Navegacion(ctx.colisiones, def.limite || 48);
  ctx.armas.montarEstaciones(ctx.mundo.estaciones);
  ctx.botiquines.limpiar();
  ctx.iluminacion.reiniciarAsignaciones();
  ctx.graficos.aplicarMapa();
  if (ctx.audio.listo) for (const f of ctx.mundo.fuegos) ctx.audio.bucle('fuego', f.pos, f.tam * 0.6);
  ctx.mapaActual = def.id;
  ctx.partida.camaraMenu(0);
  try { await ctx.renderer.compileAsync(ctx.escena, ctx.camara); } catch (e) { /* se compila al dibujar */ }
  aviso.classList.remove('ver');
  return true;
}

async function arrancar() {
  const ctx = { eventos: new Eventos() };
  window.__juego = ctx;   // acceso para depuración desde la consola
  ctx.ajustes = new Ajustes(ctx.eventos);

  const lienzo = $('lienzo');
  ctx.motor = new Motor(lienzo, ctx);
  ctx.renderer = ctx.motor.renderer;
  ctx.escena = ctx.motor.escena;
  ctx.camara = ctx.motor.camara;
  if (!ctx.renderer.capabilities.isWebGL2) throw new Error('Este navegador no soporta WebGL 2.');
  if (ctx.ajustes.primeraVez) ctx.ajustes.aplicarPerfil(ctx.ajustes.perfilInicialSegunHardware(ctx.renderer));
  const g = ctx.ajustes.g;

  progreso('Generando texturas procedurales…', 0.08); await fotograma();
  ctx.recursos = new Recursos(ctx.renderer);
  ctx.recursos.calIlum = g.iluminacion;
  ctx.recursos.generarTexturas(g.texturas);

  const seleccion = Guardado.seleccion();
  const mapaInicial = MAPAS[seleccion.mapa] || MAPAS.barrio;
  progreso(`Construyendo ${mapaInicial.nombre}…`, 0.3); await fotograma();
  ctx.colisiones = new Colisiones();
  ctx.mundo = new Mundo(ctx);
  ctx.mundo.construir(mapaInicial);
  ctx.mapaActual = mapaInicial.id;
  ctx.iluminacion = new Iluminacion(ctx);
  ctx.particulas = new Particulas(ctx);
  ctx.calcas = new Calcas(ctx);
  ctx.proyectiles = new Proyectiles(ctx);
  ctx.audio = new Audio(ctx.ajustes, ctx.eventos);
  ctx.entrada = new Entrada(lienzo, ctx.ajustes, ctx.eventos);
  ctx.tactil = new Tactil(ctx);
  ctx.jugador = new Jugador(ctx);

  progreso('Preparando el arsenal…', 0.5); await fotograma();
  ctx.armas = new SistemaArmas(ctx);
  ctx.armas.montarEstaciones(ctx.mundo.estaciones);

  progreso('Despertando a los muertos…', 0.62); await fotograma();
  await cargarCuerpoZombi();                  // modelo de Blender; si falla se usa el clásico
  ctx.zombis = new GestorZombis(ctx);
  ctx.puntuacion = new Puntuacion(ctx);
  ctx.oleadas = new Oleadas(ctx);
  ctx.botiquines = new Botiquines(ctx);
  ctx.granadas = new Granadas(ctx);
  ctx.municion = new Municion(ctx);
  ctx.suministros = new Suministros(ctx);
  ctx.tienda = new Tienda(ctx);
  ctx.red = new Red(ctx);
  ctx.partida = new Partida(ctx);
  ctx.remotos = new Remotos(ctx);
  ctx.replicacion = new Replicacion(ctx);
  ctx.rendimiento = new Rendimiento(ctx);
  ctx.graficos = new Graficos(ctx);
  ctx.interfaz = new Interfaz(ctx);
  ctx.menuSala = new MenuSala(ctx);
  ctx.cargarMapa = id => cargarMapa(ctx, id);
  ctx.editorHud = new EditorHud(ctx);
  ctx.mando = new Mando(ctx);

  progreso('Aplicando calidad gráfica…', 0.78); await fotograma();
  ctx.graficos.aplicarTodo();
  ctx.motor.redimensionar();
  ctx.partida.camaraMenu(0);
  progreso('Compilando shaders…', 0.88); await fotograma();
  try { await ctx.renderer.compileAsync(ctx.escena, ctx.camara); } catch (e) { ctx.renderer.compile(ctx.escena, ctx.camara); }

  // bucle principal: paso(dt, dibujar). Separado del render para poder simular sin dibujar.
  let t = 0;
  ctx.paso = (dt, dibujar = true) => {
    t += dt;
    if (dibujar) ctx.mando.actualizar(dt);
    ctx.partida.actualizar(dt);
    if (ctx.partida.modoSala) ctx.remotos.actualizar(dt);
    if (ctx.red.activa) ctx.red.vaciar(dt);
    if (!dibujar) return;
    ctx.mundo.actualizar(dt, ctx.camara, DISTANCIAS[ctx.ajustes.g.distancia]);
    ctx.iluminacion.actualizar(dt, ctx.camara, t);
    ctx.particulas.setEscala(ctx.renderer.domElement.height, ctx.camara.fov);
    ctx.particulas.actualizar(dt);
    ctx.audio.actualizarOyente(ctx.camara, dt);
    ctx.interfaz.actualizarHUD(dt);
    ctx.tactil.actualizar(dt);
    ctx.rendimiento.actualizar(dt);
    ctx.motor.render(dt);
    ctx.entrada.finFotograma();
  };
  ctx.motor.iniciar(dt => ctx.paso(dt, true));
  latidoEnSegundoPlano(ctx);

  progreso('Listo.', 1);
  const b = $('bEntrar');
  if (ctx.tactil.activo) b.textContent = 'TOCA PARA ENTRAR';
  b.classList.remove('oculto');
  b.onclick = async () => {
    b.classList.add('oculto');
    // en móvil: pantalla completa y orientación horizontal (requieren el gesto del usuario)
    if (ctx.tactil.activo) {
      try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch (e) { /* no disponible */ }
      try { await screen.orientation?.lock?.('landscape'); } catch (e) { /* no disponible */ }
    }
    // el audio solo puede iniciarse tras un gesto del usuario
    try {
      await ctx.audio.iniciar(p => progreso('Sintetizando sonido y música…', p));
      for (const f of ctx.mundo.fuegos) ctx.audio.bucle('fuego', f.pos, f.tam * 0.6);
      ctx.audio.setMusica('menu');
    } catch (e) { console.warn('Audio no disponible', e); }
    ctx.interfaz.mostrarMenu();
  };
}

/**
 * Con la pestaña oculta el navegador detiene requestAnimationFrame. En una sala eso
 * congelaría la partida de los demás (el anfitrión simula los zombis), así que un Worker
 * —cuyos temporizadores no se frenan— marca el ritmo para simular sin dibujar.
 */
function latidoEnSegundoPlano(ctx) {
  let w;
  try {
    const url = URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 50);'], { type: 'text/javascript' }));
    w = new Worker(url);
  } catch (e) { return; }                       // sin Workers: se queda como antes
  let ultimo = performance.now();
  w.onmessage = () => {
    const ahora = performance.now(), dt = Math.min(0.1, (ahora - ultimo) / 1000);
    ultimo = ahora;
    if (document.hidden && ctx.partida.modoSala) { try { ctx.paso(dt, false); } catch (e) { console.error(e); } }
  };
}

arrancar().catch(e => {
  console.error(e);
  progreso('Error al iniciar: ' + e.message, 1);
});
