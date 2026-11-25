import { ORDEN_PERFILES } from '../config/Ajustes.js';

/**
 * Monitor de rendimiento:
 * - FPS, tiempo de fotograma, 1 % más lento, llamadas de dibujo, triángulos,
 *   geometrías/texturas en GPU y memoria JS (Chrome: performance.memory).
 * - Límite dinámico de zombis simultáneos según el rendimiento.
 * - Ajuste automático de calidad (opcional): baja un perfil si los FPS
 *   se mantienen por debajo del objetivo.
 */
const CAP_BASE = [14, 20, 26, 34, 44];

export class Rendimiento {
  constructor(ctx) {
    this.ctx = ctx;
    this.el = document.getElementById('rendimiento');
    this.fps = 60; this.ms = 16.7; this.bajo1 = 60;
    this.muestras = []; this.acum = 0; this.cuadros = 0;
    this.capDinamico = null; this.malT = 0; this.bienT = 0; this.autoT = 0;
    this.dinMal = 0; this.dinBien = 0; this.dinEspera = 0;
    this.visible = ctx.ajustes.gen.mostrarFps;
    ctx.eventos.on('ajustes:generales', ({ clave, valor }) => { if (clave === 'mostrarFps') this.visible = valor; });
  }

  get capBase() { return CAP_BASE[this.ctx.ajustes.g.detalle]; }
  get capZombis() { return this.capDinamico ?? this.capBase; }

  actualizar(dt) {
    this.acum += dt; this.cuadros++;
    this.muestras.push(dt);
    if (this.muestras.length > 240) this.muestras.shift();
    if (this.acum >= 0.5) {
      this.fps = this.cuadros / this.acum;
      this.ms = this.acum / this.cuadros * 1000;
      const ord = [...this.muestras].sort((a, b) => b - a);
      this.bajo1 = 1 / (ord[Math.floor(ord.length * 0.01)] || 0.016);
      this.acum = 0; this.cuadros = 0;
      this.adaptar(0.5);
      this.pintar();
    }
    if (this.ctx.entrada.pulsado('rendimiento')) {
      this.visible = !this.visible;
      this.ctx.ajustes.setGeneral('mostrarFps', this.visible);
    }
  }

  adaptar(paso) {
    const ctx = this.ctx;
    this.resolucionDinamica(paso);
    if (!ctx.partida.jugando) return;
    // control de cantidad de enemigos
    if (this.fps < 40) { this.malT += paso; this.bienT = 0; } else if (this.fps > 56) { this.bienT += paso; this.malT = 0; }
    if (this.malT >= 3) { this.capDinamico = Math.max(8, this.capZombis - 4); this.malT = 0; }
    if (this.bienT >= 5 && this.capDinamico !== null) { this.capDinamico += 2; if (this.capDinamico >= this.capBase) this.capDinamico = null; this.bienT = 0; }
    // calidad automática
    const aj = ctx.ajustes;
    if (!aj.gen.autoCalidad) return;
    this.autoT += paso;
    const objetivo = Math.min(55, (+aj.g.limiteFps || 60) - 5);
    if (this.autoT > 6 && this.fps < objetivo) {
      this.autoT = 0;
      const i = ORDEN_PERFILES.indexOf(aj.perfil === 'personalizado' ? aj.detectarPerfil() : aj.perfil);
      if (i > 0) { aj.aplicarPerfil(ORDEN_PERFILES[i - 1]); ctx.interfaz.notificar(`Calidad automática: perfil ${ORDEN_PERFILES[i - 1]}`); }
      else if (i === 0 && aj.g.escalaRes > 0.5) { aj.setGrafico('escalaRes', Math.max(0.5, +(aj.g.escalaRes - 0.1).toFixed(2))); }
      else if (i < 0) aj.aplicarPerfil('medio');
    }
  }

  /**
   * Resolución dinámica: si los FPS se quedan por debajo del objetivo, baja la
   * resolución interna en pasos del 10 % (hasta el 60 %); si sobra margen durante
   * varios segundos, la sube poco a poco. Con histéresis para no oscilar.
   */
  resolucionDinamica(paso) {
    const ctx = this.ctx, motor = ctx.motor, aj = ctx.ajustes;
    if (aj.g.resDinamica !== 'si' || !ctx.partida.jugando) {
      if (motor.factorDinamico !== 1 && !ctx.partida.jugando && ctx.partida.estado !== 'pausa') motor.setFactorDinamico(1);
      return;
    }
    const objetivo = Math.min(+aj.g.limiteFps || 60, 60);
    this.dinEspera = Math.max(0, this.dinEspera - paso);
    if (this.fps < objetivo * 0.9) { this.dinMal += paso; this.dinBien = 0; }
    else if (this.fps > objetivo * 0.97) { this.dinBien += paso; this.dinMal = 0; }
    if (this.dinEspera > 0) return;
    let f = motor.factorDinamico;
    if (this.dinMal >= 1.5 && f > 0.6) f = Math.max(0.6, +(f - 0.1).toFixed(2));
    else if (this.dinBien >= 5 && f < 1) f = Math.min(1, +(f + 0.05).toFixed(2));
    if (f !== motor.factorDinamico) { motor.setFactorDinamico(f); this.dinMal = this.dinBien = 0; this.dinEspera = 2; }
  }

  pintar() {
    const enPartida = this.ctx.partida.jugando || this.ctx.partida.estado === 'pausa';
    this.el.classList.toggle('oculto', !this.visible || !enPartida);
    if (!this.visible || !enPartida) return;
    const r = this.ctx.renderer, info = r.info;
    const mem = performance.memory ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} MB` : 'n/d';
    const col = this.fps >= 55 ? '#7dff4f' : this.fps >= 35 ? '#ffd24a' : '#ff5a4e';
    const pr = r.getPixelRatio();
    this.el.innerHTML =
      `<b style="color:${col}">${this.fps.toFixed(0)} FPS</b> · ${this.ms.toFixed(1)} ms · 1%: ${this.bajo1.toFixed(0)}<br>` +
      `Dibujado: ${info.render.calls} llamadas · ${(info.render.triangles / 1000).toFixed(0)}k tri<br>` +
      `GPU: ${info.memory.geometries} geo · ${info.memory.textures} tex · JS: ${mem}<br>` +
      `Res. interna: ${Math.round(innerWidth * pr)}×${Math.round(innerHeight * pr)}${this.ctx.motor.factorDinamico < 1 ? ` (dinámica ${Math.round(this.ctx.motor.factorDinamico * 100)} %)` : ''} · Partículas: ${this.ctx.particulas.activas}<br>` +
      `Zombis: ${this.ctx.zombis.activos.length} (máx. ${this.capZombis}) · Perfil: ${this.ctx.ajustes.perfil}`;
  }
}
