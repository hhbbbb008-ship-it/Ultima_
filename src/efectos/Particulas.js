import * as THREE from 'three';

/**
 * Sistema de partículas en GPU (THREE.Points) con pooling fijo:
 * los búferes se reservan una vez y las partículas muertas se reutilizan.
 * Dos sistemas: mezcla normal (sangre, humo, polvo) y aditiva (fuego, chispas, ácido).
 */
const MAX = 9000;
const LIMITE_POR_NIVEL = [500, 1200, 2600, 5000, 9000];
const DENSIDAD_POR_NIVEL = [0.35, 0.6, 1.0, 1.4, 2.0];

// Preajustes de emisión
const TIPOS = {
  sangre: { sis: 'n', n: 10, vel: [1.5, 5], cono: 0.55, grav: 9.8, roce: 0.6, vida: [0.35, 0.8], tam: [0.025, 0.065], color: [0.32, 0.015, 0.015, 1], var: 0.08 },
  sangreNiebla: { sis: 'n', n: 3, vel: [0.2, 0.9], cono: 1.2, grav: 0.4, roce: 2.5, vida: [0.25, 0.55], tam: [0.2, 0.4], crece: 1.6, color: [0.28, 0.02, 0.02, 0.4], var: 0.04 },
  sangreCabeza: { sis: 'n', n: 32, vel: [1.5, 6], cono: 1.3, grav: 9.8, roce: 0.4, vida: [0.5, 1.1], tam: [0.03, 0.08], color: [0.3, 0.015, 0.015, 1], var: 0.1 },
  chispas: { sis: 'a', n: 9, vel: [2.5, 8], cono: 0.9, grav: 9.8, roce: 0.4, vida: [0.12, 0.35], tam: [0.015, 0.035], color: [1, 0.72, 0.3, 1], var: 0.1 },
  polvo: { sis: 'n', n: 5, vel: [0.4, 1.8], cono: 0.8, grav: -0.2, roce: 2.2, vida: [0.5, 1.1], tam: [0.12, 0.28], crece: 1.2, color: [0.42, 0.4, 0.37, 0.32], var: 0.05 },
  astillas: { sis: 'n', n: 6, vel: [2, 5], cono: 0.7, grav: 9.8, roce: 0.3, vida: [0.4, 0.8], tam: [0.02, 0.04], color: [0.4, 0.28, 0.16, 1], var: 0.08 },
  humoCanon: { sis: 'n', n: 3, vel: [0.3, 1.0], cono: 0.4, grav: -0.6, roce: 2.5, vida: [0.4, 0.9], tam: [0.05, 0.12], crece: 2.2, color: [0.5, 0.5, 0.5, 0.22], var: 0.05 },
  fuego: { sis: 'a', n: 1, vel: [0.8, 2.0], cono: 0.35, arriba: true, grav: -2.2, roce: 0.9, vida: [0.35, 0.85], tam: [0.35, 0.7], crece: -0.9, color: [1, 0.42, 0.1, 0.75], var: 0.12, disp: 0.35 },
  humoFuego: { sis: 'n', n: 1, vel: [0.6, 1.4], cono: 0.3, arriba: true, grav: -0.5, roce: 0.4, vida: [2.0, 3.6], tam: [0.5, 0.9], crece: 1.3, color: [0.06, 0.055, 0.055, 0.42], var: 0.02, disp: 0.3 },
  brasa: { sis: 'a', n: 1, vel: [1.5, 3.2], cono: 0.6, arriba: true, grav: -0.4, roce: 0.3, vida: [1.0, 2.2], tam: [0.02, 0.04], color: [1, 0.5, 0.12, 1], var: 0.1, disp: 0.3 },
  acido: { sis: 'a', n: 14, vel: [1.5, 4.5], cono: 1.0, grav: 9.8, roce: 0.5, vida: [0.3, 0.8], tam: [0.03, 0.07], color: [0.45, 1, 0.15, 0.9], var: 0.1 },
  acidoEstela: { sis: 'a', n: 1, vel: [0.0, 0.3], cono: 3, grav: 1, roce: 1, vida: [0.2, 0.45], tam: [0.06, 0.12], crece: -1, color: [0.4, 1, 0.1, 0.8], var: 0.05 },
  vapor: { sis: 'n', n: 1, vel: [0.3, 0.8], cono: 0.4, arriba: true, grav: -0.3, roce: 1, vida: [0.8, 1.6], tam: [0.2, 0.4], crece: 1.4, color: [0.35, 0.5, 0.2, 0.25], var: 0.03, disp: 0.6 },
  tierra: { sis: 'n', n: 12, vel: [1.5, 4], cono: 0.7, arriba: true, grav: 9.8, roce: 0.5, vida: [0.5, 1.0], tam: [0.04, 0.09], color: [0.2, 0.16, 0.11, 1], var: 0.05, disp: 0.4 },
  explosion: { sis: 'a', n: 46, vel: [2, 9], cono: 3.2, grav: -1.5, roce: 3.2, vida: [0.25, 0.7], tam: [0.6, 1.5], crece: 1.4, color: [1, 0.55, 0.16, 0.95], var: 0.12, disp: 0.6 },
  humoExplosion: { sis: 'n', n: 26, vel: [0.8, 3.5], cono: 3.2, arriba: true, grav: -0.8, roce: 1.2, vida: [1.8, 3.4], tam: [0.9, 1.8], crece: 1.4, color: [0.09, 0.085, 0.08, 0.55], var: 0.03, disp: 0.8 },
  metralla: { sis: 'a', n: 40, vel: [8, 20], cono: 3.2, grav: 9.8, roce: 0.3, vida: [0.15, 0.45], tam: [0.02, 0.05], color: [1, 0.8, 0.4, 1], var: 0.1 },
  escombro: { sis: 'n', n: 20, vel: [2, 6], cono: 1.2, arriba: true, grav: 9.8, roce: 0.4, vida: [0.6, 1.2], tam: [0.05, 0.12], color: [0.3, 0.28, 0.26, 1], var: 0.06, disp: 0.8 },
};

