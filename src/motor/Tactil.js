/**
 * Controles táctiles para móviles y tabletas (se suman a los de PC, no los sustituyen).
 *
 * - Joystick flotante en la mitad izquierda: aparece donde apoyas el pulgar.
 *   Empujarlo a fondo hacia delante hace correr.
 * - Arrastrar en la mitad derecha gira la cámara (con su propia sensibilidad).
 * - El botón de disparo también permite apuntar arrastrando sin levantar el dedo,
 *   y hay un segundo botón de disparo a la izquierda para disparar mientras te mueves.
 * - Botones: apuntar (alterna), recargar, saltar, cuchillo, cambiar arma, comprar
 *   (solo aparece junto a una estación), botiquín, granada, molotov, chaleco, bebida
 *   energética (con contador), dash de esquive ⇥ (con sus cargas), linterna y pausa.
 *
 * Se activa sola en pantallas táctiles (o al primer toque), o se fuerza en
 * Configuración › General › Controles táctiles. Todo pasa por la capa virtual de
 * Entrada, así que la lógica del juego no distingue ratón de pantalla.
 */
const ACCION_MANTENER = new Set(['disparar']);

export class Tactil {
  constructor(ctx) {
    this.ctx = ctx;
    this.raiz = document.getElementById('tactil');
    this.stick = document.getElementById('tStick');
    this.pomo = this.stick.querySelector('i');
    this.dedos = new Map();            // pointerId → { rol, x, y, x0, y0, accion }
    this.activo = false;
    const g = ctx.ajustes.gen;
    this.grueso = matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
    this.decidir(g.tactil);
    ctx.eventos.on('ajustes:generales', ({ clave, valor }) => {
      if (clave === 'tactil') this.decidir(valor);
      if (clave === 'tamBotones' || clave === 'opacidadBotones') this.aplicarEstilo();
    });
    // en modo automático, el primer toque real activa los controles táctiles
    window.addEventListener('touchstart', () => { if (this.ctx.ajustes.gen.tactil === 'auto' && !this.activo) this.setActivo(true); }, { passive: true });

    const zonaMover = document.getElementById('tZonaMover'), zonaMirar = document.getElementById('tZonaMirar');
    zonaMover.addEventListener('pointerdown', e => this.inicio(e, 'mover'));
    zonaMirar.addEventListener('pointerdown', e => this.inicio(e, 'mirar'));
    for (const b of this.raiz.querySelectorAll('[data-t]')) b.addEventListener('pointerdown', e => this.inicio(e, 'boton', b.dataset.t, b));
    window.addEventListener('pointermove', e => this.mover(e), { passive: false });
    window.addEventListener('pointerup', e => this.fin(e));
    window.addEventListener('pointercancel', e => this.fin(e));
    this.raiz.addEventListener('contextmenu', e => e.preventDefault());
    this.btn = id => this.raiz.querySelector(`[data-t="${id}"]`);
    this.aplicarEstilo();
  }

  decidir(modo) { this.setActivo(modo === 'si' || (modo === 'auto' && this.grueso)); }

  setActivo(v) {
    this.activo = v;
    document.body.classList.toggle('modoTactil', v);
    if (v) this.ctx.entrada.liberar?.();
    this.soltarTodo();
    this.ctx.eventos.emit('tactil:cambio', v);
  }

  aplicarEstilo() {
    const g = this.ctx.ajustes.gen;
    this.raiz.style.setProperty('--tam', g.tamBotones);
    this.raiz.style.setProperty('--opa', g.opacidadBotones);
  }

  get enJuego() { return this.activo && this.ctx.partida?.estado === 'jugando'; }

  inicio(e, rol, accion, el) {
    if (!this.enJuego || e.pointerType === 'mouse') return;
    e.preventDefault();
    try { e.target.setPointerCapture?.(e.pointerId); } catch (err) { /* ignorado */ }
    const d = { rol, accion, el, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY };
    this.dedos.set(e.pointerId, d);
    const E = this.ctx.entrada;
    if (rol === 'mover') {
      // el joystick aparece donde se apoya el pulgar
      this.stick.style.left = e.clientX + 'px'; this.stick.style.top = e.clientY + 'px';
      this.stick.classList.add('ver'); this.pomo.style.transform = '';
    } else if (rol === 'boton') {
      el.classList.add('pulsado');
      if (accion === 'pausa') { this.ctx.partida.pausar(); return; }
      if (ACCION_MANTENER.has(accion)) E.pulsarVirtual(accion);
      else E.tocarVirtual(accion);
      if (navigator.vibrate && accion !== 'disparar') navigator.vibrate(8);
    }
  }

