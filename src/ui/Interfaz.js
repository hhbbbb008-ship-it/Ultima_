import { OPCIONES_GRAFICAS, PERFILES, NOMBRES_PERFIL, ORDEN_PERFILES, ACCIONES } from '../config/Ajustes.js';
import { nombreTecla } from '../motor/Entrada.js';
import { MODOS } from '../juego/Oleadas.js';
import { ARMAS, ORDEN_ARMAS, SECUNDARIAS, PRINCIPALES, CUERPO } from '../armas/DefArmas.js';
import { Guardado } from '../juego/Guardado.js';
import { MAPAS, ORDEN_MAPAS } from '../mundo/mapas/index.js';
import { PRECIOS_ARMAS, PRECIO_BOTIQUIN, PRECIO_GRANADA, LOTE_GRANADAS, MAX_RESERVA, PRECIO_CHALECO, PRECIO_BEBIDA, PRECIO_MOLOTOV, JEFES_KATANA } from '../juego/Tienda.js';

/**
 * Interfaz: menús (principal, modos, configuración, créditos, pausa, fin)
 * y HUD de partida (salud, munición, puntuación, oleada, retícula dinámica,
 * marcas de impacto, indicadores de daño direccionales, avisos).
 * Todas las opciones se generan a partir de las definiciones de Ajustes,
 * así que cada control está conectado a un parámetro real.
 */
const $ = id => document.getElementById(id);
const PANTALLAS = ['carga', 'menuPrincipal', 'pantallaModos', 'pantallaEquipo', 'pantallaTienda', 'pantallaAjustes', 'pantallaCreditos', 'menuPausa', 'pantallaFin', 'pantallaSala'];

export class Interfaz {
  constructor(ctx) {
    this.ctx = ctx;
    const sel = Guardado.seleccion();
    this.modoSel = MODOS[sel.modo] ? sel.modo : 'clasico';
    this.mapaSel = ctx.mapaActual || 'barrio';
    this.equipo = { secundaria: SECUNDARIAS.includes(sel.secundaria) ? sel.secundaria : 'pistola', principal: PRINCIPALES.includes(sel.principal) ? sel.principal : 'subfusil', cuerpo: CUERPO.includes(sel.cuerpo) ? sel.cuerpo : '' };
    this.equipoValido();
    this.origen = 'menuPrincipal';
    this.cache = {};
    this.marcaT = 0; this.danoT = 0; this.avisoT = 0; this.notiT = 0;

    document.addEventListener('click', e => {
      const b = e.target.closest('[data-accion]');
      if (b && !b.disabled) { this.ctx.audio.reproducir?.('marca', { bus: 'interfaz', vol: 0.25, reverb: 0 }); this.accion(b.dataset.accion); }
      const p = e.target.closest('[data-pestana]');
      if (p) this.pestana(p.dataset.pestana);
    });
    ctx.entrada.lienzo.addEventListener('click', () => {
      if (ctx.partida.estado === 'jugando' && !ctx.entrada.bloqueado && !ctx.tactil.activo) ctx.entrada.bloquear();
    });
    // aviso "Haz clic para seguir jugando": el clic es el gesto que el navegador exige para capturar el ratón
    $('esperaRaton').addEventListener('click', e => { e.stopPropagation(); ctx.entrada.bloquear(); });
    window.addEventListener('keydown', e => {
      if (e.code !== 'Escape' || this.ctx.entrada.captura || e.repeat) return;
      const P = this.ctx.partida, vis = this.visible();
      if (P.esperandoRaton) { P.pausaDesdeEspera(); return; }
      // Esc en el menú de pausa vuelve al juego (con un margen: el mismo Esc que soltó el ratón no cuenta)
      if (vis === 'menuPausa' && P.estado === 'pausa' && performance.now() - (P.pausaT || 0) > 500) { P.reanudar(); return; }
      if (['pantallaAjustes', 'pantallaModos', 'pantallaCreditos', 'pantallaEquipo', 'pantallaTienda', 'pantallaSala'].includes(vis)) this.accion('volver');
    });

    ctx.eventos.on('arma:impacto', d => this.marcaImpacto(d));
    ctx.eventos.on('jugador:dano', d => this.indicadorDano(d));
    ctx.eventos.on('puntos', d => this.popupPuntos(d));
    ctx.eventos.on('oleada:preparacion', d => { if (d.n === 1) this.aviso(MAPAS[ctx.mapaActual]?.nombre.toUpperCase() || 'SOBREVIVE A LA NOCHE', `La primera oleada llega en ${Math.round(d.espera)} s · Compra armas en las paredes ${ctx.tactil.activo ? 'con el botón COMPRAR' : `con [${nombreTecla(ctx.ajustes.controles.interactuar)}]`}`, 5); });
    ctx.eventos.on('jugador:curado', d => this.popupPuntos({ cant: d.cant, motivo: 'SALUD', mult: 1, clase: 'cura' }));
    ctx.eventos.on('municion:recogida', d => this.popupPuntos({ texto: d.texto, clase: 'municion' }));
    ctx.eventos.on('katana:desbloqueada', () => this.aviso('¡KATANA DESBLOQUEADA!', `Has matado ${JEFES_KATANA} Colosos · Equípala en la ranura de cuerpo a cuerpo`, 5, 'exito'));
    ctx.eventos.on('jefe:contado', d => this.popupPuntos({ texto: `COLOSO ${d.n}/${d.total} PARA LA KATANA`, clase: 'municion' }));
    ctx.eventos.on('botiquin:recogido', d => this.popupPuntos({ texto: `+1 BOTIQUÍN (${d.total})`, clase: 'cura' }));
    ctx.eventos.on('tactil:cambio', () => { if (this.visible() === 'menuPrincipal') this.mostrarMenu(); });
    ctx.eventos.on('oleada:inicio', d => this.aviso(`OLEADA ${d.n}`, d.jefe ? 'Se acerca algo enorme…' : `${d.total} infectados en camino`, 3, d.jefe ? 'jefe' : ''));
    ctx.eventos.on('oleada:fin', d => this.aviso(`OLEADA ${d.n} SUPERADA`, `+${d.bono} puntos · Prepárate`, 3.5, 'exito'));
    ctx.eventos.on('oleada:jefe', () => this.aviso('¡COLOSO!', 'Dispara a la cabeza y esquiva su embestida', 3, 'jefe'));
    ctx.eventos.on('entrada:errorBloqueo', () => { if (!ctx.entrada.mandoActivo && !ctx.partida.esperandoRaton) this.notificar('No se pudo capturar el ratón: haz clic en la pantalla'); });
    ctx.eventos.on('ajustes:graficos', () => this.refrescarGraficos());
    ctx.eventos.on('graficos:aplicados', ({ coste }) => { const i = $('infoGraficos'); if (i) { i.textContent = `Perfil: ${NOMBRES_PERFIL[ctx.ajustes.perfil]} · Los cambios se aplican al instante (último cambio: ${coste.toFixed(0)} ms).`; i.classList.remove('aviso'); } });
    ctx.eventos.on('ajustes:controles', () => this.construirControles());

    this.construirModos();
    this.construirMapas();
    this.construirGeneral();
    this.construirAudio();
    this.construirGraficos();
    this.construirControles();
    this.construirRanuras();
  }

