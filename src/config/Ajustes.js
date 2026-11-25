/**
 * Ajustes del juego: gráficos, generales, audio y controles.
 * Se guardan en localStorage y emiten eventos al cambiar.
 *
 * Los perfiles gráficos son combinaciones de valores reales que
 * consume config/Graficos.js para reconfigurar el motor.
 */

/** Definición de cada opción gráfica (la UI se genera a partir de esto). */
export const OPCIONES_GRAFICAS = [
  { clave: 'escalaRes', nombre: 'Resolución interna', tipo: 'rango', min: 0.5, max: 1.5, paso: 0.05,
    formato: v => Math.round(v * 100) + ' %', desc: 'Porcentaje de la resolución nativa usada para renderizar.' },
  { clave: 'texturas', nombre: 'Calidad de texturas', tipo: 'nivel',
    etiquetas: ['Muy baja (128 px)', 'Baja (256 px)', 'Media (512 px)', 'Alta (1024 px + relieve)', 'Ultra (2048 px + relieve)'],
    desc: 'Resolución de las texturas procedurales, mapas de normales y filtrado anisótropo. Regenerar tarda un instante.' },
  { clave: 'sombras', nombre: 'Calidad de sombras', tipo: 'nivel',
    etiquetas: ['Desactivadas', 'Bajas (512, duras)', 'Medias (1024, PCF)', 'Altas (2048, suaves)', 'Ultra (4096, suaves + farolas)'],
    desc: 'Resolución y filtrado del mapa de sombras. En Ultra las farolas cercanas también proyectan sombras.' },
  { clave: 'distancia', nombre: 'Distancia de renderizado', tipo: 'nivel',
    etiquetas: ['45 m', '65 m', '90 m', '120 m', '170 m'],
    desc: 'Plano lejano de la cámara y distancia a la que se ocultan sectores del mapa.' },
  { clave: 'detalle', nombre: 'Detalle de modelos (LOD)', tipo: 'nivel',
    etiquetas: ['Muy bajo', 'Bajo', 'Medio', 'Alto', 'Ultra'],
    desc: 'Polígonos de los zombis, distancias de cambio de LOD y cantidad de objetos decorativos.' },
  { clave: 'iluminacion', nombre: 'Calidad de iluminación', tipo: 'nivel',
    etiquetas: ['Básica (Lambert)', 'Baja (PBR, 2 luces)', 'Media (PBR, 4 luces)', 'Alta (PBR, 8 luces)', 'Ultra (PBR, 12 luces + sombras de linterna)'],
    desc: 'Modelo de sombreado y número de luces dinámicas activas a la vez.' },
  { clave: 'oclusion', nombre: 'Oclusión ambiental', tipo: 'nivel',
    etiquetas: ['Desactivada', 'GTAO (media resolución)', 'GTAO (resolución completa)'],
    desc: 'Sombreado de contacto en esquinas y uniones (Ground Truth AO).' },
  { clave: 'antialias', nombre: 'Antialiasing', tipo: 'lista',
    valores: ['no', 'fxaa', 'smaa', 'msaa4', 'msaa8'],
    etiquetas: ['Desactivado', 'FXAA', 'SMAA', 'MSAA 4x', 'MSAA 8x'],
    desc: 'Suavizado de bordes. MSAA es el más nítido y el más costoso.' },
  { clave: 'particulas', nombre: 'Efectos de partículas', tipo: 'nivel',
    etiquetas: ['Mínimos', 'Bajos', 'Medios', 'Altos', 'Ultra'],
    desc: 'Cantidad máxima y densidad de partículas (sangre, chispas, fuego, humo).' },
  { clave: 'efectos', nombre: 'Calidad de efectos visuales', tipo: 'nivel',
    etiquetas: ['Mínima', 'Baja', 'Media', 'Alta', 'Ultra'],
    desc: 'Luz del fogonazo, casquillos, trazadoras, número de calcas de sangre y duración de cadáveres.' },
  { clave: 'niebla', nombre: 'Calidad de niebla', tipo: 'nivel',
    etiquetas: ['Desactivada', 'Lineal', 'Exponencial', 'Exponencial + bruma baja', 'Ultra (bruma animada en capas)'],
    desc: 'Niebla atmosférica y capas de bruma volumétrica a ras de suelo.' },
  { clave: 'reflejos', nombre: 'Calidad de reflejos', tipo: 'nivel',
    etiquetas: ['Desactivados', 'Mapa de entorno estático', 'Charcos reflectantes (½ res.)', 'Charcos reflectantes (res. completa)'],
    desc: 'Reflejos en el asfalto mojado y en los charcos (render planar real).' },
  { clave: 'post', nombre: 'Postprocesamiento', tipo: 'nivel',
    etiquetas: ['Desactivado', 'Bajo (gradación de color)', 'Medio (+ bloom)', 'Alto (+ viñeta, grano, aberración)', 'Ultra (+ profundidad de campo)'],
    desc: 'Cadena de efectos de pantalla completa.' },
  { clave: 'resDinamica', nombre: 'Resolución dinámica', tipo: 'lista',
    valores: ['no', 'si'], etiquetas: ['Desactivada', 'Activada'],
    desc: 'Baja la resolución interna (hasta el 60 %) cuando los FPS caen por debajo del objetivo y la recupera cuando sobra rendimiento. Mantiene la fluidez en Ultra y en móviles.' },
  { clave: 'vsync', nombre: 'Sincronización vertical', tipo: 'lista',
    valores: ['si', 'no'], etiquetas: ['Activada', 'Desactivada'],
    desc: 'Activada: un fotograma por refresco del monitor. Desactivada: el bucle no espera al refresco (menor latencia de entrada; el navegador sigue presentando sincronizado).' },
  { clave: 'limiteFps', nombre: 'Límite de FPS', tipo: 'lista',
    valores: ['0', '30', '60', '90', '120', '144', '240'],
    etiquetas: ['Sin límite', '30', '60', '90', '120', '144', '240'],
    desc: 'Tope de fotogramas por segundo.' },
];

