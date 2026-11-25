import * as THREE from 'three';

/**
 * Iluminación dinámica:
 * - Luz de luna direccional con sombras que siguen al jugador.
 * - Luz hemisférica ambiental.
 * - Reserva (pool) de focos para farolas y luces puntuales para fuegos:
 *   se asignan cada poco tiempo a las fuentes más cercanas a la cámara.
 *   El número de luces es fijo por nivel de calidad (evita recompilar shaders).
 * - Linterna del jugador (SpotLight) con sombras en Ultra.
 */
const LUCES_POR_NIVEL = [0, 2, 4, 8, 12];
const ALCANCE_LUZ = 34;          // fuentes más lejanas no reciben una luz real (no aportan nada visible)
const MAPA_SOMBRA = [0, 512, 1024, 2048, 4096];

export class Iluminacion {
  constructor(ctx) {
    this.ctx = ctx;
    this.escena = ctx.escena;
    this.hemi = new THREE.HemisphereLight(0x5a6c92, 0x15131a, 0.85);
    this.escena.add(this.hemi);
    this.dirLuna = new THREE.Vector3(-0.45, 0.62, -0.65).normalize();
    this.luna = new THREE.DirectionalLight(0xa8bcff, 0.9);
    this.luna.shadow.camera.left = -32; this.luna.shadow.camera.right = 32;
    this.luna.shadow.camera.top = 32; this.luna.shadow.camera.bottom = -32;
    this.luna.shadow.camera.near = 5; this.luna.shadow.camera.far = 140;
    this.luna.shadow.bias = -0.0005; this.luna.shadow.normalBias = 0.04;
    this.escena.add(this.luna, this.luna.target);

    this.linterna = new THREE.SpotLight(0xfff0d8, 0, 38, 0.36, 0.55, 1.6);
    this.linterna.shadow.mapSize.set(1024, 1024);
    this.linterna.shadow.bias = -0.0008;
    this.escena.add(this.linterna, this.linterna.target);
    this.linternaEncendida = false;

    this.focos = []; this.puntos = [];
    this.temporizador = 0;
    this.nivel = -1;
  }

  /** Reconfigura el número de luces y la calidad de sombras. */
  configurar(nivelIlum, nivelSombras) {
    const r = this.ctx.renderer;
    r.shadowMap.enabled = nivelSombras > 0;
    // 1: duras · 2-4: PCF con disco de Vogel (penumbra suave por muestreo con comparación por hardware).
    // Ultra usaba VSM 4096 con dos pasadas de desenfoque: ~70 % del coste del fotograma.
    // PCF 4096 con radio amplio da una penumbra igual de suave por una fracción del coste.
    r.shadowMap.type = nivelSombras <= 1 ? THREE.BasicShadowMap : THREE.PCFShadowMap;
    this.luna.castShadow = nivelSombras > 0;
    if (nivelSombras > 0) {
      const t = MAPA_SOMBRA[nivelSombras];
      if (this.luna.shadow.mapSize.x !== t) { this.luna.shadow.mapSize.set(t, t); this.luna.shadow.map?.dispose(); this.luna.shadow.map = null; }
      this.luna.shadow.radius = nivelSombras >= 4 ? 3.2 : nivelSombras === 3 ? 2.2 : 1;
    }
    this.linterna.castShadow = nivelIlum >= 4 && nivelSombras >= 2;

    for (const l of [...this.focos, ...this.puntos]) { this.escena.remove(l, l.target || l); l.dispose(); }
    this.focos = []; this.puntos = [];
    const total = LUCES_POR_NIVEL[nivelIlum];
    const nPuntos = Math.min(4, Math.floor(total / 3));
    for (let i = 0; i < total - nPuntos; i++) {
      const s = new THREE.SpotLight(0xffb46b, 0, 24, Math.PI / 3.1, 0.65, 1.7);
      s.castShadow = nivelSombras >= 4 && i < 2;
      if (s.castShadow) {
        s.shadow.mapSize.set(512, 512); s.shadow.bias = -0.001; s.shadow.camera.near = 0.5; s.shadow.radius = 2;
        // las farolas no se mueven: su sombra solo se recalcula cada 2 fotogramas (o al reasignarse)
        s.shadow.autoUpdate = false; s.shadow.needsUpdate = true;
      }
      this.escena.add(s, s.target);
      this.focos.push(s);
    }
    for (let i = 0; i < nPuntos; i++) {
      const p = new THREE.PointLight(0xff7a2a, 0, 16, 1.8);
      this.escena.add(p);
      this.puntos.push(p);
    }
    // con iluminación básica (Lambert) se compensa con más luz ambiental
    this.hemi.intensity = nivelIlum === 0 ? 2.2 : 1.1;
    this.luna.intensity = nivelIlum === 0 ? 1.6 : 1.25;
    this.nivel = nivelIlum;
    this.temporizador = 0;
  }