  // ------------------------------------------------------------ navegación
  visible() { return PANTALLAS.find(id => $(id).classList.contains('visible')); }
  mostrar(id) {
    for (const p of PANTALLAS) $(p).classList.toggle('visible', p === id);
    // el HUD solo se ve durante la partida (también detrás del menú de pausa y sus submenús)
    const enPartida = this.ctx.partida.jugando || this.ctx.partida.estado === 'pausa';
    $('hud').classList.toggle('oculto', !enPartida);
    document.body.classList.toggle('enJuego', id === null && this.ctx.partida.estado === 'jugando');
  }
  mostrarMenu() {
    const g = Guardado.cargar();
    $('bContinuar').disabled = !g;
    $('bContinuar').textContent = g ? `Continuar (oleada ${g.oleada} · ${MAPAS[g.mapa]?.nombre || ''})` : 'Continuar';
    const m = Guardado.record(this.modoSel, this.mapaSel);
    const ayuda = this.ctx.tactil.activo
      ? 'Joystick izquierdo moverse · Arrastra a la derecha para mirar · Botón rojo disparar (arrástralo para apuntar) · Empuja el joystick a fondo para correr'
      : this.ayudaTeclado();
    $('bTienda').innerHTML = `Tienda <small style="font-size:.6em;color:#ffe08a;letter-spacing:1px">· ${this.ctx.tienda.monedas} monedas</small>`;
    $('pieMenu').innerHTML = `<b>${MAPAS[this.mapaSel].nombre}</b> · ${MODOS[this.modoSel].nombre}${m ? ` · Récord: ${m.total.toLocaleString('es')} pts (oleada ${m.oleada})` : ''}<br>${ayuda}`;
    this.mostrar('menuPrincipal');
  }
  mostrarJuego() { this.mostrar(null); $('hud').classList.remove('oculto'); }
  mostrarEsperaRaton(v) {
    $('esperaRaton').classList.toggle('visible', v);
    if (v) { this.mostrar(null); $('hud').classList.remove('oculto'); }
  }
  /** Resumen de controles de PC con las teclas que tiene asignadas el jugador (cambian si las reasigna). */
  ayudaTeclado() {
    const k = a => nombreTecla(this.ctx.ajustes.controles[a]);
    const mov = ['adelante', 'izquierda', 'atras', 'derecha'].map(k).join('');
    return [
      `${mov} moverse`, `${k('correr')} correr`, `${k('saltar')} saltar`, `${k('dash')} dash`,
      `${k('disparar')} disparar`, `${k('apuntar')} apuntar`, `${k('recargar')} recargar`, `${k('interactuar')} comprar`,
      `1-5 / rueda armas`, `${k('cuchillo')} cuchillo`, `${k('granada')} granada`, `${k('molotov')} molotov`,
      `${k('botiquin')} botiquín`, `${k('chaleco')} chaleco`, `${k('bebida')} bebida`, `${k('linterna')} linterna`, 'Esc pausa',
    ].join(' · ');
  }
  mostrarPausa() { this.mostrar('menuPausa'); $('hud').classList.remove('oculto'); }
  abrir(id) { this.origen = this.visible() || 'menuPrincipal'; this.mostrar(id); }

  /** Nombre del mapa y modo elegidos (para el lobby multijugador). */
  nombreSeleccion() { return `${MAPAS[this.mapaSel].nombre} · ${MODOS[this.modoSel].nombre}`; }

  accion(a) {
    const P = this.ctx.partida;
    if (this.ctx.menuSala?.accion(a)) return;
    if (a === 'jugar') this.abrirEquipo();
    else if (a === 'empezar' && this.ctx.red?.activa) { if (this.ctx.red.esAnfitrion) P.nuevaSala(this.modoSel, this.mapaSel, { ...this.equipo }); }
    else if (a === 'empezar') P.nueva(this.modoSel, this.mapaSel, { ...this.equipo });
    else if (a === 'continuar') P.continuar();
    else if (a === 'modos') this.abrir('pantallaModos');
    else if (a === 'tienda') { this.construirTienda(); this.origenTienda = this.visible(); this.mostrar('pantallaTienda'); }
    else if (a === 'creditos') this.abrir('pantallaCreditos');
    else if (a.startsWith('ajustes:')) { this.abrir('pantallaAjustes'); this.pestana(a.split(':')[1]); }
    else if (a === 'volver' && this.visible() === 'pantallaTienda') {
      const o = this.origenTienda || 'menuPrincipal';
      if (o === 'pantallaEquipo') { this.construirEquipo(); this.mostrar(o); } else this.mostrarMenu();
    }
    else if (a === 'volver') { this.mostrar(this.origen); if (this.origen === 'menuPrincipal') this.mostrarMenu(); }
    else if (a === 'reanudar') P.reanudar();
    else if (a === 'editarHud') this.ctx.editorHud.abrir(this.visible());
    else if ((a === 'reiniciar' || a === 'otra') && P.modoSala) {
      if (this.ctx.red.esAnfitrion) P.nuevaSala(P.modo, P.mapa, P.equipo); else this.notificar('Solo el anfitrión puede reiniciar la partida');
    }
    else if (a === 'reiniciar') P.nueva(P.modo, P.mapa, P.equipo);
    else if (a === 'salir') P.salirAlMenu();
    else if (a === 'otra') P.nueva(P.modo, P.mapa, P.equipo);
  }