/** Perfiles predefinidos. 'personalizado' se activa al tocar cualquier opción. */
export const PERFILES = {
  muyBajo: { escalaRes: 0.6, texturas: 0, sombras: 0, distancia: 0, detalle: 0, iluminacion: 0, oclusion: 0, antialias: 'no', particulas: 0, efectos: 0, niebla: 1, reflejos: 0, post: 0 },
  bajo: { escalaRes: 0.8, texturas: 1, sombras: 1, distancia: 1, detalle: 1, iluminacion: 1, oclusion: 0, antialias: 'fxaa', particulas: 1, efectos: 1, niebla: 1, reflejos: 0, post: 1 },
  medio: { escalaRes: 1, texturas: 2, sombras: 2, distancia: 2, detalle: 2, iluminacion: 2, oclusion: 0, antialias: 'fxaa', particulas: 2, efectos: 2, niebla: 2, reflejos: 1, post: 2 },
  alto: { escalaRes: 1, texturas: 3, sombras: 3, distancia: 3, detalle: 3, iluminacion: 3, oclusion: 1, antialias: 'smaa', particulas: 3, efectos: 3, niebla: 3, reflejos: 2, post: 3 },
  ultra: { escalaRes: 1, texturas: 4, sombras: 4, distancia: 4, detalle: 4, iluminacion: 4, oclusion: 2, antialias: 'msaa4', particulas: 4, efectos: 4, niebla: 4, reflejos: 3, post: 4 },
};
export const NOMBRES_PERFIL = { muyBajo: 'Muy bajo', bajo: 'Bajo', medio: 'Medio', alto: 'Alto', ultra: 'Ultra', personalizado: 'Personalizado' };
export const ORDEN_PERFILES = ['muyBajo', 'bajo', 'medio', 'alto', 'ultra'];

