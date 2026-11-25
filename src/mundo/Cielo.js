import * as THREE from 'three';

/**
 * Cielo nocturno procedural: degradado, estrellas que titilan, luna con halo,
 * nubes en movimiento y silueta lejana de una ciudad en ruinas con resplandor
 * de incendios en el horizonte. Sigue a la cámara.
 */
export class Cielo {
  constructor() {
    this.uniforms = {
      uTiempo: { value: 0 },
      uLuna: { value: new THREE.Vector3(-0.45, 0.42, -0.78).normalize() },
      uNubes: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;            // siempre en el plano lejano
        }`,
      fragmentShader: /* glsl */`
        uniform float uTiempo; uniform vec3 uLuna; uniform float uNubes;
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float ruido(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * ruido(p); p *= 2.03; a *= 0.5; } return v; }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          // degradado nocturno
          vec3 col = mix(vec3(0.045, 0.05, 0.075), vec3(0.008, 0.012, 0.03), smoothstep(-0.05, 0.6, h));
          // resplandor anaranjado de incendios lejanos en el horizonte
          float ang = atan(d.z, d.x);
          float brillo = 0.5 + 0.5 * sin(ang * 3.0 + 1.3);
          col += vec3(0.16, 0.06, 0.02) * exp(-max(h, 0.0) * 14.0) * (0.35 + 0.65 * brillo);
          // estrellas
          vec2 cel = vec2(ang * 120.0, h * 120.0);
          float e = hash(floor(cel));
          float est = step(0.9965, e) * smoothstep(0.08, 0.3, h);
          est *= 0.6 + 0.4 * sin(uTiempo * (2.0 + e * 6.0) + e * 50.0);
          col += vec3(0.85, 0.9, 1.0) * est * smoothstep(0.4, 0.0, length(fract(cel) - 0.5));
          // luna y halo
          float m = dot(d, uLuna);
          float disco = smoothstep(0.9993, 0.9996, m);
          float crater = fbm(d.xy * 400.0);
          col += vec3(0.86, 0.88, 0.8) * disco * (0.75 + 0.25 * crater);
          col += vec3(0.32, 0.38, 0.5) * pow(max(m, 0.0), 300.0) * 0.6 + vec3(0.06, 0.08, 0.12) * pow(max(m, 0.0), 12.0);
          // nubes
          if (h > 0.0 && uNubes > 0.5) {
            vec2 uv = d.xz / (h + 0.15) * 1.4 + vec2(uTiempo * 0.006, uTiempo * 0.002);
            float n = smoothstep(0.45, 0.85, fbm(uv));
            vec3 colNube = vec3(0.05, 0.055, 0.07) + vec3(0.2, 0.22, 0.28) * pow(max(m, 0.0), 20.0);
            col = mix(col, colNube, n * smoothstep(0.0, 0.25, h) * 0.85);
          }
          // silueta de ciudad en ruinas
          float idx = floor(ang * 38.0);
          float altura = 0.012 + hash(vec2(idx, 3.0)) * 0.07 * step(0.25, hash(vec2(idx, 7.0)));
          altura += step(0.85, hash(vec2(floor(ang * 160.0), 1.0))) * 0.01;   // antenas y restos
          if (h < altura) {
            col = vec3(0.012, 0.012, 0.018);
            vec2 v = vec2(floor(ang * 600.0), floor(h * 260.0));
            col += vec3(0.25, 0.16, 0.06) * step(0.985, hash(v)) * step(0.004, h);   // ventanas sueltas
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.malla = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
    this.malla.frustumCulled = false;
    this.malla.renderOrder = -1000;
    this.malla.scale.setScalar(50);
  }

  actualizar(dt, camara) {
    this.uniforms.uTiempo.value += dt;
    this.malla.position.copy(camara.position);
    this.malla.scale.setScalar(camara.far * 0.85);
  }
}
