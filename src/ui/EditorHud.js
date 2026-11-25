/**
 * Editor del HUD para pantallas táctiles.
 *
 * Permite arrastrar cada botón táctil y cada bloque del HUD (salud, arma, puntuación,
 * oleada) a donde quieras, cambiar su tamaño individualmente, restablecer el diseño
 * por defecto y guardarlo. Las posiciones se guardan en porcentaje de la pantalla
 * (centro del elemento), así el diseño se adapta a cualquier resolución.
 * El diseño se guarda en ajustes.gen.disenoHud y solo se aplica en modo táctil.
 */
const $ = id => document.getElementById(id);

/** Elementos editables: selector, nombre visible y escala base que ya tienen en modo táctil. */
const EDITABLES = [
  ['#tactil .tb.disparo', 'Disparar', 1], ['#tactil .tb.disparo2', 'Disparar (izq.)', 1],
  ['#tactil .tb.apuntar', 'Apuntar', 1], ['#tactil .tb.recargar', 'Recargar', 1],
  ['#tactil .tb.saltar', 'Saltar', 1], ['#tactil .tb.cuchillo', 'Cuchillo', 1],
  ['#tactil .tb.cambiar', 'Cambiar arma', 1], ['#tactil .tb.botiquin', 'Botiquín', 1], ['#tactil .tb.granada', 'Granada', 1],
  ['#tactil .tb.molotov', 'Molotov', 1], ['#tactil .tb.chaleco', 'Chaleco', 1], ['#tactil .tb.bebida', 'Bebida energética', 1], ['#tactil .tb.dash', 'Dash', 1],
  ['#tactil .tb.linterna', 'Linterna', 1], ['#tactil .tb.comprar', 'Comprar', 1],
  ['#tactil .tb.pausa', 'Pausa', 1],
  ['#hudSalud', 'Salud', 0.8], ['#hudArma', 'Arma y munición', 0.56],
  ['#hudPuntos', 'Puntuación', 0.72], ['#hudSup', 'Oleada', 0.72],
].map(([sel, nombre, base]) => ({ sel, nombre, base, id: sel.replace(/[#. ]+/g, '_') }));

export class EditorHud {
  constructor(ctx) {
    this.ctx = ctx;
    this.activo = false;
    this.barra = $('editorHud');
    this.sel = null;
    this.rango = $('edTam');
    this.rango.oninput = () => { if (!this.sel) return; this.borrador[this.sel.id] = { ...this.pos(this.sel), s: +this.rango.value }; this.aplicarUno(this.sel, this.borrador[this.sel.id]); this.etiqueta(); };
    $('edRestablecer').onclick = () => { this.borrador = {}; for (const e of EDITABLES) this.limpiarUno(e); this.seleccionar(null); };
    $('edListo').onclick = () => this.cerrar(true);
    $('edMoverBarra').onclick = () => this.barra.classList.toggle('abajo');
    $('edCancelar').onclick = () => this.cerrar(false);
    for (const e of EDITABLES) {
      const el = document.querySelector(e.sel);
      e.el = el;
      el.addEventListener('pointerdown', ev => this.inicio(ev, e), true);
    }
    window.addEventListener('pointermove', ev => this.mover(ev));
    window.addEventListener('pointerup', () => { this.arrastre = null; });
    window.addEventListener('pointercancel', () => { this.arrastre = null; });
    window.addEventListener('resize', () => this.aplicar());
    ctx.eventos.on('tactil:cambio', () => this.aplicar());
    this.aplicar();
  }

  get diseno() { return this.ctx.ajustes.gen.disenoHud || {}; }

  /** Aplica el diseño guardado (solo en modo táctil; con ratón se usa el HUD normal). */
  aplicar() {
    const d = this.activo ? this.borrador : this.diseno, tactil = this.ctx.tactil?.activo;
    for (const e of EDITABLES) { if (tactil && d[e.id]) this.aplicarUno(e, d[e.id]); else this.limpiarUno(e); }
  }

  aplicarUno(e, p) {
    const st = e.el.style;
    st.left = (p.x * 100).toFixed(2) + '%'; st.top = (p.y * 100).toFixed(2) + '%';
    st.right = 'auto'; st.bottom = 'auto';
    st.transformOrigin = 'center center';
    st.transform = `translate(-50%, -50%) scale(${(e.base * (p.s ?? 1)).toFixed(3)})`;
  }

  limpiarUno(e) { for (const k of ['left', 'top', 'right', 'bottom', 'transform', 'transformOrigin']) e.el.style[k] = ''; }

  /** Posición actual (centro en fracción de pantalla) y escala de un elemento. */
  pos(e) {
    const guardado = (this.activo ? this.borrador : this.diseno)[e.id];
    if (guardado) return { ...guardado };
    const r = e.el.getBoundingClientRect();
    return { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight, s: 1 };
  }

  // --------------------------------------------------------------- edición
  /** origen: pantalla a la que volver al terminar (menú de pausa o configuración). */
  abrir(origen) {
    if (!this.ctx.tactil.activo) this.ctx.ajustes.setGeneral('tactil', 'si');
    this.origen = origen;
    this.activo = true;
    this.borrador = JSON.parse(JSON.stringify(this.diseno));
    document.body.classList.add('editandoHud');
    this.ctx.interfaz.mostrar(null);
    $('hud').classList.remove('oculto');
    const comprar = this.ctx.tactil.btn('interactuar');
    comprar.classList.remove('oculto'); comprar.innerHTML = 'COMPRAR'; comprar._t = null;
    this.aplicar();
    this.seleccionar(null);
  }

  cerrar(guardar) {
    if (guardar) this.ctx.ajustes.setGeneral('disenoHud', this.borrador);
    this.activo = false;
    document.body.classList.remove('editandoHud');
    this.seleccionar(null);
    this.aplicar();
    const I = this.ctx.interfaz;
    if (this.origen === 'menuPausa') I.mostrarPausa();
    else { I.mostrar(this.origen || 'menuPrincipal'); if ((this.origen || 'menuPrincipal') === 'menuPrincipal') I.mostrarMenu(); }
    if (guardar) I.notificar?.('Diseño del HUD guardado');
  }

  seleccionar(e) {
    for (const x of EDITABLES) x.el.classList.toggle('editSel', x === e);
    this.sel = e;
    this.rango.disabled = !e;
    if (e) this.rango.value = this.pos(e).s ?? 1;
    this.etiqueta();
  }

  etiqueta() {
    $('edNombre').textContent = this.sel ? `${this.sel.nombre} · ${Math.round((+this.rango.value) * 100)} %` : 'Arrastra un elemento para moverlo · tócalo para cambiar su tamaño';
  }

  inicio(ev, e) {
    if (!this.activo) return;
    ev.preventDefault(); ev.stopPropagation();
    try { e.el.setPointerCapture(ev.pointerId); } catch (err) { /* ignorado */ }
    const p = this.pos(e);
    this.borrador[e.id] = p;
    this.aplicarUno(e, p);
    this.seleccionar(e);
    this.arrastre = { e, dx: ev.clientX - p.x * innerWidth, dy: ev.clientY - p.y * innerHeight };
  }

  mover(ev) {
    const a = this.arrastre;
    if (!this.activo || !a) return;
    ev.preventDefault();
    const p = this.borrador[a.e.id];
    p.x = Math.min(0.98, Math.max(0.02, (ev.clientX - a.dx) / innerWidth));
    p.y = Math.min(0.98, Math.max(0.02, (ev.clientY - a.dy) / innerHeight));
    this.aplicarUno(a.e, p);
  }
}