  pestana(n) {
    document.querySelectorAll('.pestanas button').forEach(b => b.classList.toggle('activa', b.dataset.pestana === n));
    document.querySelectorAll('.contenido section').forEach(s => s.classList.toggle('activa', s.dataset.seccion === n));
    if (n === 'graficos') this.refrescarGraficos();
  }

  // ------------------------------------------------------------ construcción de menús
  construirModos() {
    const cont = $('listaModos'); cont.innerHTML = '';
    for (const [id, m] of Object.entries(MODOS)) {
      const b = document.createElement('button');
      b.className = 'modo' + (id === this.modoSel ? ' sel' : '');
      const rec = Guardado.record(id, this.mapaSel);
      b.innerHTML = `<b>${m.nombre}</b><span>${m.desc}</span><em>${m.max ? m.max + ' oleadas' : 'Infinito'}${rec ? ` · Récord ${rec.total.toLocaleString('es')}` : ''}</em>`;
      b.onclick = () => { this.modoSel = id; this.guardarSeleccion(); this.construirModos(); };
      cont.append(b);
    }
  }

  /** Tarjetas de mapa. Elegir uno lo carga al instante como fondo del menú (vista previa real). */
  construirMapas() {
    const cont = $('listaMapas'); cont.innerHTML = '';
    for (const id of ORDEN_MAPAS) {
      const m = MAPAS[id];
      const b = document.createElement('button');
      b.className = 'mapa' + (id === this.mapaSel ? ' sel' : ''); b.dataset.mapa = id;
      const recs = Object.keys(MODOS).map(mo => Guardado.record(mo, id)).filter(Boolean);
      const mejor = recs.length ? Math.max(...recs.map(r => r.total)) : 0;
      b.innerHTML = `<i>Dificultad: ${m.dificultad}</i><b>${m.nombre}</b><span>${m.desc}</span><em>${mejor ? `Mejor puntuación: ${mejor.toLocaleString('es')}` : 'Sin récord todavía'}</em>`;
      b.onclick = async () => {
        if (this.cargandoMapa) return;
        this.mapaSel = id; this.guardarSeleccion(); this.construirMapas(); this.construirModos();
        this.cargandoMapa = true;
        try { await this.ctx.cargarMapa(id); } finally { this.cargandoMapa = false; }
      };
      cont.append(b);
    }
  }

  guardarSeleccion() { Guardado.guardarSeleccion({ mapa: this.mapaSel, modo: this.modoSel, ...this.equipo }); }

  // ------------------------------------------------------------ tienda
  construirTienda() {
    const T = this.ctx.tienda;
    $('tMonedas').textContent = T.monedas;
    const comprar = (fn) => { const error = fn(); if (error) { this.notificar(error); this.ctx.audio.reproducir('sin_puntos', { bus: 'interfaz', reverb: 0 }); } this.construirTienda(); };
    const boton = (texto, precio, fn) => { const b = document.createElement('button'); b.className = 'comprar' + (T.monedas < precio ? ' no' : ''); b.innerHTML = `<i class="monedaIco"></i>${texto} · ${precio}`; b.onclick = e => { e.stopPropagation(); comprar(fn); }; return b; };
    // suministros
    const sum = $('tSuministros'); sum.innerHTML = '';
    const tarjeta = (titulo, desc, reserva) => {
      const c = document.createElement('div'); c.className = 'armaSel';
      c.innerHTML = `<b>${titulo}</b><span>${desc}</span><div class="reserva">En reserva: <b style="font-family:var(--titulo);font-size:20px">${reserva}</b> / ${MAX_RESERVA}</div>`;
      sum.append(c); return c;
    };
    tarjeta('Botiquín', 'Cura 60 de salud (tecla H o botón +). Te llevas hasta 3 a cada partida.', T.d.botiquines)
      .append(boton('Comprar 1', PRECIO_BOTIQUIN, () => T.comprarBotiquin()));
    const g = tarjeta('Granada de fragmentación', 'Rebota, explota a los 2 s y destroza todo en 6 m (tecla G o botón ●). Te llevas hasta 4.', T.d.granadas);
    const fila = document.createElement('div'); fila.className = 'fila2';
    fila.append(boton('1', PRECIO_GRANADA, () => T.comprarGranadas(false)), boton(`Lote de ${LOTE_GRANADAS.n}`, LOTE_GRANADAS.precio, () => T.comprarGranadas(true)));
    g.append(fila);
    const tc = (id) => nombreTecla(this.ctx.ajustes.controles[id]);
    tarjeta('Molotov', `Se rompe al chocar y deja un charco de fuego 7 s que quema a los zombis (tecla ${tc('molotov')} o botón ✸). Te llevas hasta 3.`, T.d.molotovs || 0)
      .append(boton('Comprar 1', PRECIO_MOLOTOV, () => T.comprarMolotov()));
    tarjeta('Chaleco antibalas', `Absorbe el 70 % del daño hasta agotar sus 100 puntos (tecla ${tc('chaleco')} o botón ◈). Te llevas hasta 2.`, T.d.chalecos || 0)
      .append(boton('Comprar 1', PRECIO_CHALECO, () => T.comprarChaleco()));
    tarjeta('Bebida energética', `Recupera al instante 1 carga de dash de esquive (tecla ${tc('bebida')} o botón ⚡). Te llevas hasta 3.`, T.d.bebidas || 0)
      .append(boton('Comprar 1', PRECIO_BEBIDA, () => T.comprarBebida()));
    // armas
    const cont = $('tArmas'); cont.innerHTML = '';
    for (const id of [...SECUNDARIAS, ...PRINCIPALES, ...CUERPO]) {
      const d = ARMAS[id], libre = T.desbloqueada(id);
      const c = document.createElement('div'); c.className = 'armaSel' + (libre ? '' : ' bloqueada');
      c.innerHTML = `<b>${d.nombre}</b><span>${d.desc}</span>` + (libre ? `<div class="estado">${PRECIOS_ARMAS[id] || id === 'katana' ? 'Desbloqueada' : 'Incluida'}</div>` : '');
      if (!libre && id === 'katana') c.insertAdjacentHTML('beforeend', `<div class="estado">Colosos muertos: <b>${T.jefes}</b> / ${JEFES_KATANA}</div>`);
      else if (!libre) c.append(boton('Desbloquear', T.precioArma(id), () => T.comprarArma(id)));
      cont.append(c);
    }
  }