function crearSistema(aditivo) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 4), tam = new Float32Array(MAX);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aTam', new THREE.BufferAttribute(tam, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uEscala: { value: 600 } },
    transparent: true, depthWrite: false, fog: true,
    blending: aditivo ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: /* glsl */`
      attribute vec4 aColor; attribute float aTam; uniform float uEscala; varying vec4 vColor;
      #include <fog_pars_vertex>
      void main() {
        vColor = aColor;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aTam * uEscala / -mvPosition.z, 1.0, 256.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      varying vec4 vColor;
      #include <fog_pars_fragment>
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.35, d) * vColor.a;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor.rgb, a);
        #include <fog_fragment>
      }`,
  });
  const puntos = new THREE.Points(geo, mat);
  puntos.frustumCulled = false;
  puntos.renderOrder = 20;
  return {
    puntos, geo, mat, pos, col, tam, n: 0,
    vel: new Float32Array(MAX * 3), vida: new Float32Array(MAX), vidaMax: new Float32Array(MAX),
    grav: new Float32Array(MAX), roce: new Float32Array(MAX), crece: new Float32Array(MAX),
    tam0: new Float32Array(MAX), alfa0: new Float32Array(MAX),
  };
}

export class Particulas {
  constructor(ctx) {
    this.ctx = ctx;
    this.sis = { n: crearSistema(false), a: crearSistema(true) };
    ctx.escena.add(this.sis.n.puntos, this.sis.a.puntos);
    this.limite = 2600; this.densidad = 1;
    this._d = new THREE.Vector3(); this._t = new THREE.Vector3(); this._b = new THREE.Vector3();
  }

  configurar(nivel) {
    this.limite = LIMITE_POR_NIVEL[nivel];
    this.densidad = DENSIDAD_POR_NIVEL[nivel];
    for (const s of Object.values(this.sis)) s.n = Math.min(s.n, this.limite);
  }

  setEscala(altoPx, fov) {
    const e = altoPx / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    for (const s of Object.values(this.sis)) s.mat.uniforms.uEscala.value = e;
  }

