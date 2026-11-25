/**
 * Control (mando) con la Gamepad API: Xbox, PlayStation, genéricos USB/Bluetooth
 * y mandos de celular (los que el navegador reconoce con el "mapeo estándar").
 *
 * Todo pasa por la capa virtual de Entrada (la misma que usan los controles
 * táctiles), así que la lógica del juego no distingue teclado, pantalla o mando
 * y los tres pueden usarse a la vez.
 *
 * En partida                          En los menús
 *  Stick izq.  moverse                 Cruceta / stick izq.  elegir opción
 *  L3          correr (alterna)        A  aceptar
 *  Stick der.  mirar                   B  volver
 *  LT / RT     apuntar / disparar      Start  continuar (en pausa)
 *  A saltar · B dash de esquive · X recargar / comprar · Y cambiar arma
 *  LB molotov · RB granada · R3 cuchillo · Back/View (Share) bebida energética
 *  Cruceta: ↑ botiquín · ↓ chaleco · ← linterna · → arma anterior
 *  Start: pausa
 */
const BOTONES = {
  0: ['saltar'], 1: ['dash'], 2: ['recargar', 'interactuar'], 3: ['armaSiguiente'],
  4: ['molotov'], 5: ['granada'], 6: ['apuntar'], 7: ['disparar'], 8: ['bebida'], 11: ['cuchillo'],
  12: ['botiquin'], 13: ['chaleco'], 14: ['linterna'], 15: ['armaAnterior'],
};
const ZONA_MUERTA = 0.16;
const GIRO = 1500;           // "píxeles de ratón" por segundo con el stick derecho a fondo (≈ 3 rad/s)

/** Aplica zona muerta radial y curva de respuesta (más precisión cerca del centro). */
function stick(x, y, curva = 1) {
  const m = Math.hypot(x, y);
  if (m < ZONA_MUERTA) return [0, 0, 0];
  const k = Math.min(1, (m - ZONA_MUERTA) / (1 - ZONA_MUERTA));
  const f = Math.pow(k, curva) / m;
  return [x * f, y * f, k];
}

/**
 * Control de Xbox sin mapeo estándar (Firefox en Linux): botones A B X Y LB RB Back Start Guía L3 R3,
 * ejes LX LY LT RX RY RT y cruceta en los ejes 6-7. Se traduce a la distribución estándar que usa el juego.
 * Cualquier otro dispositivo se devuelve tal cual.
 */
function normalizar(g, reposo = []) {
  if (g.mapping === 'standard' || !/xbox|x-box|xinput|045e/i.test(g.id) || g.axes.length < 6 || g.buttons.length < 11) return g;
  const B = i => g.buttons[i] || { pressed: false, value: 0 };
  // gatillos: de su reposo (-1, o 0 si aún no se han tocado) a 1
  const gatillo = i => { const r = reposo[i] || 0, v = Math.max(0, Math.min(1, (g.axes[i] - r) / (1 - r))); return { pressed: v > 0.5, value: v }; };
  const cruz = (i, signo) => ({ pressed: (g.axes[i] || 0) * signo > 0.5, value: (g.axes[i] || 0) * signo > 0.5 ? 1 : 0 });
  return {
    id: g.id, index: g.index, connected: true, mapping: 'standard', normalizado: true, vibrationActuator: g.vibrationActuator,
    buttons: [B(0), B(1), B(2), B(3), B(4), B(5), gatillo(2), gatillo(5), B(6), B(7), B(9), B(10),
      cruz(7, -1), cruz(7, 1), cruz(6, -1), cruz(6, 1), B(8)],
    axes: [g.axes[0], g.axes[1], g.axes[3], g.axes[4]].map((v, k) => v - ([0, 1, 3, 4].map(i => reposo[i] || 0)[k] || 0)),
  };
}

export class Mando {
  constructor(ctx) {
    this.ctx = ctx;
    this.indice = null;          // índice del mando en uso
    this.antes = [];             // estado anterior de los botones
    this.activo = false;         // se ha usado el mando en esta sesión
    this.corriendo = false;
    this.repetir = 0;            // temporizador de repetición al navegar menús
    this.dirAntes = '';
    this.ignorarPulsados = false; // tras volver al teclado, lo que siga pulsado no reactiva el control
    this.reposo = new Map();
    this.previos = new Map();    // índice → botones del fotograma anterior (para detectar pulsaciones nuevas)     // índice → ejes en reposo (algunos dispositivos no descansan en 0)
    // Muchos equipos exponen como "gamepad" cosas que no lo son (acelerómetros, receptores,
    // mandos virtuales de Steam…). Por eso conectarse no basta: el control solo se usa
    // cuando se pulsa uno de sus botones.
    addEventListener('gamepadconnected', e => {
      if (e.gamepad.mapping === 'standard') ctx.interfaz?.notificar('Control detectado · pulsa un botón para usarlo');
    });
    // Al usar el teclado o el ratón, el control deja de mandar (vuelve con un botón), pero solo si
    // lleva un rato quieto: Steam (y otros programas) hacen que el control también mueva el ratón y
    // pulse teclas, y eso no debe quitarle el mando mientras juegas con él.
    this.usoT = 0;
    ctx.entrada.alUsarPC = () => { if (this.activo && performance.now() - this.usoT > 1500) this.desactivar(); };
    addEventListener('gamepaddisconnected', e => {
      if (e.gamepad.index !== this.indice) return;
      this.indice = null; this.soltar();
      ctx.interfaz?.notificar('Control desconectado');
      if (ctx.partida.estado === 'jugando') ctx.partida.pausar();
    });
    // vibración al recibir daño
    ctx.eventos.on('jugador:dano', ({ cant }) => this.vibrar(Math.min(1, 0.25 + cant / 40), 140));
  }