  // ------------------------------------------------------------ equipamiento
  abrirEquipo() {
    this.construirEquipo();
    // "volver" regresa a la pantalla desde la que se pulsó Jugar (menú o Mapa y modo)
    const vis = this.visible();
    this.origen = vis && vis !== 'pantallaEquipo' ? vis : 'menuPrincipal';
    this.mostrar('pantallaEquipo');
  }

  /** Si la elección guardada está bloqueada (sin comprar en la Tienda), vuelve a las gratuitas. */
  equipoValido() {
    const T = this.ctx.tienda;
    if (!T) return;
    if (!T.desbloqueada(this.equipo.secundaria)) this.equipo.secundaria = 'pistola';
    if (!T.desbloqueada(this.equipo.principal)) this.equipo.principal = 'subfusil';
    if (this.equipo.cuerpo && !T.desbloqueada(this.equipo.cuerpo)) this.equipo.cuerpo = '';
  }

  construirEquipo() {
    const T = this.ctx.tienda;
    this.equipoValido();
    const sum = T.suministros();
    $('equipoInfo').innerHTML = `<b>${MAPAS[this.mapaSel].nombre}</b> · ${MODOS[this.modoSel].nombre} · Te llevas de tu reserva <b>${sum.botiquines}</b> botiquines, <b>${sum.granadas}</b> granadas, <b>${sum.molotovs}</b> molotovs, <b>${sum.chalecos}</b> chalecos y <b>${sum.bebidas}</b> bebidas · <span style="color:#ffe08a">${T.monedas} monedas</span>. Las armas con candado se desbloquean con monedas.`;
    // escalas de las barras (relativas a todo el arsenal)
    const todas = ORDEN_ARMAS.map(id => ARMAS[id]).filter(d => !d.cuerpo);
    const max = {
      dano: Math.max(...todas.map(d => d.dano * d.perdigones)), cad: Math.max(...todas.map(d => 1 / d.cadencia)),
      alc: Math.max(...todas.map(d => d.alcance[1])), pre: Math.max(...todas.map(d => 1 / d.dispApuntar)),
    };
    const barra = (et, v) => `<div class="stat">${et}<i style="--v:${Math.max(6, Math.min(100, v * 100)).toFixed(0)}%"></i></div>`;
    const tarjetas = (cont, lista, clave) => {
      cont.innerHTML = '';
      for (const id of lista) {
        const d = ARMAS[id];
        const b = document.createElement('button');
        const libre = T.desbloqueada(id);
        b.className = 'armaSel' + (this.equipo[clave] === id ? ' sel' : '') + (libre ? '' : ' bloqueada'); b.dataset.arma = id;
        b.innerHTML = `<b>${d.nombre}</b><span>${d.desc}</span>` +
          barra('Daño', (d.dano * d.perdigones) / max.dano) + barra('Cadencia', (1 / d.cadencia) / max.cad) +
          barra('Alcance', d.alcance[1] / max.alc) + barra('Precisión', Math.sqrt((1 / d.dispApuntar) / max.pre)) +
          (libre ? `<em>Cargador ${d.cargador} · Reserva ${d.reservaInicial}${d.tipo === 'auto' ? ' · Automática' : ''}</em>`
            : `<div class="comprar${T.monedas < T.precioArma(id) ? ' no' : ''}"><i class="monedaIco"></i>Desbloquear · ${T.precioArma(id)}</div>`);
        b.onclick = (e) => {
          if (!T.desbloqueada(id)) {
            if (!e.target.closest('.comprar')) { this.notificar(`${d.nombre}: desbloquéala con ${T.precioArma(id)} monedas`); return; }
            const error = T.comprarArma(id);
            if (error) { this.notificar(error); this.ctx.audio.reproducir('sin_puntos', { bus: 'interfaz', reverb: 0 }); return; }
          }
          this.equipo[clave] = id; this.guardarSeleccion(); this.construirEquipo();
        };
        cont.append(b);
      }
    };
    tarjetas($('listaSecundaria'), SECUNDARIAS, 'secundaria');
    tarjetas($('listaPrincipal'), PRINCIPALES, 'principal');
    // cuerpo a cuerpo (opcional): el cuchillo de la tecla V siempre se lleva
    const lc = $('listaCuerpo'); lc.innerHTML = '';
    for (const id of ['', ...CUERPO]) {
      const d = ARMAS[id], libre = !id || T.desbloqueada(id);
      const b = document.createElement('button');
      b.className = 'armaSel' + (this.equipo.cuerpo === id ? ' sel' : '') + (libre ? '' : ' bloqueada');
      const barras = d ? barra('Daño', d.dano / 230) + barra('Velocidad', 0.48 / d.cadencia) + barra('Alcance', d.alcance[0] / 2.9) + barra('Zombis por golpe', d.objetivos / 5) : '';
      const pie = !d ? '<em>Solo cuchillo (tecla V)</em>'
        : libre ? `<em>Ranura 5 · Sin munición</em>`
        : id === 'katana' ? `<div class="comprar no">Mata ${JEFES_KATANA} Colosos · llevas ${T.jefes}</div>`
        : `<div class="comprar${T.monedas < T.precioArma(id) ? ' no' : ''}"><i class="monedaIco"></i>Desbloquear · ${T.precioArma(id)}</div>`;
      b.innerHTML = d ? `<b>${d.nombre}</b><span>${d.desc}</span>${barras}${pie}` : `<b>Ninguna</b><span>Solo llevas tus dos armas de fuego y el cuchillo.</span>${pie}`;
      b.onclick = (e) => {
        if (id && !T.desbloqueada(id)) {
          if (id === 'katana' || !e.target.closest('.comprar')) { this.notificar(id === 'katana' ? `Katana: mata ${JEFES_KATANA} Colosos (llevas ${T.jefes})` : `${d.nombre}: desbloquéala con ${T.precioArma(id)} monedas`); return; }
          const error = T.comprarArma(id);
          if (error) { this.notificar(error); this.ctx.audio.reproducir('sin_puntos', { bus: 'interfaz', reverb: 0 }); return; }
        }
        this.equipo.cuerpo = id; this.guardarSeleccion(); this.construirEquipo();
      };
      lc.append(b);
    }
  }

