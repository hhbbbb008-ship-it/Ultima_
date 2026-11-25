import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { BokehShader } from 'three/addons/shaders/BokehShader.js';

/**
 * Motor de render y bucle principal.
 * - WebGLRenderer (WebGL 2) con tone mapping ACES y espacio de color sRGB.
 * - Cadena de postproceso configurable (o render directo si todo está desactivado).
 * - Arma en primera persona compuesta encima del mundo (sin atravesar paredes).
 * - Bucle con VSync (requestAnimationFrame) o sin él (MessageChannel) y límite de FPS.
 */

/** Gradación de color, viñeta, grano y aberración cromática. */
const GradoShader = {
  uniforms: {
    tDiffuse: { value: null }, uTiempo: { value: 0 }, uVineta: { value: 0.4 }, uGrano: { value: 0 },
    uAberracion: { value: 0 }, uSaturacion: { value: 0.88 }, uDesat: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTiempo, uVineta, uGrano, uAberracion, uSaturacion, uDesat;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTiempo * 7.0) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      vec3 col;
      if (uAberracion > 0.0) {
        vec2 o = c * uAberracion;
        col = vec3(texture2D(tDiffuse, vUv + o).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - o).b);
      } else col = texture2D(tDiffuse, vUv).rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturacion * (1.0 - uDesat));
      // tono nocturno: sombras frías, luces cálidas
      col *= mix(vec3(0.9, 0.96, 1.08), vec3(1.06, 1.0, 0.92), smoothstep(0.05, 0.6, l));
      col *= 1.0 - dot(c, c) * uVineta * 2.2;
      col += (h(vUv * 800.0) - 0.5) * uGrano;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const MUESTRAS_AA = { msaa4: 4, msaa8: 8 };

/**
 * Pase invisible que comparte la profundidad del render principal con la
 * oclusión ambiental y la profundidad de campo. Así esos efectos NO vuelven a
 * dibujar la escena (ni a recalcular todos los mapas de sombra) cada fotograma.
 */
class PaseProfundidad extends Pass {
  constructor(alCapturar) { super(); this.needsSwap = false; this.alCapturar = alCapturar; }
  render(renderer, writeBuffer, readBuffer) { this.alCapturar(readBuffer.depthTexture); }
}

/** Profundidad de campo (bokeh) que lee el búfer de profundidad compartido. */
class PaseDOF extends Pass {
  constructor(camara) {
    super();
    this.camara = camara;
    this.uniforms = THREE.UniformsUtils.clone(BokehShader.uniforms);
    this.material = new THREE.ShaderMaterial({
      defines: { ...BokehShader.defines, DEPTH_PACKING: 0 },
      uniforms: this.uniforms, vertexShader: BokehShader.vertexShader, fragmentShader: BokehShader.fragmentShader,
    });
    this.uniforms.maxblur.value = 0.0045;
    this.quad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.uniforms, c = this.camara;
    u.tColor.value = readBuffer.texture;
    u.nearClip.value = c.near; u.farClip.value = c.far; u.aspect.value = c.aspect;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() { this.material.dispose(); this.quad.dispose(); }
}

/**
 * Estilo cómic: contornos negros donde cambia mucho la profundidad (siluetas de
 * zombis, bordes de edificios, coches) y colores algo más apagados. El sombreado plano
 * por tonos lo ponen los materiales de los zombis (MeshToonMaterial).
 */
class PaseComic extends Pass {
  constructor(camara) {
    super();
    this.camara = camara;
    this.profundidad = null;
    this.uniforms = {
      tColor: { value: null }, tDepth: { value: null },
      uTexel: { value: new THREE.Vector2() }, uGrosor: { value: 1 },
      uNear: { value: 0.1 }, uFar: { value: 100 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tColor, tDepth; uniform vec2 uTexel; uniform float uGrosor, uNear, uFar;
        varying vec2 vUv;
        float prof(vec2 uv){
          float d = texture2D(tDepth, uv).r * 2.0 - 1.0;
          return (2.0 * uNear * uFar) / (uFar + uNear - d * (uFar - uNear));
        }
        void main(){
          vec3 col = texture2D(tColor, vUv).rgb;
          vec2 o = uTexel * uGrosor;
          float c = prof(vUv);
          float e = 0.0;
          e = max(e, abs(prof(vUv + vec2(o.x, 0.0)) - c));
          e = max(e, abs(prof(vUv - vec2(o.x, 0.0)) - c));
          e = max(e, abs(prof(vUv + vec2(0.0, o.y)) - c));
          e = max(e, abs(prof(vUv - vec2(0.0, o.y)) - c));
          float linea = smoothstep(0.035, 0.09, e / max(c, 0.001));
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(l), col, 0.8);
          col = mix(col, vec3(0.03, 0.025, 0.03), linea * 0.92);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.quad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.uniforms;
    u.tColor.value = readBuffer.texture;
    u.tDepth.value = this.profundidad || readBuffer.depthTexture;
    u.uTexel.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    u.uGrosor.value = Math.max(1, readBuffer.height / 540);
    u.uNear.value = this.camara.near; u.uFar.value = this.camara.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() { this.material.dispose(); this.quad.dispose(); }
}

export class Motor {
  constructor(lienzo, ctx) {
    this.ctx = ctx;
    this.renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: false, powerPreference: 'high-performance', stencil: false });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.25;
    r.info.autoReset = false;
    this.escena = new THREE.Scene();
    this.escena.background = new THREE.Color(0x04060b);
    this.camara = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.05, 120);
    this.escena.add(this.camara);
    this.escala = 1;
    this.factorDinamico = 1;          // resolución dinámica (lo ajusta Rendimiento)
    this.composer = null;
    this.vsync = true; this.limite = 0;
    this.ultimo = performance.now(); this.ultimoRender = 0;
    window.addEventListener('resize', () => this.redimensionar());
  }

