/**
 * Entrada de teclado y ratón con Pointer Lock, más una capa "virtual" que
 * alimentan los controles táctiles (motor/Tactil.js): acciones pulsadas desde
 * botones en pantalla, un eje analógico de movimiento y giro de cámara por arrastre.
 * Las acciones de teclado/ratón se resuelven a través de ajustes.controles (reasignables);
 * ambas capas conviven, así que los controles de PC siguen funcionando igual.
 * El control (mando) también usa la capa virtual (motor/Mando.js).
 */
export class Entrada {
  constructor(lienzo, ajustes, eventos) {
    this.lienzo = lienzo;
    this.ajustes = ajustes;
    this.eventos = eventos;
    this.activos = new Set();      // códigos pulsados ahora
    this.flancos = new Set();      // códigos pulsados este fotograma
    this.dx = 0; this.dy = 0; this.rueda = 0;
    this.bloqueado = false;
    this.captura = null;           // callback para reasignar controles
    this.virtuales = new Set();    // acciones mantenidas desde la pantalla táctil
    this.flancosVirt = new Set();  // acciones táctiles pulsadas este fotograma
    this.eje = { x: 0, z: 0, activo: false };   // joystick virtual (x: derecha, z: atrás)
    this.ejeMando = { x: 0, z: 0, activo: false };   // stick izquierdo del control (motor/Mando.js)
    this.mandoActivo = false;
    this.alUsarPC = null;          // aviso a Mando.js: se ha tocado el teclado o el ratón
    this.faseBloqueo = null;       // 'crudo' | 'simple' mientras se pide capturar el ratón
    this.ruedaAcum = 0; this.ruedaT = 0; this.ruedaUlt = 0;
    this.movAcum = 0; this.movT = 0;   // movimiento de ratón reciente (para distinguir uso real de temblores)

    window.addEventListener('keydown', e => {
      if (this.captura) { e.preventDefault(); this.terminarCaptura(e.code); return; }
      if (this.bloqueado && !['F5', 'F11', 'F12'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.flancos.add(e.code);
      this.activos.add(e.code);
      this.alUsarPC?.();
    });
    window.addEventListener('keyup', e => this.activos.delete(e.code));
    window.addEventListener('blur', () => this.activos.clear());
    lienzo.addEventListener('mousedown', e => {
      if (this.captura) { e.preventDefault(); this.terminarCaptura('Mouse' + e.button); return; }
      // sin el ratón capturado, el clic solo sirve para capturarlo (no dispara ni apunta)
      if (!this.bloqueado) return;
      const c = 'Mouse' + e.button; this.activos.add(c); this.flancos.add(c);
      this.alUsarPC?.();
    });
    window.addEventListener('mouseup', e => this.activos.delete('Mouse' + e.button));
    window.addEventListener('mousedown', e => {
      if (this.captura && e.target !== lienzo) { e.preventDefault(); this.terminarCaptura('Mouse' + e.button); }
    }, true);
    lienzo.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('mousemove', e => {
      if (!this.bloqueado) return;
      // filtra picos espurios que algunos navegadores envían al bloquear
      if (Math.abs(e.movementX) > 600 || Math.abs(e.movementY) > 600) return;
      this.dx += e.movementX; this.dy += e.movementY;
      // solo cuenta como "usar el ratón" un movimiento claro (~30 px en un cuarto de segundo)
      const ahora = performance.now();
      if (ahora - this.movT > 250) this.movAcum = 0;
      this.movT = ahora; this.movAcum += Math.abs(e.movementX) + Math.abs(e.movementY);
      if (this.movAcum > 30) { this.movAcum = 0; this.alUsarPC?.(); }
    });
    // rueda: un paso por "muesca". Los touchpads mandan muchos eventos pequeños, así que se
    // acumulan hasta ~una muesca y se deja un respiro entre cambios para no saltarse armas.
    window.addEventListener('wheel', e => {
      if (!this.bloqueado) return;
      const ahora = performance.now();
      if (ahora - this.ruedaUlt > 400) this.ruedaAcum = 0;          // gesto nuevo
      this.ruedaUlt = ahora;
      this.ruedaAcum += e.deltaMode === 0 ? e.deltaY : Math.sign(e.deltaY) * 100;
      if (Math.abs(this.ruedaAcum) >= 50 && ahora - this.ruedaT > 120) {
        this.rueda += Math.sign(this.ruedaAcum); this.ruedaAcum = 0; this.ruedaT = ahora;
      }
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const antes = this.bloqueado;
      this.faseBloqueo = null;
      this.bloqueado = document.pointerLockElement === lienzo;
      if (!this.bloqueado) this.activos.clear();
      if (antes !== this.bloqueado) eventos.emit(this.bloqueado ? 'entrada:bloqueado' : 'entrada:liberado');
    });
    // Primero se pide el ratón "en crudo" (sin aceleración del sistema). Si el navegador no lo
    // admite (p. ej. Chrome en Linux) se reintenta en modo normal. Solo se avisa del error
    // cuando también falla el modo normal: antes salía "no se pudo capturar el ratón" aunque sí se capturaba.
    document.addEventListener('pointerlockerror', () => {
      if (this.faseBloqueo === 'crudo') { this.faseBloqueo = 'simple'; this.pedir(false); return; }
      this.faseBloqueo = null;
      if (!this.bloqueado) eventos.emit('entrada:errorBloqueo');
    });
  }

  /** Solicita el bloqueo del puntero (con movimiento sin aceleración si se puede). */
  bloquear() {
    if (this.bloqueado || (this.faseBloqueo && performance.now() - this.bloqueoT < 1500)) return;
    this.faseBloqueo = 'crudo'; this.bloqueoT = performance.now();
    this.pedir(true);
  }
  pedir(crudo) {
    try {
      const p = crudo ? this.lienzo.requestPointerLock({ unadjustedMovement: true }) : this.lienzo.requestPointerLock();
      p?.catch?.(() => { /* el resultado llega por pointerlockchange / pointerlockerror */ });
    } catch (e) {
      if (crudo) { this.faseBloqueo = 'simple'; this.pedir(false); }
      else { this.faseBloqueo = null; this.eventos.emit('entrada:errorBloqueo'); }
    }
  }
  liberar() { if (document.pointerLockElement) document.exitPointerLock(); }

  codigo(accion) { return this.ajustes.controles[accion]; }
  activo(accion) { return this.activos.has(this.codigo(accion)) || this.virtuales.has(accion); }
  pulsado(accion) { return this.flancos.has(this.codigo(accion)) || this.flancosVirt.has(accion); }

  // --- capa táctil ---
  pulsarVirtual(accion) { if (!this.virtuales.has(accion)) this.flancosVirt.add(accion); this.virtuales.add(accion); }
  soltarVirtual(accion) { this.virtuales.delete(accion); }
  tocarVirtual(accion) { this.flancosVirt.add(accion); }          // pulsación instantánea
  mirarTactil(dx, dy) { this.dx += dx; this.dy += dy; }
  /** Suelta todo lo mantenido (al pausar o salir: evita teclas "pegadas"). */
  soltarTodo() { this.activos.clear(); this.virtuales.clear(); this.eje.x = this.eje.z = 0; this.eje.activo = false; this.ejeMando.x = this.ejeMando.z = 0; this.ejeMando.activo = false; }
  teclaPulsada(code) { return this.flancos.has(code); }

  /** Movimiento del ratón acumulado desde el último fotograma. */
  consumirRaton() {
    const r = { dx: this.dx, dy: this.dy, rueda: this.rueda };
    this.dx = this.dy = this.rueda = 0;
    return r;
  }

  finFotograma() { this.flancos.clear(); this.flancosVirt.clear(); }

  /** Espera la siguiente tecla/botón para reasignar un control. */
  capturar(cb) { this.captura = cb; }
  terminarCaptura(codigo) {
    const cb = this.captura; this.captura = null;
    if (codigo !== 'Escape') cb(codigo); else cb(null);
  }
}

/** Nombre legible de un código de tecla. */
export function nombreTecla(code) {
  if (!code) return '—';
  const especiales = {
    Mouse0: 'Clic izq.', Mouse1: 'Clic central', Mouse2: 'Clic der.', Mouse3: 'Ratón 4', Mouse4: 'Ratón 5',
    Space: 'Espacio', ShiftLeft: 'Mayús izq.', ShiftRight: 'Mayús der.', ControlLeft: 'Ctrl izq.', ControlRight: 'Ctrl der.',
    AltLeft: 'Alt', AltRight: 'Alt Gr', Tab: 'Tab', Enter: 'Intro', Backspace: 'Retroceso', CapsLock: 'Bloq Mayús',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  };
  if (especiales[code]) return especiales[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