  fila(cont, etiqueta, control, valor, desc) {
    const f = document.createElement('div'); f.className = 'fila';
    const l = document.createElement('label'); l.textContent = etiqueta;
    const v = document.createElement('span'); v.className = 'valor'; v.textContent = valor ?? '';
    f.append(l, control, v);
    if (desc) { const d = document.createElement('div'); d.className = 'desc'; d.textContent = desc; f.append(d); }
    cont.append(f);
    return v;
  }
  rango(min, max, paso, valor, alCambiar, formato) {
    const i = document.createElement('input'); i.type = 'range'; i.min = min; i.max = max; i.step = paso; i.value = valor;
    i.oninput = () => { const v = +i.value; if (i._v) i._v.textContent = formato(v); alCambiar(v); };
    return i;
  }
  casilla(valor, alCambiar) {
    const i = document.createElement('input'); i.type = 'checkbox'; i.checked = valor;
    i.onchange = () => alCambiar(i.checked); return i;
  }

  construirGeneral() {
    const c = $('secGeneral'), aj = this.ctx.ajustes; c.innerHTML = '';
    const add = (et, clave, min, max, paso, fmt, desc) => { const r = this.rango(min, max, paso, aj.gen[clave], v => aj.setGeneral(clave, v), fmt); r._v = this.fila(c, et, r, fmt(aj.gen[clave]), desc); };
    add('Sensibilidad del ratón', 'sensibilidad', 0.1, 4, 0.05, v => v.toFixed(2), 'Se reduce automáticamente al apuntar según el zoom del arma.');
    add('Campo de visión (FOV)', 'fov', 65, 110, 1, v => v + '°', 'Ángulo de visión horizontal-vertical de la cámara.');
    add('Sacudida de cámara', 'sacudida', 0, 1.5, 0.05, v => Math.round(v * 100) + ' %', 'Intensidad de los temblores por golpes y explosiones.');
    const casilla = (et, clave, desc) => this.fila(c, et, this.casilla(aj.gen[clave], v => aj.setGeneral(clave, v)), '', desc);
    casilla('Invertir eje Y', 'invertirY');
    casilla('Mostrar rendimiento (FPS)', 'mostrarFps', `FPS, tiempo de fotograma, llamadas de dibujo y memoria. Atajo: ${nombreTecla(aj.controles.rendimiento)}.`);
    casilla('Ajuste automático de calidad', 'autoCalidad', 'Baja el perfil gráfico si los FPS caen por debajo del objetivo durante la partida.');
    casilla('Sangre y desmembramiento', 'gore', 'Calcas de sangre y decapitaciones por disparo a la cabeza.');
    // estilo visual
    const selE = document.createElement('div'); selE.className = 'selector';
    const opE = [['realista', 'Realista'], ['comic', 'Cómic (2012)']];
    const vE = this.fila(c, 'Estilo visual', selE, '', 'Realista: texturas y sombreado de siempre. Cómic: zombis con sombreado plano por tonos, contornos negros y colores apagados, como un cómic dibujado a tinta.');
    const pintarE = () => { [...selE.children].forEach((b, i) => b.classList.toggle('activo', opE[i][0] === aj.gen.estilo)); vE.textContent = opE.find(o => o[0] === aj.gen.estilo)?.[1] || ''; };
    for (const [v, et] of opE) { const b = document.createElement('button'); b.textContent = et; b.onclick = () => { aj.setGeneral('estilo', v); pintarE(); }; selE.append(b); }
    pintarE();
    // controles táctiles
    const sel = document.createElement('div'); sel.className = 'selector';
    const opciones = [['auto', 'Automático'], ['si', 'Activados'], ['no', 'Desactivados']];
    const vT = this.fila(c, 'Controles táctiles', sel, '', 'Automático: se activan en móviles, tabletas o al tocar la pantalla. Los controles de teclado y ratón siguen funcionando siempre.');
    const pintar = () => { [...sel.children].forEach((b, i) => b.classList.toggle('activo', opciones[i][0] === aj.gen.tactil)); vT.textContent = opciones.find(o => o[0] === aj.gen.tactil)[1]; };
    for (const [v, et] of opciones) { const b = document.createElement('button'); b.textContent = et; b.onclick = () => { aj.setGeneral('tactil', v); pintar(); }; sel.append(b); }
    pintar();
    add('Sensibilidad del control', 'sensMando', 0.2, 3, 0.05, v => v.toFixed(2), 'Velocidad de giro con el stick derecho del control (Xbox, PlayStation o genérico).');
    add('Sensibilidad táctil', 'sensTactil', 0.2, 3, 0.05, v => v.toFixed(2), 'Velocidad de giro al arrastrar el dedo por la pantalla.');
    add('Tamaño de los botones', 'tamBotones', 0.7, 1.5, 0.05, v => Math.round(v * 100) + ' %');
    add('Opacidad de los botones', 'opacidadBotones', 0.25, 1, 0.05, v => Math.round(v * 100) + ' %');
    const bEd = document.createElement('button'); bEd.className = 'boton'; bEd.textContent = 'Personalizar HUD táctil';
    bEd.onclick = () => this.ctx.editorHud.abrir('pantallaAjustes');
    this.fila(c, 'Diseño del HUD táctil', bEd, '', 'Mueve y cambia el tamaño de cada botón y de los bloques de salud, arma, puntuación y oleada. También desde el menú de pausa.');
  }