  mover(e) {
    const d = this.dedos.get(e.pointerId);
    if (!d) return;
    e.preventDefault();
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    d.x = e.clientX; d.y = e.clientY;
    const E = this.ctx.entrada, g = this.ctx.ajustes.gen;
    if (d.rol === 'mover') {
      const R = 58 * g.tamBotones;
      let ox = d.x - d.x0, oy = d.y - d.y0;
      const L = Math.hypot(ox, oy);
      if (L > R) { ox *= R / L; oy *= R / L; }
      this.pomo.style.transform = `translate(${ox}px, ${oy}px)`;
      const zona = 0.12;                       // zona muerta
      const mag = Math.min(1, L / R);
      const efectivo = mag < zona ? 0 : (mag - zona) / (1 - zona);
      const largo = Math.min(L, R) || 1;       // (ox, oy) ya está recortado al radio
      E.eje.x = ox / largo * efectivo;
      E.eje.z = oy / largo * efectivo;
      E.eje.activo = true;
      // correr: joystick casi a fondo hacia delante o hacia atrás
      if (mag > 0.93 && Math.abs(oy) > R * 0.7) E.pulsarVirtual('correr'); else E.soltarVirtual('correr');
    } else if (d.rol === 'mirar' || (d.rol === 'boton' && d.accion === 'disparar')) {
      // giro de cámara: ~180° por cada ancho de pantalla con sensibilidad 1
      const k = 2.0 * g.sensTactil * (1100 / Math.max(600, innerWidth));
      E.mirarTactil(dx * k, dy * k);
    }
  }

  fin(e) {
    const d = this.dedos.get(e.pointerId);
    if (!d) return;
    this.dedos.delete(e.pointerId);
    const E = this.ctx.entrada;
    if (d.rol === 'mover') {
      E.eje.x = E.eje.z = 0; E.eje.activo = false; E.soltarVirtual('correr');
      this.stick.classList.remove('ver');
    } else if (d.rol === 'boton') {
      d.el.classList.remove('pulsado');
      if (ACCION_MANTENER.has(d.accion) && ![...this.dedos.values()].some(o => o.accion === d.accion)) E.soltarVirtual(d.accion);
    }
  }

  soltarTodo() {
    this.dedos.clear();
    this.ctx.entrada.soltarTodo();
    this.stick?.classList.remove('ver');
    this.raiz?.querySelectorAll('.pulsado').forEach(b => b.classList.remove('pulsado'));
  }

  /** Estado contextual de los botones (comprar, botiquines, apuntado, linterna). */
  actualizar() {
    if (!this.activo || this.ctx.editorHud?.activo) return;
    if (this.ctx.partida.estado !== 'jugando' && this.dedos.size) this.soltarTodo();
    const A = this.ctx.armas, j = this.ctx.jugador;
    const e = A.estacionCercana;
    const comprar = this.btn('interactuar');
    const textoC = e ? `${e.tipo === 'botiquin' ? 'BOTIQUÍN' : 'COMPRAR'}<small>${A.infoEstacion(e).precio}</small>` : '';
    if (comprar._t !== textoC) { comprar._t = textoC; comprar.innerHTML = textoC; }
    comprar.classList.toggle('oculto', !e);
    const bot = this.btn('botiquin');
    const textoB = `+<small>${j.botiquines}</small>`;
    if (bot._t !== textoB) { bot._t = textoB; bot.innerHTML = textoB; }
    bot.classList.toggle('vacio', j.botiquines === 0);
    const gra = this.btn('granada');
    const textoG = `●<small>${j.granadas}</small>`;
    if (gra._t !== textoG) { gra._t = textoG; gra.innerHTML = textoG; }
    gra.classList.toggle('vacio', j.granadas === 0);
    for (const [id, ico, n, vacio] of [['molotov', '✸', j.molotovs, j.molotovs === 0], ['chaleco', '◈', j.chalecos, j.chalecos === 0], ['bebida', '⚡', j.bebidas, j.bebidas === 0], ['dash', '⇥', j.dashCargas, j.dashCargas === 0]]) {
      const b = this.btn(id), t = `${ico}<small>${n}</small>`;
      if (b._t !== t) { b._t = t; b.innerHTML = t; }
      b.classList.toggle('vacio', vacio);
    }
    this.btn('dash').classList.toggle('activo', j.invulnerable);
    this.btn('apuntarAlternar').classList.toggle('activo', A.apuntarAlternado);
    this.btn('linterna').classList.toggle('activo', this.ctx.iluminacion.linternaEncendida);
    this.raiz.classList.toggle('corriendo', j.corriendo);
  }
}