  /** Tras cambiar de mapa: olvida las asignaciones y reasigna en el siguiente fotograma. */
  reiniciarAsignaciones() {
    for (const l of [...this.focos, ...this.puntos]) { l.userData.c = null; l.intensity = 0; if (l.castShadow) l.shadow.needsUpdate = true; }
    this.temporizador = 0;
  }

  alternarLinterna() { this.linternaEncendida = !this.linternaEncendida; return this.linternaEncendida; }

  actualizar(dt, camara, tiempo) {
    // luna: el volumen de sombra sigue al jugador, ajustado a texel para evitar parpadeos
    const t = this.luna.shadow.mapSize.x || 1024;
    const paso = 64 / t;
    const cx = Math.round(camara.position.x / paso) * paso, cz = Math.round(camara.position.z / paso) * paso;
    this.luna.target.position.set(cx, 0, cz);
    this.luna.position.set(cx + this.dirLuna.x * 60, this.dirLuna.y * 60, cz + this.dirLuna.z * 60);

    // linterna pegada a la cámara
    this.linterna.intensity = this.linternaEncendida ? 90 : 0;
    this.linterna.position.copy(camara.position);
    camara.getWorldDirection(this._dir || (this._dir = new THREE.Vector3()));
    this.linterna.position.addScaledVector(this._dir, 0.3).y -= 0.15;
    this.linterna.target.position.copy(camara.position).addScaledVector(this._dir, 10);

    // reasignación de luces a las fuentes más cercanas (cada 0.25 s)
    const cands = this.ctx.mundo.candidatosLuz;
    this.temporizador -= dt;
    if (this.temporizador <= 0) {
      this.temporizador = 0.25;
      const cp = camara.position;
      const pun = (c) => {
        const dx = c.pos.x - cp.x, dz = c.pos.z - cp.z, d = Math.hypot(dx, dz);
        const delante = (dx * this._dir.x + dz * this._dir.z) / (d || 1);
        return d - delante * 6;          // prioriza lo que está delante
      };
      const cerca = c => Math.hypot(c.pos.x - cp.x, c.pos.z - cp.z) < ALCANCE_LUZ;
      this.asignFocos = cands.filter(c => c.tipo === 'farola' && cerca(c)).sort((a, b) => pun(a) - pun(b)).slice(0, this.focos.length);
      this.asignPuntos = cands.filter(c => c.tipo === 'fuego' && cerca(c)).sort((a, b) => pun(a) - pun(b)).slice(0, this.puntos.length);
      this.focos.forEach((l, i) => {
        const c = this.asignFocos[i];
        if (!c) { l.intensity = 0; l.userData.c = null; return; }
        if (l.userData.c !== c && l.castShadow) l.shadow.needsUpdate = true;
        l.position.copy(c.pos); if (c.apunta) l.target.position.copy(c.apunta); else l.target.position.set(c.pos.x, 0, c.pos.z); l.color.copy(c.color); l.userData.c = c;
      });
      this.puntos.forEach((l, i) => {
        const c = this.asignPuntos[i];
        if (!c) { l.intensity = 0; l.userData.c = null; return; }
        l.position.copy(c.pos); l.color.copy(c.color); l.userData.c = c;
      });
    }
    // sombras de farolas: actualización alterna (los zombis bajo ellas siguen moviéndose a 30+ Hz)
    this.cuadro = (this.cuadro || 0) + 1;
    for (let i = 0; i < this.focos.length; i++) { const l = this.focos[i]; if (l.castShadow && (this.cuadro + i) % 2 === 0) l.shadow.needsUpdate = true; }
    // parpadeo
    for (const l of [...this.focos, ...this.puntos]) {
      const c = l.userData.c; if (!c) continue;
      let k = 1;
      if (c.parpadeo === 1) { const s = Math.sin(tiempo * 23 + c.fase) + Math.sin(tiempo * 7.3 + c.fase * 2); k = s > 1.5 ? 0.05 : (Math.sin(tiempo * 0.7 + c.fase) > 0.93 ? 0.2 : 1); }
      else if (c.parpadeo === 2) k = 0.75 + 0.15 * Math.sin(tiempo * 17 + c.fase) + 0.1 * Math.sin(tiempo * 31 + c.fase * 3);
      l.intensity = c.intensidad * k;
    }
  }
}