  construirAudio() {
    const c = $('secAudio'), aj = this.ctx.ajustes; c.innerHTML = '';
    for (const [et, clave] of [['Volumen general', 'volMaestro'], ['Música', 'volMusica'], ['Efectos', 'volEfectos'], ['Ambiente', 'volAmbiente']]) {
      const fmt = v => Math.round(v * 100) + ' %';
      const r = this.rango(0, 1, 0.01, aj.gen[clave], v => aj.setGeneral(clave, v), fmt);
      r._v = this.fila(c, et, r, fmt(aj.gen[clave]));
    }
  }

  construirGraficos() {
    const aj = this.ctx.ajustes;
    const per = $('perfiles'); per.innerHTML = '';
    for (const p of [...ORDEN_PERFILES, 'personalizado']) {
      const b = document.createElement('button');
      b.textContent = NOMBRES_PERFIL[p]; b.dataset.perfil = p;
      if (p === 'personalizado') b.classList.add('personal');
      else b.onclick = () => this.aplicarConAviso(() => aj.aplicarPerfil(p));
      per.append(b);
    }
    const cont = $('opcionesGraficas'); cont.innerHTML = '';
    this.controlesGraficos = {};
    for (const o of OPCIONES_GRAFICAS) {
      let control, valor;
      if (o.tipo === 'rango') {
        control = this.rango(o.min, o.max, o.paso, aj.g[o.clave], v => this.aplicarConAviso(() => aj.setGrafico(o.clave, v)), o.formato);
        valor = this.fila(cont, o.nombre, control, o.formato(aj.g[o.clave]), o.desc);
        control._v = valor;
        control.onchange = control.oninput; control.oninput = () => { valor.textContent = o.formato(+control.value); };
      } else if (o.tipo === 'nivel') {
        control = document.createElement('div'); control.className = 'selector';
        o.etiquetas.forEach((et, i) => {
          const b = document.createElement('button'); b.textContent = i === 0 ? '0' : '●'.repeat(i); b.title = et;
          b.onclick = () => this.aplicarConAviso(() => aj.setGrafico(o.clave, i));
          control.append(b);
        });
        valor = this.fila(cont, o.nombre, control, o.etiquetas[aj.g[o.clave]], o.desc);
      } else {
        control = document.createElement('div'); control.className = 'selector';
        o.valores.forEach((v, i) => {
          const b = document.createElement('button'); b.textContent = o.etiquetas[i];
          b.onclick = () => this.aplicarConAviso(() => aj.setGrafico(o.clave, v));
          control.append(b);
        });
        valor = this.fila(cont, o.nombre, control, '', o.desc);
      }
      this.controlesGraficos[o.clave] = { o, control, valor };
    }
    this.refrescarGraficos();
  }

  /** Muestra "Aplicando…" antes de cambios costosos (regenerar texturas). */
  aplicarConAviso(fn) {
    const i = $('infoGraficos'); i.textContent = 'Aplicando cambios…'; i.classList.add('aviso');
    setTimeout(fn, 30);
  }

  refrescarGraficos() {
    if (!this.controlesGraficos) return;
    const aj = this.ctx.ajustes;
    document.querySelectorAll('#perfiles button').forEach(b => b.classList.toggle('activo', b.dataset.perfil === aj.perfil));
    for (const { o, control, valor } of Object.values(this.controlesGraficos)) {
      const v = aj.g[o.clave];
      if (o.tipo === 'rango') { control.value = v; valor.textContent = o.formato(v); }
      else if (o.tipo === 'nivel') { [...control.children].forEach((b, i) => b.classList.toggle('activo', i === v)); valor.textContent = o.etiquetas[v]; }
      else { [...control.children].forEach((b, i) => b.classList.toggle('activo', o.valores[i] === v)); valor.textContent = o.etiquetas[o.valores.indexOf(v)] ?? ''; }
    }
  }

  construirControles() {
    const c = $('secControles'), aj = this.ctx.ajustes; c.innerHTML = '';
    const p = document.createElement('p'); p.className = 'info';
    p.textContent = 'Haz clic en una acción y pulsa la nueva tecla o botón del ratón. Esc cancela. Pausa / liberar ratón: Esc (fijo).';
    c.append(p);
    // esquema del control (fijo)
    const m = document.createElement('div');
    m.innerHTML = '<h4>Control (Xbox / PlayStation / genérico)</h4><div class="tablaMando">' + [
      ['Stick izq.', 'Moverse · L3: correr'], ['Stick der.', 'Mirar · R3: cuchillo'], ['RT / R2', 'Disparar (o golpear con el arma cuerpo a cuerpo)'],
      ['LT / L2', 'Apuntar'], ['A / ✕', 'Saltar · aceptar en los menús'], ['B / ○', 'Dash de esquive · volver en los menús'], ['Back / Share', 'Bebida energética (+1 carga de dash)'],
      ['X / □', 'Recargar · comprar en la pared'], ['Y / △', 'Cambiar de arma'], ['LB / L1', 'Molotov'], ['RB / R1', 'Granada'],
      ['Cruceta', '↑ botiquín · ↓ chaleco · ← linterna · → arma anterior'], ['Start / Options', 'Pausa'],
    ].map(([b, t]) => `<kbd>${b}</kbd><span>${t}</span>`).join('') + '</div>';
    c.append(m);
    for (const [accion, nombre] of ACCIONES) {
      const b = document.createElement('button'); b.className = 'tecla'; b.textContent = nombreTecla(aj.controles[accion]);
      b.onclick = (e) => {
        e.stopPropagation();
        b.classList.add('esperando'); b.textContent = 'Pulsa una tecla…';
        setTimeout(() => this.ctx.entrada.capturar(cod => { b.classList.remove('esperando'); if (cod) aj.setControl(accion, cod); else b.textContent = nombreTecla(aj.controles[accion]); }), 0);
      };
      this.fila(c, nombre, b, '');
    }
    const r = document.createElement('button'); r.className = 'boton'; r.textContent = 'Restaurar controles';
    r.onclick = () => aj.restaurarControles();
    c.append(r);
  }