/** Acciones de control reasignables. Los valores son KeyboardEvent.code o 'Mouse0/1/2'. */
export const ACCIONES = [
  ['adelante', 'Avanzar', 'KeyW'],
  ['atras', 'Retroceder', 'KeyS'],
  ['izquierda', 'Izquierda', 'KeyA'],
  ['derecha', 'Derecha', 'KeyD'],
  ['correr', 'Correr', 'ShiftLeft'],
  ['saltar', 'Saltar', 'Space'],
  ['dash', 'Dash de esquive', 'KeyQ'],
  ['disparar', 'Disparar', 'Mouse0'],
  ['apuntar', 'Apuntar', 'Mouse2'],
  ['recargar', 'Recargar', 'KeyR'],
  ['interactuar', 'Interactuar / comprar', 'KeyE'],
  ['cuchillo', 'Cuchillo', 'KeyV'],
  ['armaAnterior', 'Arma anterior', 'KeyZ'],
  ['linterna', 'Linterna', 'KeyF'],
  ['botiquin', 'Usar botiquín', 'KeyH'],
  ['granada', 'Lanzar granada', 'KeyG'],
  ['armaSiguiente', 'Arma siguiente', 'KeyX'],
  ['chaleco', 'Ponerse chaleco', 'KeyC'],
  ['bebida', 'Bebida energética (+1 carga de dash)', 'KeyB'],
  ['molotov', 'Lanzar molotov', 'KeyT'],
  ['arma1', 'Ranura 1 (pistolas)', 'Digit1'],
  ['arma2', 'Ranura 2 (subfusiles)', 'Digit2'],
  ['arma3', 'Ranura 3 (escopetas)', 'Digit3'],
  ['arma4', 'Ranura 4 (fusiles y lanzagranadas)', 'Digit4'],
  ['arma5', 'Ranura 5 (cuerpo a cuerpo)', 'Digit5'],
  ['rendimiento', 'Mostrar rendimiento', 'F3'],
];

const GENERALES = {
  sensibilidad: 1.0, invertirY: false, fov: 80, sacudida: 1.0,
  estilo: 'realista', asistencia: 'no', disenoHud: {}, tactil: 'auto', sensMando: 1.0, sensTactil: 1.0, tamBotones: 1.0, opacidadBotones: 0.75,
  volMaestro: 0.9, volMusica: 0.55, volEfectos: 0.9, volAmbiente: 0.7,
  mostrarFps: true, autoCalidad: false, gore: true, reticula: 'dinamica',
};

const CLAVE_LS = 'ultimaNoche.ajustes.v1';

export class Ajustes {
  constructor(eventos) {
    this.eventos = eventos;
    this.perfil = 'alto';
    this.g = { ...PERFILES.alto, vsync: 'si', limiteFps: '0', resDinamica: 'no' };
    this.gen = { ...GENERALES };
    this.controles = Object.fromEntries(ACCIONES.map(([a, , def]) => [a, def]));
    this.cargar();
  }

