import * as THREE from 'three';
import { ConstructorArmas } from '../armas/ModelosArmas.js';

/**
 * Botiquines recogibles en el mapa.
 * - Al empezar cada oleada aparecen hasta 2 en los puntos que define el mapa.
 * - El Coloso siempre suelta uno al morir; los demás zombis, con un 4 % de probabilidad
 *   (estos desaparecen a los 40 s, parpadeando los últimos 6).
 * - Se recogen pasando por encima si no llevas el máximo (3).
 * El uso (cura de 60 puntos con animación) lo gestiona SistemaArmas.
 */
const MAX_FIJOS = 2, MAX_TOTAL = 5, VIDA_SOLTADO = 40;

export class Botiquines {
  constructor(ctx) {
    this.ctx = ctx;
    this.activos = [];
    this.fabrica = new ConstructorArmas(ctx.recursos);
    this.matHalo = new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.geoHalo = new THREE.RingGeometry(0.22, 0.42, 24).rotateX(-Math.PI / 2);
    ctx.eventos.on('oleada:inicio', () => this.alIniciarOleada());
    ctx.eventos.on('zombi:muerto', d => { if (!d.autor) this.alMorirZombi(d); });   // autor: baja de otro jugador o réplica
  }

  crear(pos, vida) {
    const g = new THREE.Group();
    const m = this.fabrica.botiquin(false).grupo;
    m.scale.setScalar(2.3); m.position.y = 0.42;
    g.add(m);
    const halo = new THREE.Mesh(this.geoHalo, this.matHalo); halo.position.y = 0.03; g.add(halo);
    g.position.set(pos.x, 0, pos.z);
    g.position.y = this.ctx.colisiones.alturaSuelo(pos.x, pos.z, 0.2, 2);
    this.ctx.escena.add(g);
    const b = { g, m, pos: g.position, vida, fijo: vida === Infinity, t: Math.random() * 6 };
    this.activos.push(b);
    return b;
  }

  quitar(b) {
    this.ctx.escena.remove(b.g);          // las geometrías son compartidas: no se liberan
    this.activos.splice(this.activos.indexOf(b), 1);
  }

  limpiar() { while (this.activos.length) this.quitar(this.activos[0]); }

  alIniciarOleada() {
    const puntos = this.ctx.mundo.puntosBotiquin || [];
    const fijos = this.activos.filter(b => b.fijo).length;
    const libres = puntos.filter(p => !this.activos.some(b => Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < 1.5));
    for (let i = libres.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [libres[i], libres[k]] = [libres[k], libres[i]]; }
    for (let i = 0; i < Math.min(MAX_FIJOS - fijos, libres.length); i++) this.crear(libres[i], Infinity);
  }

  alMorirZombi({ tipo, pos }) {
    if (this.activos.length >= MAX_TOTAL) return;
    if (tipo === 'coloso' || Math.random() < 0.04) this.crear(pos, VIDA_SOLTADO);
  }

  actualizar(dt) {
    const j = this.ctx.jugador;
    for (let i = this.activos.length - 1; i >= 0; i--) {
      const b = this.activos[i];
      b.t += dt;
      b.m.rotation.y += dt * 1.6;
      b.m.position.y = 0.42 + Math.sin(b.t * 2.4) * 0.06;
      if (!b.fijo) {
        b.vida -= dt;
        b.g.visible = b.vida > 6 || Math.sin(b.vida * 14) > -0.2;
        if (b.vida <= 0) { this.quitar(b); continue; }
      }
      if (!j.vivo) continue;
      const d = Math.hypot(j.pos.x - b.pos.x, j.pos.z - b.pos.z);
      if (d < 1.25 && Math.abs(j.pos.y - b.pos.y) < 1.2) {
        if (j.botiquines < j.botiquinesMax) {
          j.botiquines++;
          this.ctx.audio.reproducir('recoger', { bus: 'interfaz', vol: 0.8, reverb: 0 });
          this.ctx.eventos.emit('botiquin:recogido', { total: j.botiquines });
          this.quitar(b);
        } else if (!b.avisado) { b.avisado = true; this.ctx.interfaz.notificar(`Botiquines al máximo (${j.botiquinesMax})`); }
      } else b.avisado = false;
    }
  }

  /** El más cercano (para la flecha del HUD). */
  masCercano(pos) {
    let mejor = null, md = Infinity;
    for (const b of this.activos) { const d = Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z); if (d < md) { md = d; mejor = b; } }
    return mejor ? { b: mejor, d: md } : null;
  }
}