  leer() {
    const lista = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const g of lista) {
      if (!g || !g.connected) continue;
      // Reposo de los ejes: con mapeo estándar los sticks descansan en 0 por definición, así que no se usa
      // (antes se tomaba en el primer instante y, si Chrome mostraba el control al mover un stick, esa
      // inclinación quedaba como "centro" y hacia ese lado casi no se giraba). En dispositivos sin mapeo
      // estándar se vuelve a medir mientras el control no se está usando.
      if (g.mapping === 'standard') this.reposo.delete(g.index);
      else if (!(this.activo && g.index === this.indice) || !this.reposo.has(g.index)) this.reposo.set(g.index, g.axes.map(v => (Math.abs(v) > 0.25 ? v : 0)));
      const ahora = g.buttons.map(b => !!b && (b.pressed || b.value > 0.35));
      const antes = this.previos.get(g.index);
      // se adopta el dispositivo en el que se pulsa un botón (un botón que ya estaba pulsado no cuenta)
      if (this.indice === null && antes && ahora.some((v, i) => v && !antes[i])) { this.indice = g.index; this.antes = antes; }
      this.previos.set(g.index, ahora);
    }
    if (this.indice !== null && lista[this.indice]?.connected) return normalizar(lista[this.indice], this.reposo.get(this.indice));
    return null;
  }

  /** Ejes medidos desde su posición de reposo (un eje que descansa en -1 o inclinado no cuenta como movimiento). */
  ejes(g) {
    if (g.normalizado) return g.axes;               // ya vienen medidos desde el reposo
    const r = this.reposo.get(g.index) || [];
    return g.axes.map((v, i) => v - (r[i] || 0));
  }

  /** Vuelve al teclado y ratón: suelta todo lo que mantenía el control. */
  desactivar() {
    this.activo = false;
    this.ctx.entrada.mandoActivo = false;
    document.body.classList.remove('modoMando');
    document.querySelectorAll('.focoMando').forEach(e => e.classList.remove('focoMando'));
    this.soltar();
    this.ignorarPulsados = true;
  }

  vibrar(fuerza, ms) {
    if (!this.activo) return;
    const g = this.leer();
    g?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: fuerza, weakMagnitude: fuerza * 0.6 }).catch?.(() => {});
  }

  soltar() {
    const E = this.ctx.entrada;
    for (const acciones of Object.values(BOTONES)) for (const a of acciones) E.soltarVirtual(a);
    E.soltarVirtual('correr');
    E.ejeMando.x = E.ejeMando.z = 0; E.ejeMando.activo = false;
    this.corriendo = false; this.antes = [];
  }

  marcarUso() {
    if (this.activo) return;
    this.activo = true;
    this.ctx.entrada.mandoActivo = true;
    document.body.classList.add('modoMando');
    // con mando no hacen falta los botones en pantalla (vuelven al tocar la pantalla)
    if (this.ctx.ajustes.gen.tactil === 'auto' && this.ctx.tactil.activo) this.ctx.tactil.setActivo(false);
  }

  actualizar(dt) {
    const g = this.leer();
    if (!g) return;
    const pulsado = i => { const b = g.buttons[i]; return !!b && (b.pressed || b.value > 0.35); };
    const ahora = g.buttons.map((_, i) => pulsado(i));
    if (this.ignorarPulsados) { this.ignorarPulsados = false; this.antes = ahora; return; }
    const flanco = i => ahora[i] && !this.antes[i];
    const ejes = this.ejes(g);
    if (ahora.some(Boolean) || ejes.some(v => Math.abs(v) > ZONA_MUERTA)) this.usoT = performance.now();
    // se activa al pulsar un botón (no al pulsarlo mientras ya estaba pulsado al desactivarse)
    if (!this.activo && ahora.some((v, i) => v && !this.antes[i])) this.marcarUso();
    if (!this.activo) { this.antes = ahora; return; }

    const P = this.ctx.partida, I = this.ctx.interfaz;
    const enJuego = P.estado === 'jugando' && !I.visible() && !this.ctx.editorHud?.activo;
    if (enJuego) this.juego(g, ahora, flanco, dt, ejes);
    else { if (this.antes.length && (this.ctx.entrada.ejeMando.activo || this.corriendo)) this.soltar(); this.menu(ahora, flanco, ejes, dt); }
    this.antes = ahora;
  }

  juego(g, ahora, flanco, dt, ejes) {
    const E = this.ctx.entrada, aj = this.ctx.ajustes.gen;
    // botones → acciones (pulsar al bajar, soltar al subir)
    for (const [i, acciones] of Object.entries(BOTONES)) {
      if (ahora[i] && !this.antes[i]) for (const a of acciones) E.pulsarVirtual(a);
      else if (!ahora[i] && this.antes[i]) for (const a of acciones) E.soltarVirtual(a);
    }
    if (flanco(9)) { this.soltar(); this.ctx.partida.pausar(); return; }
    // stick izquierdo: movimiento analógico (z positivo = atrás)
    const [mx, mz, m] = stick(ejes[0] || 0, ejes[1] || 0);
    E.ejeMando.x = mx; E.ejeMando.z = mz; E.ejeMando.activo = m > 0;
    // L3 alterna la carrera; se deja de correr al soltar el stick
    if (flanco(10)) this.corriendo = !this.corriendo;
    if (m < 0.3) this.corriendo = false;
    if (this.corriendo) E.pulsarVirtual('correr'); else E.soltarVirtual('correr');
    // stick derecho: cámara (curva cuadrática para apuntar fino)
    const [lx, ly] = stick(ejes[2] || 0, ejes[3] || 0, 1.8);
    if (lx || ly) {
      const k = GIRO * dt * (aj.sensMando ?? 1) / Math.max(0.1, aj.sensibilidad || 1);
      E.mirarTactil(lx * k, ly * k);
    }
  }

  // ------------------------------------------------------------ menús
  /** Botones y controles visibles de la pantalla abierta (o el botón de entrar al juego). */
  elementos() {
    const I = this.ctx.interfaz, id = I.visible();
    let raiz = id ? document.getElementById(id) : null;
    if (!raiz) {
      const entrar = document.getElementById('bEntrar');
      return entrar && entrar.offsetParent ? [entrar] : [];
    }
    if (this.ctx.editorHud?.activo) raiz = document.getElementById('editorHud');
    return [...raiz.querySelectorAll('button, input[type=range], input[type=checkbox], select')]
      .filter(e => e.offsetParent !== null && !e.disabled && e.getBoundingClientRect().width > 0);
  }

  enfocar(el) {
    document.querySelectorAll('.focoMando').forEach(e => e.classList.remove('focoMando'));
    if (!el) return;
    el.classList.add('focoMando');
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /** Navegación espacial: el elemento más cercano en la dirección pedida. */
  mover(dir) {
    const lista = this.elementos(); if (!lista.length) return;
    const actual = lista.includes(document.activeElement) ? document.activeElement : null;
    if (!actual) { this.enfocar(lista[0]); return; }
    // en un deslizador, izquierda/derecha cambian el valor
    if (actual.type === 'range' && (dir === 'izq' || dir === 'der')) {
      dir === 'der' ? actual.stepUp() : actual.stepDown();
      actual.dispatchEvent(new Event('input', { bubbles: true }));
      actual.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const r0 = actual.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let mejor = null, md = Infinity;
    for (const el of lista) {
      if (el === actual) continue;
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2 - cx, y = r.top + r.height / 2 - cy;
      const [p, s] = dir === 'arr' ? [-y, x] : dir === 'aba' ? [y, x] : dir === 'izq' ? [-x, y] : [x, y];
      if (p <= 4) continue;
      const d = p + Math.abs(s) * 2.2;
      if (d < md) { md = d; mejor = el; }
    }
    if (mejor) this.enfocar(mejor);
  }

  menu(ahora, flanco, ejes, dt) {
    const I = this.ctx.interfaz, P = this.ctx.partida;
    // dirección: cruceta o stick izquierdo, con repetición al mantener
    const sx = ejes[0] || 0, sy = ejes[1] || 0;
    const dir = ahora[12] || sy < -0.6 ? 'arr' : ahora[13] || sy > 0.6 ? 'aba' : ahora[14] || sx < -0.6 ? 'izq' : ahora[15] || sx > 0.6 ? 'der' : '';
    if (dir && dir !== this.dirAntes) { this.mover(dir); this.repetir = 0.4; }
    else if (dir) { this.repetir -= dt; if (this.repetir <= 0) { this.mover(dir); this.repetir = 0.12; } }
    this.dirAntes = dir;
    // A: aceptar
    if (flanco(0)) {
      const lista = this.elementos();
      const el = lista.includes(document.activeElement) ? document.activeElement : lista[0];
      if (el) { if (el.type === 'checkbox') { el.checked = !el.checked; el.dispatchEvent(new Event('change', { bubbles: true })); } else el.click(); }
      setTimeout(() => { const l = this.elementos(); if (l.length && !l.includes(document.activeElement)) this.enfocar(l[0]); }, 60);
    }
    // B: volver · Start: continuar la partida en pausa
    if (flanco(1)) {
      if (this.ctx.editorHud?.activo) document.getElementById('edCancelar')?.click();
      else if (P.estado === 'pausa' && I.visible() === 'menuPausa') P.reanudar();
      else I.accion('volver');
    }
    if (flanco(9) && P.estado === 'pausa') P.reanudar();
  }
}
