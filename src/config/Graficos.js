import * as THREE from 'three';

/**
 * Aplica los ajustes gráficos al motor en tiempo real.
 * Cada opción modifica parámetros reales del render (no son etiquetas):
 * resolución, texturas, sombras, plano lejano, LOD, modelo de sombreado y
 * número de luces, GTAO, antialiasing, partículas, efectos, niebla, reflejos
 * planares y cadena de postprocesado.
 */
export const DISTANCIAS = [45, 65, 90, 120, 170];
const COLOR_NIEBLA = 0x0b0f18;

export class Graficos {
  constructor(ctx) {
    this.ctx = ctx;
    ctx.eventos.on('ajustes:graficos', ({ antes, ahora }) => this.aplicar(antes, ahora));
    ctx.eventos.on('ajustes:generales', ({ clave, valor }) => { if (clave === 'estilo') this.aplicarEstilo(valor); });
  }

  aplicarTodo() { this.aplicar(null, this.ctx.ajustes.g); this.aplicarEstilo(this.ctx.ajustes.gen.estilo, true); }

  /** Estilo visual: materiales de zombi y pase de contornos (cómic) o render normal. */
  aplicarEstilo(estilo, primera = false) {
    const c = this.ctx;
    if (!primera && c.recursos.estilo === estilo) return;
    c.recursos.reconstruir({ estilo: estilo === 'comic' ? 'comic' : 'realista' }, this.raices());
    c.motor.reconstruirPipeline(c.ajustes.g);
  }

  /** Reaplica lo que depende del mapa (niebla, bruma, detalle, reflejos) tras cargar otro. */
  aplicarMapa() {
    const g = this.ctx.ajustes.g, c = this.ctx;
    const antes = { ...g, distancia: -1, detalle: -1, reflejos: -1 };
    this.aplicar(antes, { ...g });
    c.zombis.configurar(g.detalle);
  }

  aplicar(antes, g) {
    const c = this.ctx, cambia = k => !antes || antes[k] !== g[k];
    const t0 = performance.now();

    if (cambia('escalaRes')) c.motor.setEscala(g.escalaRes);
    if (cambia('vsync') || cambia('limiteFps')) c.motor.configurarBucle(g.vsync !== 'no', +g.limiteFps);

    if (cambia('texturas') || cambia('iluminacion'))
      c.recursos.reconstruir({ calTex: g.texturas, calIlum: g.iluminacion }, this.raices());

    if (cambia('iluminacion') || cambia('sombras')) {
      c.iluminacion.configurar(g.iluminacion, g.sombras);
      // el tipo de mapa de sombras forma parte del shader: hay que recompilar materiales
      this.raices().forEach(r => r?.traverse(o => { if (o.material) o.material.needsUpdate = true; }));
    }

    if (cambia('distancia') || cambia('niebla')) {
      const d = DISTANCIAS[g.distancia];
      c.camara.far = d; c.camara.updateProjectionMatrix();
      const mapa = c.mundo.def || {}, col = mapa.colorNiebla ?? COLOR_NIEBLA, k = mapa.niebla ?? 1;
      if (g.niebla === 0) c.escena.fog = null;
      else if (g.niebla === 1) c.escena.fog = new THREE.Fog(col, d * 0.3 / k, d * 0.97);
      else c.escena.fog = new THREE.FogExp2(col, k * (g.niebla >= 4 ? 3.1 : g.niebla >= 3 ? 2.8 : 2.5) / d);
      c.escena.background.set(col).multiplyScalar(0.45);
      c.mundo.configurarBruma(g.niebla);
      c.mundo.cielo.uniforms.uNubes.value = g.niebla >= 2 ? 1 : 0;
    }

    if (cambia('detalle')) { c.mundo.configurarDetalle(g.detalle); c.zombis.configurar(g.detalle); }
    if (cambia('particulas')) c.particulas.configurar(g.particulas);
    if (cambia('efectos')) { c.calcas.configurar(g.efectos); c.armas.configurar(g.efectos); c.audio.setCalidad(g.efectos); }

    if (cambia('reflejos')) {
      const pr = c.motor.pixelRatio;
      c.mundo.configurarReflejos(g.reflejos, innerWidth * pr, innerHeight * pr);
      c.escena.environment = g.reflejos >= 1 ? this.mapaEntorno() : null;
    }
    // el arma en primera persona siempre usa el entorno (el metal sin entorno se ve negro)
    if (c.armas && !c.armas.escena.environment) c.armas.escena.environment = this.mapaEntorno();

    if (cambia('post') || cambia('oclusion') || cambia('antialias') || cambia('escalaRes'))
      c.motor.reconstruirPipeline(g);

    this.ultimoCoste = performance.now() - t0;
    c.eventos.emit('graficos:aplicados', { coste: this.ultimoCoste });
  }

  /** Raíces de escena cuyos materiales se reconstruyen al cambiar calidad. */
  raices() {
    const c = this.ctx;
    return [c.escena, c.armas?.escena, ...(c.zombis ? c.zombis.raices() : [])];
  }

  /** Mapa de entorno generado una vez (cielo nocturno + resplandores cálidos). */
  mapaEntorno() {
    if (this.entorno) return this.entorno;
    const r = this.ctx.renderer;
    const esc = new THREE.Scene();
    const cielo = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 p; void main(){ float h = normalize(p).y; vec3 c = mix(vec3(0.05,0.045,0.05), vec3(0.03,0.04,0.07), smoothstep(-0.2,0.5,h)); c += vec3(0.12,0.06,0.02) * exp(-abs(h)*10.0); gl_FragColor = vec4(c,1.0); }',
    }));
    esc.add(cielo);
    const panel = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb36b).multiplyScalar(2.2) });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), panel);
      const a = i / 6 * Math.PI * 2;
      m.position.set(Math.cos(a) * 30, 12, Math.sin(a) * 30); m.lookAt(0, 0, 0);
      esc.add(m);
    }
    const pm = new THREE.PMREMGenerator(r);
    this.entorno = pm.fromScene(esc, 0.02).texture;
    pm.dispose();
    return this.entorno;
  }
}