  /** Chips de armas en el HUD: solo las que se poseen, con su número de ranura. */
  construirRanuras(inv = {}) {
    $('hRanuras').innerHTML = ORDEN_ARMAS.filter(id => inv[id] || id === 'pistola').map(id => `<span data-arma="${id}">${ARMAS[id].ranura} ${ARMAS[id].corto}</span>`).join('');
  }

  // ------------------------------------------------------------ fin de partida
  mostrarFin(d) {
    $('hud').classList.add('oculto');
    const t = $('finTitulo');
    t.textContent = d.victoria ? 'HAS SOBREVIVIDO' : 'HAS MUERTO';
    t.classList.toggle('victoria', d.victoria);
    $('finSub').textContent = d.victoria ? `El amanecer llega a ${d.mapa}. ${d.modo} completado.` : `${d.mapa} · ${d.modo} · Caíste en la oleada ${d.oleada}.`;
    const mm = Math.floor(d.tiempo / 60), ss = Math.floor(d.tiempo % 60).toString().padStart(2, '0');
    const items = [
      ['Puntuación', d.total.toLocaleString('es'), d.record ? 'record' : ''],
      ['Oleada', d.oleada], ['Bajas', d.bajas], ['Tiros a la cabeza', d.cabezas],
      ['Precisión', d.precision + ' %'], ['Mejor racha', d.racha], ['Tiempo', `${mm}:${ss}`],
      [d.record ? '¡Nuevo récord!' : 'Récord del modo', (d.mejor?.total || d.total).toLocaleString('es'), 'record'],
      ['Monedas ganadas', `+${d.monedas ?? 0} (tienes ${d.cartera ?? 0})`, 'record'],
    ];
    $('finStats').innerHTML = items.map(([k, v, c]) => `<div class="${c || ''}"><span>${k}</span><b>${v}</b></div>`).join('');
    this.mostrar('pantallaFin');
  }

  // ------------------------------------------------------------ HUD
  poner(id, valor) { if (this.cache[id] !== valor) { this.cache[id] = valor; $(id).textContent = valor; } }

  actualizarHUD(dt) {
    const ctx = this.ctx, P = ctx.partida;
    this.temporizadores(dt);
    if (!P.jugando && P.estado !== 'pausa') return;
    const j = ctx.jugador, A = ctx.armas, O = ctx.oleadas, S = ctx.puntuacion;
    this.poner('hOleada', O.n);
    if (O.estado === 'preparacion') { this.poner('hEstadoOleada', 'SIGUIENTE EN'); this.poner('hRestantes', Math.ceil(O.cuenta) + ' s'); }
    else { this.poner('hEstadoOleada', 'ZOMBIS'); this.poner('hRestantes', O.restantes); }
    this.poner('hTotal', S.total.toLocaleString('es'));
    this.poner('hPuntos', S.puntos.toLocaleString('es'));
    this.poner('hRacha', S.racha >= 2 ? `RACHA ×${S.multiplicador.toFixed(1)}` : '');
    const salud = Math.max(0, Math.ceil(j.salud));
    this.poner('hSalud', salud);
    $('hSaludBarra').style.width = salud + '%';
    this.cargasDash(j);
    $('vinetaSangre').style.opacity = Math.max(0, (60 - j.salud) / 60).toFixed(2);
    $('hLinterna').classList.toggle('on', ctx.iluminacion.linternaEncendida);
    this.poner('hBotiquinesN', j.botiquines);
    this.poner('hGranadasN', j.granadas);
    this.poner('hMolotovsN', j.molotovs);
    this.poner('hChalecosN', j.chalecos);
    this.poner('hBebidasN', j.bebidas);
    $('hMolotovs').classList.toggle('vacio', j.molotovs === 0);
    $('hChalecos').classList.toggle('vacio', j.chalecos === 0);
    $('hBebidas').classList.toggle('vacio', j.bebidas === 0);
    const ch = $('hChalecoBarra'); ch.style.width = Math.max(0, j.chaleco).toFixed(0) + '%'; ch.parentElement.classList.toggle('ver', j.chaleco > 0);
    $('hGranadas').classList.toggle('vacio', j.granadas === 0);
    this.poner('hMonedas', ctx.tienda.monedas);
    $('hBotiquines').classList.toggle('vacio', j.botiquines === 0);
    $('mira').classList.toggle('ver', A.miraActiva && j.vivo);
    // arma
    const a = A.actual;
    if (a) {
      this.poner('hArmaNombre', a.def.nombre.toUpperCase());
      const cc = a.def.cuerpo;                       // cuerpo a cuerpo: sin munición
      this.poner('hMunicion', cc ? '∞' : a.municion);
      this.poner('hReserva', cc ? '' : a.reserva);
      document.querySelector('#hudArma .municion').classList.toggle('bajo', !cc && a.municion <= Math.ceil(a.def.cargador * 0.25));
      const rec = $('hRecarga').parentElement;
      if (A.estado === 'recargando') {
        rec.classList.add('ver');
        const p = a.def.tipo === 'bomba' ? a.municion / a.def.cargador : A.t / A.recargaTotal;
        $('hRecarga').style.width = Math.min(100, p * 100) + '%';
      } else rec.classList.remove('ver');
      const ran = ORDEN_ARMAS.map(id => (A.inventario[id] ? 't' : '-') + (a.def.id === id ? 'a' : '')).join();
      if (this.cache.ranuras !== ran) {
        this.cache.ranuras = ran;
        this.construirRanuras(A.inventario);
        document.querySelectorAll('#hRanuras span').forEach(s => { s.classList.toggle('tiene', !!A.inventario[s.dataset.arma]); s.classList.toggle('actual', s.dataset.arma === a.def.id); });
      }
      // retícula dinámica según la dispersión real
      const disp = A.dispersion() * Math.PI / 180;
      const gap = Math.tan(disp) * innerHeight / (2 * Math.tan(ctx.camara.fov * Math.PI / 360)) + 3;
      const ret = $('reticula');
      const oculta = A.adsEase > 0.6 || j.corriendo || !j.vivo || A.ocupadoAccion;
      ret.style.opacity = oculta ? 0 : 1;
      ret.classList.toggle('fijado', false);
      if (!oculta) for (const [cl, tr] of [['a', `translate(0,${-gap - 9}px)`], ['b', `translate(0,${gap}px)`], ['i', `translate(${-gap - 9}px,0)`], ['d', `translate(${gap}px,0)`]])
        ret.querySelector('.' + cl).style.transform = tr;
      // avisos contextuales
      const pr = $('prompt');
      const e = A.estacionCercana;
      const tecla = nombreTecla(ctx.ajustes.controles.interactuar);
      let html = '', caro = false;
      if (e) {
        const info = A.infoEstacion(e);
        caro = !info.lleno && S.puntos < info.precio;
        html = info.lleno ? info.texto : `<kbd>${tecla}</kbd>${info.texto} — ${info.precio} pts${caro ? ' (sin puntos suficientes)' : ''}`;
      } else if (!cc && a.municion === 0 && a.reserva === 0) html = 'Sin munición — recoge cajas que sueltan los zombis, compra en la pared o cambia de arma';
      else if (j.salud < 45 && j.botiquines > 0 && A.botiquinT < 0) html = `<kbd>${nombreTecla(ctx.ajustes.controles.botiquin)}</kbd>Usar botiquín (${j.botiquines})`;
      else if (!cc && a.municion <= Math.ceil(a.def.cargador * 0.2) && a.reserva > 0 && A.estado !== 'recargando') html = `<kbd>${nombreTecla(ctx.ajustes.controles.recargar)}</kbd>Recargar`;
      if (this.cache.prompt !== html) { this.cache.prompt = html; pr.innerHTML = html; }
      pr.classList.toggle('ver', !!html && j.vivo); pr.classList.toggle('caro', caro);
    }
  }