  /**
   * Emite partículas. pos: Vector3 | {x,y,z}; dir: dirección principal (o null = arriba/esfera).
   * cantidad: multiplicador sobre el número base; escala: tamaño/velocidad.
   */
  emitir(tipo, pos, dir, cantidad = 1, escala = 1) {
    const T = TIPOS[tipo]; if (!T) return;
    const s = this.sis[T.sis];
    let n = T.n * cantidad * this.densidad;
    n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    const d = this._d;
    if (dir) d.copy(dir).normalize(); else d.set(0, 1, 0);
    // base ortonormal para el cono
    const t = this._t.set(Math.abs(d.y) < 0.9 ? 0 : 1, Math.abs(d.y) < 0.9 ? 1 : 0, 0).cross(d).normalize();
    const b = this._b.crossVectors(d, t);
    for (let k = 0; k < n; k++) {
      if (s.n >= this.limite) {                 // reciclado: sustituye a una partícula al azar
        if (Math.random() < 0.5) return;
        this.matar(s, Math.floor(Math.random() * s.n));
      }
      const i = s.n++;
      const disp = (T.disp || 0) * escala;
      s.pos[i * 3] = pos.x + (Math.random() - 0.5) * disp;
      s.pos[i * 3 + 1] = pos.y + (Math.random() - 0.5) * disp * 0.3;
      s.pos[i * 3 + 2] = pos.z + (Math.random() - 0.5) * disp;
      const ang = Math.random() * Math.PI * 2, ab = Math.random() * T.cono;
      const sa = Math.sin(ab), ca = Math.cos(ab);
      const v = (T.vel[0] + Math.random() * (T.vel[1] - T.vel[0])) * Math.sqrt(escala);
      const vx = d.x * ca + (t.x * Math.cos(ang) + b.x * Math.sin(ang)) * sa;
      const vy = d.y * ca + (t.y * Math.cos(ang) + b.y * Math.sin(ang)) * sa;
      const vz = d.z * ca + (t.z * Math.cos(ang) + b.z * Math.sin(ang)) * sa;
      s.vel[i * 3] = vx * v; s.vel[i * 3 + 1] = vy * v; s.vel[i * 3 + 2] = vz * v;
      const vida = T.vida[0] + Math.random() * (T.vida[1] - T.vida[0]);
      s.vida[i] = s.vidaMax[i] = vida;
      s.grav[i] = T.grav; s.roce[i] = T.roce; s.crece[i] = T.crece || 0;
      const tm = (T.tam[0] + Math.random() * (T.tam[1] - T.tam[0])) * escala;
      s.tam0[i] = s.tam[i] = tm;
      const vr = (Math.random() - 0.5) * T.var * 2;
      s.col[i * 4] = Math.max(0, T.color[0] + vr); s.col[i * 4 + 1] = Math.max(0, T.color[1] + vr * 0.5);
      s.col[i * 4 + 2] = Math.max(0, T.color[2] + vr * 0.5); s.col[i * 4 + 3] = s.alfa0[i] = T.color[3];
    }
  }

  /** Elimina la partícula i moviendo la última a su hueco (sin huecos en los búferes). */
  matar(s, i) {
    const j = --s.n;
    if (i === j) return;
    for (let k = 0; k < 3; k++) { s.pos[i * 3 + k] = s.pos[j * 3 + k]; s.vel[i * 3 + k] = s.vel[j * 3 + k]; }
    for (let k = 0; k < 4; k++) s.col[i * 4 + k] = s.col[j * 4 + k];
    s.vida[i] = s.vida[j]; s.vidaMax[i] = s.vidaMax[j]; s.grav[i] = s.grav[j]; s.roce[i] = s.roce[j];
    s.crece[i] = s.crece[j]; s.tam0[i] = s.tam0[j]; s.tam[i] = s.tam[j]; s.alfa0[i] = s.alfa0[j];
  }

  actualizar(dt) {
    for (const s of Object.values(this.sis)) {
      for (let i = 0; i < s.n; i++) {
        s.vida[i] -= dt;
        if (s.vida[i] <= 0) { this.matar(s, i); i--; continue; }
        const r = Math.max(0, 1 - s.roce[i] * dt);
        s.vel[i * 3] *= r; s.vel[i * 3 + 2] *= r;
        s.vel[i * 3 + 1] = s.vel[i * 3 + 1] * r - s.grav[i] * dt;
        s.pos[i * 3] += s.vel[i * 3] * dt;
        s.pos[i * 3 + 1] += s.vel[i * 3 + 1] * dt;
        s.pos[i * 3 + 2] += s.vel[i * 3 + 2] * dt;
        if (s.pos[i * 3 + 1] < 0.01 && s.grav[i] > 0) { s.pos[i * 3 + 1] = 0.01; s.vel[i * 3] *= 0.3; s.vel[i * 3 + 1] = 0; s.vel[i * 3 + 2] *= 0.3; }
        const f = s.vida[i] / s.vidaMax[i];
        s.tam[i] = Math.max(0.001, s.tam0[i] * (1 + s.crece[i] * (1 - f)));
        s.col[i * 4 + 3] = s.alfa0[i] * Math.min(1, f * 2.2);
      }
      s.geo.attributes.position.needsUpdate = true;
      s.geo.attributes.aColor.needsUpdate = true;
      s.geo.attributes.aTam.needsUpdate = true;
      s.geo.setDrawRange(0, s.n);
    }
  }

  get activas() { return this.sis.n.n + this.sis.a.n; }

  limpiar() { for (const s of Object.values(this.sis)) { s.n = 0; s.geo.setDrawRange(0, 0); } }
}