  setEscala(e) { this.escala = e; this.redimensionar(); }

  /** Densidad de píxeles efectiva. Se limita a 2: por encima el coste crece mucho más que la nitidez percibida. */
  /** En móviles (pantallas de 3x) se limita a 1,5: la diferencia apenas se ve y cuesta hasta el doble de píxeles. */
  get pixelRatio() { return Math.min(this.maxPR ??= (matchMedia('(pointer: coarse)').matches ? 1.5 : 2), Math.max(0.35, (window.devicePixelRatio || 1) * this.escala * this.factorDinamico)); }

  setFactorDinamico(f) {
    if (Math.abs(f - this.factorDinamico) < 0.01) return;
    this.factorDinamico = f; this.redimensionar();
  }

  redimensionar() {
    const w = innerWidth, h = innerHeight, pr = this.pixelRatio;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.camara.aspect = w / h; this.camara.updateProjectionMatrix();
    this.ctx.armas?.redimensionar(w / h);
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); }
    this.ctx.mundo?.configurarReflejos?.(this.ctx.ajustes.g.reflejos, w * pr, h * pr);
  }

  /** (Re)construye la cadena de postprocesado según los ajustes. */
  reconstruirPipeline(g) {
    if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); this.composer.passes.forEach(p => p.dispose?.()); }
    this.composer = null; this.pases = {};
    const comic = this.ctx.ajustes.gen.estilo === 'comic';
    const directo = g.post === 0 && g.oclusion === 0 && g.antialias === 'no' && !comic;
    if (directo) return;
    const r = this.renderer, w = innerWidth, h = innerHeight, pr = this.pixelRatio;
    const muestras = Math.min(MUESTRAS_AA[g.antialias] || 0, r.capabilities.maxSamples || 4);
    const conProf = g.oclusion > 0 || g.post >= 4 || comic;
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, {
      type: THREE.HalfFloatType, samples: muestras,
      depthTexture: conProf ? new THREE.DepthTexture(w * pr, h * pr, THREE.UnsignedIntType) : null,
    });
    const c = new EffectComposer(r, rt);
    c.setPixelRatio(pr); c.setSize(w, h);
    c.addPass(new RenderPass(this.escena, this.camara));
    if (conProf) c.addPass(new PaseProfundidad(t => this.compartirProfundidad(t)));
    if (g.oclusion > 0) {
      const ao = new GTAOPass(this.escena, this.camara, w, h, { depthTexture: rt.depthTexture });
      ao.output = GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 0.85;
      ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: g.oclusion >= 2 ? 16 : 8 });
      ao.updatePdMaterial({ samples: g.oclusion >= 2 ? 12 : 8, rings: 2, radius: 6 });
      if (g.oclusion === 1) { const orig = ao.setSize.bind(ao); ao.setSize = (a, b) => orig(Math.max(1, a >> 1), Math.max(1, b >> 1)); }
      c.addPass(ao); this.pases.ao = ao;
    }
    if (g.post >= 4) {
      const dof = new PaseDOF(this.camara);
      c.addPass(dof); this.pases.dof = dof;
    }
    // contornos con la profundidad del mundo (antes del arma, que limpia la profundidad)
    if (comic) {
      const pc = new PaseComic(this.camara);
      c.addPass(pc); this.pases.comic = pc;
    }
    const vista = new RenderPass(this.ctx.armas.escena, this.ctx.armas.camara);
    vista.clear = false; vista.clearDepth = true;
    c.addPass(vista);
    if (g.post >= 2) {
      const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), g.post >= 4 ? 0.62 : 0.5, 0.55, 0.78);
      c.addPass(bloom); this.pases.bloom = bloom;
    }
    if (g.post >= 1) {
      const grado = new ShaderPass(GradoShader);
      grado.uniforms.uVineta.value = g.post >= 3 ? 0.65 : 0.35;
      grado.uniforms.uGrano.value = g.post >= 3 ? 0.016 : 0;
      grado.uniforms.uAberracion.value = g.post >= 3 ? 0.004 : 0;
      c.addPass(grado); this.pases.grado = grado;
    }
    c.addPass(new OutputPass());
    if (g.antialias === 'fxaa') c.addPass(new FXAAPass());
    else if (g.antialias === 'smaa') c.addPass(new SMAAPass());
    this.composer = c;
    c.setSize(w, h);
  }

  /** Entrega a GTAO y a la profundidad de campo la profundidad del render principal de este fotograma. */
  compartirProfundidad(t) {
    const ao = this.pases.ao, dof = this.pases.dof;
    if (ao) {
      ao.depthTexture = t;
      ao.gtaoMaterial.uniforms.tDepth.value = t;
      ao.pdMaterial.uniforms.tDepth.value = t;
      ao.depthRenderMaterial.uniforms.tDepth.value = t;
    }
    if (dof) dof.uniforms.tDepth.value = t;
    if (this.pases.comic) this.pases.comic.profundidad = t;
  }

  render(dt) {
    const r = this.renderer;
    r.info.reset();
    // el arma en primera persona solo se dibuja durante la partida
    const P = this.ctx.partida;
    this.ctx.armas.escena.visible = !!P && (P.estado === 'jugando' || P.estado === 'pausa' || (P.estado === 'muriendo' && this.ctx.jugador.vivo));
    if (this.composer) {
      const p = this.pases;
      if (p.grado) {
        p.grado.uniforms.uTiempo.value += dt;
        const j = this.ctx.jugador;
        p.grado.uniforms.uDesat.value = this.ctx.partida.jugando ? Math.max(0, (40 - j.salud) / 40) * 0.8 : 0;
      }
      if (p.dof) {
        // enfoque automático en lo que hay en el centro de la pantalla
        const cam = this.camara, d = cam.getWorldDirection(this._d || (this._d = new THREE.Vector3()));
        const h = this.ctx.colisiones.rayo(cam.position, d, 80);
        const obj = h ? h.dist : 60;
        this.foco = (this.foco || 10) + (obj - (this.foco || 10)) * Math.min(1, dt * 4);
        p.dof.uniforms.focus.value = this.foco;
        p.dof.uniforms.aperture.value = (this.ctx.armas?.adsEase || 0) > 0.5 ? 0.0011 : 0.00035;
      }
      this.composer.render(dt);
    } else {
      r.autoClear = true;
      r.render(this.escena, this.camara);
      r.autoClear = false;
      r.clearDepth();
      r.render(this.ctx.armas.escena, this.ctx.armas.camara);
      r.autoClear = true;
    }
  }

  configurarBucle(vsync, limite) { this.vsync = vsync; this.limite = limite; }

  /** Arranca el bucle. fn(dt, dtReal) se llama una vez por fotograma. */
  iniciar(fn) {
    this.fn = fn;
    const canal = new MessageChannel();
    const tick = () => {
      const ahora = performance.now();
      if (this.limite > 0 && ahora - this.ultimoRender < 1000 / this.limite - 0.6) { programar(); return; }
      const dt = Math.min(0.05, (ahora - this.ultimo) / 1000);
      this.ultimo = ahora; this.ultimoRender = ahora;
      try { this.fn(dt); } catch (e) { console.error(e); }
      programar();
    };
    const programar = () => {
      if (this.vsync || document.hidden) requestAnimationFrame(tick);
      else canal.port2.postMessage(0);
    };
    canal.port1.onmessage = tick;
    programar();
  }
}