  /** Tres cargas de dash junto a la salud: llenas, la que se recarga (con su progreso) y vacías. */
  cargasDash(j) {
    const max = j.dashCargasMax || 3, p = Math.round(j.dashProgreso * 20) / 20;
    const clave = `${j.dashCargas}|${p}|${j.invulnerable ? 1 : 0}`;
    if (this.cache.dash === clave) return;
    this.cache.dash = clave;
    const cont = $('hDash');
    cont.title = `Cargas de dash (${nombreTecla(this.ctx.ajustes.controles.dash)})`;
    cont.classList.toggle('activo', j.invulnerable);
    [...cont.children].forEach((c, i) => {
      const llena = i < j.dashCargas, recargando = i === j.dashCargas && i < max;
      c.classList.toggle('llena', llena);
      c.style.setProperty('--p', llena ? 1 : recargando ? p : 0);
    });
  }

  temporizadores(dt) {
    if (this.marcaT > 0) { this.marcaT -= dt; $('marcaImpacto').style.opacity = Math.max(0, this.marcaT / 0.18); }
    if (this.danoT > 0) { this.danoT -= dt; $('pantallaDano').style.opacity = Math.max(0, this.danoT); }
    if (this.avisoT > 0) { this.avisoT -= dt; if (this.avisoT <= 0) $('aviso').classList.remove('ver'); }
    if (this.notiT > 0) { this.notiT -= dt; if (this.notiT <= 0) $('notificacion').classList.remove('ver'); }
    for (const el of [...$('indicadoresDano').children]) {
      el._t -= dt; el.style.opacity = Math.max(0, el._t);
      if (el._t <= 0) el.remove();
    }
  }

  marcaImpacto({ cabeza, muerte }) {
    const m = $('marcaImpacto');
    m.className = muerte && cabeza ? 'cabeza' : muerte ? 'muerte' : '';
    this.marcaT = muerte ? 0.28 : 0.18;
    this.ctx.audio.reproducir(muerte ? 'marca_baja' : 'marca', { bus: 'interfaz', vol: muerte ? 0.35 : 0.22, reverb: 0 });
  }

  indicadorDano({ cant, angulo, tipo }) {
    this.danoT = Math.min(0.9, this.danoT + cant / 30);
    if (angulo === null) return;
    const el = document.createElement('div');
    el.className = 'flecha' + (tipo === 'acido' || tipo === 'escupitajo' ? ' acido' : '');
    el.style.transform = `rotate(${angulo}rad)`; el._t = 1.2;
    $('indicadoresDano').append(el);
    while ($('indicadoresDano').children.length > 6) $('indicadoresDano').firstChild.remove();
  }

  popupPuntos({ cant, motivo, mult, texto, clase }) {
    const d = document.createElement('div');
    d.className = clase || (cant < 0 ? 'negativo' : '');
    d.innerHTML = texto || (cant < 0 ? `${cant} compra` : `+${cant} ${motivo}${mult > 1.01 ? ` <em>×${mult.toFixed(1)}</em>` : ''}`);
    $('popups').prepend(d);
    setTimeout(() => d.remove(), 1300);
    while ($('popups').children.length > 6) $('popups').lastChild.remove();
  }

  aviso(titulo, sub, seg, clase = '') {
    const a = $('aviso');
    a.className = clase; a.innerHTML = `<b>${titulo}</b><span>${sub}</span>`;
    void a.offsetWidth; a.classList.add('ver');
    this.avisoT = seg;
  }

  notificar(texto) { const n = $('notificacion'); n.textContent = texto; n.classList.add('ver'); this.notiT = 3; }
}