  /** Detecta un perfil inicial razonable según el hardware (solo la primera vez). */
  perfilInicialSegunHardware(renderer) {
    const nucleos = navigator.hardwareConcurrency || 4;
    const movil = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0);
    if (movil) { this.g.resDinamica = 'si'; this.gen.mostrarFps = false; }
    let gpu = '';
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    } catch (e) { /* sin info */ }
    if (movil || /SwiftShader|llvmpipe|Software/i.test(gpu)) return 'muyBajo';
    if (/Intel/i.test(gpu) && !/Arc/i.test(gpu)) return nucleos >= 8 ? 'medio' : 'bajo';
    if (/RTX|RX 6|RX 7|RX 9|Arc|Apple M[2-9]/i.test(gpu)) return 'ultra';
    return 'alto';
  }

  aplicarPerfil(nombre) {
    if (!PERFILES[nombre]) return;
    this.perfil = nombre;
    const antes = { ...this.g };
    Object.assign(this.g, PERFILES[nombre]);
    this.guardar();
    this.eventos.emit('ajustes:graficos', { antes, ahora: { ...this.g } });
  }

  setGrafico(clave, valor) {
    const antes = { ...this.g };
    this.g[clave] = valor;
    if (!['vsync', 'limiteFps', 'resDinamica'].includes(clave)) this.perfil = this.detectarPerfil();
    this.guardar();
    this.eventos.emit('ajustes:graficos', { antes, ahora: { ...this.g } });
  }

  /** Si los valores coinciden con un perfil, se muestra ese; si no, 'personalizado'. */
  detectarPerfil() {
    for (const [nombre, p] of Object.entries(PERFILES))
      if (Object.keys(p).every(k => this.g[k] === p[k])) return nombre;
    return 'personalizado';
  }

  setGeneral(clave, valor) {
    this.gen[clave] = valor;
    this.guardar();
    this.eventos.emit('ajustes:generales', { clave, valor });
  }

  setControl(accion, codigo) {
    // Si otra acción usa el mismo código, se intercambian
    const previa = Object.keys(this.controles).find(a => this.controles[a] === codigo);
    if (previa && previa !== accion) this.controles[previa] = this.controles[accion];
    this.controles[accion] = codigo;
    this.guardar();
    this.eventos.emit('ajustes:controles');
  }

  restaurarControles() {
    this.controles = Object.fromEntries(ACCIONES.map(([a, , def]) => [a, def]));
    this.guardar();
    this.eventos.emit('ajustes:controles');
  }

  guardar() {
    try {
      localStorage.setItem(CLAVE_LS, JSON.stringify({ perfil: this.perfil, g: this.g, gen: this.gen, controles: this.controles }));
    } catch (e) { /* almacenamiento no disponible */ }
  }

  /**
   * Acciones nuevas que no estaban en los controles guardados: si su tecla por defecto ya la
   * usa otra acción (p. ej. el dash en Q, que antes era "arma anterior"), esa otra acción pasa
   * a su nueva tecla por defecto siempre que esté libre. Así no quedan dos acciones en la misma tecla.
   */
  migrarControles(guardados) {
    let cambio = false;
    for (const [accion, , def] of ACCIONES) {
      if (accion in guardados) continue;
      const otra = Object.keys(this.controles).find(a => a !== accion && this.controles[a] === def);
      if (!otra) continue;
      const defOtra = ACCIONES.find(x => x[0] === otra)?.[2];
      if (defOtra && defOtra !== def && !Object.values(this.controles).includes(defOtra)) { this.controles[otra] = defOtra; cambio = true; }
    }
    if (cambio) this.guardar();
  }

  /**
   * Quita teclas repetidas y acciones que ya no existen en los controles guardados. Si dos acciones
   * comparten tecla, se queda la que la tiene por defecto (o la primera de la lista); la otra
   * recupera su tecla por defecto si está libre, o se queda sin tecla para que la asignes tú.
   */
  sanearControles() {
    let cambio = false;
    for (const a of Object.keys(this.controles)) if (!ACCIONES.some(x => x[0] === a)) { delete this.controles[a]; cambio = true; }
    const def = Object.fromEntries(ACCIONES.map(([a, , d]) => [a, d]));
    const porTecla = new Map();
    for (const [a] of ACCIONES) {
      const t = this.controles[a];
      if (!t) continue;
      if (!porTecla.has(t)) { porTecla.set(t, a); continue; }
      const otra = porTecla.get(t);
      const [queda, mueve] = def[a] === t && def[otra] !== t ? [a, otra] : [otra, a];
      porTecla.set(t, queda);
      const libre = def[mueve] && ![...Object.values(this.controles)].includes(def[mueve]);
      this.controles[mueve] = libre ? def[mueve] : '';
      if (libre) porTecla.set(def[mueve], mueve);
      cambio = true;
    }
    if (cambio) this.guardar();
  }

  cargar() {
    try {
      const d = JSON.parse(localStorage.getItem(CLAVE_LS) || 'null');
      if (!d) { this.primeraVez = true; return; }
      this.perfil = d.perfil || this.perfil;
      Object.assign(this.g, d.g || {});
      Object.assign(this.gen, d.gen || {});
      Object.assign(this.controles, d.controles || {});
      this.migrarControles(d.controles || {});
      this.sanearControles();
    } catch (e) { this.primeraVez = true; }
  }
}
