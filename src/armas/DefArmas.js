/**
 * Definición de armas (valores de balance). Ángulos en grados, tiempos en segundos.
 * tipo: 'semi' (un disparo por clic), 'auto' (automática), 'bomba' (acción de corredera).
 * ranura: tecla de categoría (1 pistolas · 2 subfusiles · 3 escopetas · 4 fusiles).
 * Se pueden llevar todas; pulsar la tecla de una ranura otra vez alterna entre sus armas.
 * recargaTipo: 'cargador' (por defecto), 'cartucho' (de uno en uno) o 'basculante' (dos cañones a la vez).
 */
/**
 * Ajustes globales de armas.
 * BONO_RECARGA: multiplicador de la velocidad de recarga de todas las armas de fuego
 * (1.08 = un 8 % más rápido: el tiempo de recarga es el de la tabla dividido entre 1.08).
 * Los tiempos de la tabla se dejan con sus valores base; se aplica en tiempoRecarga().
 */
export const C = { BONO_RECARGA: 1.08 };

/**
 * Tiempo real (en segundos) de una fase de recarga de un arma: recarga, recargaVacia,
 * recargaInicio, recargaCartucho o recargaFin, ya con el bono aplicado.
 * Las armas cuerpo a cuerpo no recargan y no se ven afectadas.
 */
export function tiempoRecarga(def, clave) {
  const t = def[clave];
  return def.cuerpo ? t : t / C.BONO_RECARGA;
}

export const ARMAS = {
  pistola: {
    id: 'pistola', desc: 'Pistola fiable y precisa. Mucha munición.', nombre: 'P-9 Centinela', corto: 'P-9', ranura: 1, tipo: 'semi',
    dano: 34, multCabeza: 2.6, perdigones: 1, cadencia: 0.13,
    cargador: 12, reservaInicial: 96, reservaMax: 160,
    recarga: 1.35, recargaVacia: 1.7,
    dispCadera: 1.4, dispApuntar: 0.22, dispMovimiento: 1.3, dispSalto: 4, aumentoDisp: 0.55, recuperacionDisp: 7,
    retroceso: { v: 1.7, h: 0.6 }, zoom: 0.84, alcance: [16, 42], danoMin: 0.6,
    velMov: 1.0, tiempoApuntar: 0.14, penetracion: 1, sonido: 'disparo_pistola', trazadora: false, patada: 4.5, fogonazo: 0.8,
  },
  toro: {
    id: 'toro', desc: 'Pistola pesada: pocos disparos, mucho daño y atraviesa a dos zombis.', nombre: 'Toro .45', corto: 'Toro', ranura: 1, tipo: 'semi',
    dano: 72, multCabeza: 2.4, perdigones: 1, cadencia: 0.24,
    cargador: 8, reservaInicial: 64, reservaMax: 128,
    recarga: 1.55, recargaVacia: 1.95,
    dispCadera: 1.8, dispApuntar: 0.18, dispMovimiento: 1.6, dispSalto: 5, aumentoDisp: 1.1, recuperacionDisp: 6,
    retroceso: { v: 3.6, h: 1.0 }, zoom: 0.82, alcance: [18, 45], danoMin: 0.62,
    velMov: 1.0, tiempoApuntar: 0.15, penetracion: 2, sonido: 'disparo_toro', trazadora: false, patada: 7, fogonazo: 1.15,
  },
  subfusil: {
    id: 'subfusil', desc: 'Automático y ligero. Ideal para hordas a media distancia.', nombre: 'Avispa SMG', corto: 'Avispa', ranura: 2, tipo: 'auto',
    dano: 23, multCabeza: 2.2, perdigones: 1, cadencia: 60 / 850,
    cargador: 30, reservaInicial: 240, reservaMax: 390,
    recarga: 2.0, recargaVacia: 2.45,
    dispCadera: 2.5, dispApuntar: 0.75, dispMovimiento: 1.6, dispSalto: 5, aumentoDisp: 0.28, recuperacionDisp: 6,
    retroceso: { v: 0.55, h: 0.5 }, zoom: 0.8, alcance: [10, 30], danoMin: 0.55,
    velMov: 1.0, tiempoApuntar: 0.17, penetracion: 1, sonido: 'disparo_subfusil', trazadora: 3, patada: 3, fogonazo: 1,
  },
  escopeta: {
    id: 'escopeta', desc: 'Corredera de 6 cartuchos. Devastadora de cerca, recarga cartucho a cartucho.', nombre: 'Segadora 12', corto: 'Segadora', ranura: 3, tipo: 'bomba', recargaTipo: 'cartucho',
    dano: 17, multCabeza: 1.6, perdigones: 9, cadencia: 0.82,
    cargador: 6, reservaInicial: 48, reservaMax: 80,
    recargaInicio: 0.35, recargaCartucho: 0.5, recargaFin: 0.3,
    dispCadera: 5.2, dispApuntar: 3.6, dispMovimiento: 1, dispSalto: 2, aumentoDisp: 0, recuperacionDisp: 6,
    retroceso: { v: 5.5, h: 1.6 }, zoom: 0.88, alcance: [6, 20], danoMin: 0.25,
    velMov: 0.95, tiempoApuntar: 0.2, penetracion: 1, sonido: 'disparo_escopeta', trazadora: false, patada: 7, fogonazo: 1.6,
  },
  recortada: {
    id: 'recortada', desc: 'Dos cañones: dos disparos brutales a quemarropa y recarga rápida.', nombre: 'Recortada Mula', corto: 'Mula', ranura: 3, tipo: 'semi', recargaTipo: 'basculante',
    dano: 19, multCabeza: 1.5, perdigones: 11, cadencia: 0.2,
    cargador: 2, reservaInicial: 32, reservaMax: 60,
    recarga: 1.75, recargaVacia: 1.75,
    dispCadera: 7.2, dispApuntar: 5.6, dispMovimiento: 0.8, dispSalto: 2, aumentoDisp: 0, recuperacionDisp: 6,
    retroceso: { v: 7.5, h: 2.2 }, zoom: 0.92, alcance: [4, 13], danoMin: 0.2,
    velMov: 1.0, tiempoApuntar: 0.15, penetracion: 1, sonido: 'disparo_recortada', trazadora: false, patada: 9, fogonazo: 1.9,
  },
  martillo: {
    id: 'martillo', desc: 'Escopeta semiautomática de cargador: dispara tan rápido como pulses.', nombre: 'Martillo S12', corto: 'Martillo', ranura: 3, tipo: 'semi',
    dano: 15, multCabeza: 1.6, perdigones: 8, cadencia: 0.21,
    cargador: 8, reservaInicial: 56, reservaMax: 96,
    recarga: 2.3, recargaVacia: 2.8,
    dispCadera: 5.0, dispApuntar: 3.4, dispMovimiento: 1.1, dispSalto: 2.5, aumentoDisp: 0.6, recuperacionDisp: 5,
    retroceso: { v: 4.0, h: 1.4 }, zoom: 0.86, alcance: [7, 22], danoMin: 0.25,
    velMov: 0.93, tiempoApuntar: 0.2, penetracion: 1, sonido: 'disparo_martillo', trazadora: false, patada: 6, fogonazo: 1.5,
  },
  fusil: {
    id: 'fusil', desc: 'Fusil automático equilibrado, bueno a cualquier distancia.', nombre: 'Lince AR', corto: 'Lince', ranura: 4, tipo: 'auto',
    dano: 42, multCabeza: 2.4, perdigones: 1, cadencia: 60 / 620,
    cargador: 30, reservaInicial: 210, reservaMax: 360,
    recarga: 2.3, recargaVacia: 2.85,
    dispCadera: 2.3, dispApuntar: 0.28, dispMovimiento: 2, dispSalto: 6, aumentoDisp: 0.32, recuperacionDisp: 5.5,
    retroceso: { v: 0.95, h: 0.55 }, zoom: 0.68, alcance: [28, 65], danoMin: 0.65,
    velMov: 0.92, tiempoApuntar: 0.22, penetracion: 2, sonido: 'disparo_fusil', trazadora: 2, patada: 3, fogonazo: 1,
  },
  lanzagranadas: {
    id: 'lanzagranadas', desc: 'Dispara granadas que explotan al chocar (radio de 5 m). ¡No lo uses a quemarropa!', nombre: 'Lanzagranadas Tifón', corto: 'Tifón', ranura: 4, tipo: 'semi',
    proyectil: { vel: 34, grav: 9, dano: 300, radio: 5, danoJugador: 50 },
    dano: 300, multCabeza: 1, perdigones: 1, cadencia: 0.5,
    cargador: 1, reservaInicial: 10, reservaMax: 20,
    recarga: 1.5, recargaVacia: 1.5,
    dispCadera: 1.2, dispApuntar: 0.3, dispMovimiento: 1, dispSalto: 3, aumentoDisp: 0, recuperacionDisp: 5,
    retroceso: { v: 4.5, h: 1.0 }, zoom: 0.85, alcance: [40, 70], danoMin: 1,
    velMov: 0.9, tiempoApuntar: 0.22, penetracion: 1, sonido: 'disparo_lanzagranadas', trazadora: false, patada: 8, fogonazo: 1.4,
  },
  halcon: {
    id: 'halcon', desc: 'Fusil de tirador con mira telescópica. Atraviesa a tres zombis.', nombre: 'Halcón DMR', corto: 'Halcón', ranura: 4, tipo: 'semi',
    dano: 105, multCabeza: 2.6, perdigones: 1, cadencia: 0.27,
    cargador: 10, reservaInicial: 70, reservaMax: 130,
    recarga: 2.4, recargaVacia: 2.95,
    dispCadera: 3.0, dispApuntar: 0.04, dispMovimiento: 2.4, dispSalto: 7, aumentoDisp: 0.9, recuperacionDisp: 5,
    retroceso: { v: 2.4, h: 0.7 }, zoom: 0.42, alcance: [40, 90], danoMin: 0.75,
    velMov: 0.9, tiempoApuntar: 0.3, penetracion: 3, sonido: 'disparo_halcon', trazadora: 1, patada: 5, fogonazo: 1.2, mira: true,
  },
};

/** Valores neutros de disparo para armas cuerpo a cuerpo (no usan munición ni dispersión). */
const BASE_CUERPO = {
  ranura: 5, tipo: 'cuerpo', cuerpo: true, perdigones: 1, multCabeza: 1, cargador: 0, reservaInicial: 0, reservaMax: 0,
  recarga: 1, recargaVacia: 1, dispCadera: 1, dispApuntar: 1, dispMovimiento: 0, dispSalto: 0, aumentoDisp: 0, recuperacionDisp: 6,
  retroceso: { v: 0, h: 0 }, zoom: 1, danoMin: 1, tiempoApuntar: 0.2, penetracion: 1, trazadora: false, patada: 0, fogonazo: 0,
};

/**
 * Armas cuerpo a cuerpo (ranura 5). alcance en metros, angulo = medio ángulo del arco en radianes,
 * cadencia = duración del golpe, golpe = fracción de la animación en la que impacta,
 * objetivos = zombis que puede alcanzar de un barrido, empuje y aturdir (segundos).
 * barrido: efecto visual de media luna (solo estético, no cambia el daño):
 *   color, escala (tamaño), duracion (s), vertical (arco de arriba abajo) y
 *   retraso (s desde el inicio del golpe; si falta, empieza al acabar la preparación).
 */
export const ARMAS_CUERPO = {
  bate: {
    ...BASE_CUERPO, id: 'bate', nombre: 'Bate de béisbol', corto: 'Bate', desc: 'Golpe contundente que aturde y alcanza a dos zombis. Rápido y sin munición.',
    dano: 85, alcance: [2.4, 2.4], angulo: 0.75, cadencia: 0.55, golpe: 0.42, objetivos: 2, empuje: 6, aturdir: 0.5,
    velMov: 1.0, sonido: 'arma_pesada_aire', impacto: 'golpe_romo',
    barrido: { color: 0xffc98a, escala: 0.72, duracion: 0.16 },                  // corto y rápido
  },
  hacha: {
    ...BASE_CUERPO, id: 'hacha', nombre: 'Hacha de bombero', corto: 'Hacha', desc: 'Corte brutal a un solo zombi: mata de un golpe a los débiles en las primeras oleadas.',
    dano: 150, alcance: [2.3, 2.3], angulo: 0.55, cadencia: 0.72, golpe: 0.45, objetivos: 1, empuje: 4, aturdir: 0.35,
    velMov: 0.97, sonido: 'arma_pesada_aire', impacto: 'golpe_filo',
    barrido: { color: 0xff6a4e, escala: 0.9, duracion: 0.24, vertical: true },   // arco vertical
  },
  marro: {
    ...BASE_CUERPO, id: 'marro', nombre: 'Marro (martillo de demolición)', corto: 'Marro', desc: 'Martillo pesado y lento: aplasta hasta a tres zombis, los lanza lejos y los deja aturdidos.',
    dano: 230, alcance: [2.6, 2.6], angulo: 0.8, cadencia: 1.1, golpe: 0.5, objetivos: 3, empuje: 11, aturdir: 1.0,
    velMov: 0.88, sonido: 'arma_pesada_aire', impacto: 'golpe_romo',
    barrido: { color: 0x9fbcff, escala: 1.4, duracion: 0.46 },                   // amplio y lento
  },
  katana: {
    ...BASE_CUERPO, id: 'katana', nombre: 'Katana', corto: 'Katana', desc: 'Barrido amplio que alcanza a cinco zombis: arranca la armadura y el casco de un tajo y mata de un golpe a los débiles. Se desbloquea al matar 5 Colosos.',
    dano: 170, alcance: [2.9, 2.9], angulo: 1.0, cadencia: 0.48, golpe: 0.4, objetivos: 5, empuje: 5, aturdir: 0.4,
    velMov: 1.05, sonido: 'barrido', impacto: 'golpe_filo',
    barrido: { color: 0xffffff, escala: 1, duracion: 0.26, retraso: 0 },         // media luna blanca original
  },
};

// también forman parte del arsenal general (inventario, ranuras, guardado)
Object.assign(ARMAS, ARMAS_CUERPO);

export const CUCHILLO = { dano: 165, alcance: 2.1, angulo: 0.55, duracion: 0.55, golpe: 0.15, empuje: 3 };

/** Botiquín: curación, duración de la animación de uso y capacidad. */
export const BOTIQUIN = { cura: 60, duracion: 1.15, momento: 0.75, max: 3 };

/**
 * Granada de fragmentación: daño máximo en el centro con caída hasta 'radio' (necesita
 * línea de visión), daño al jugador si está cerca, mecha en segundos y velocidad de lanzamiento.
 */
export const GRANADA = { dano: 320, radio: 6.5, danoJugador: 55, mecha: 2.3, vel: 15, max: 4, lanzamiento: 0.55, suelta: 0.22, rebote: 0.38 };

/**
 * Cajas de munición que sueltan los zombis (~1 de cada 6-7, y siempre el Coloso).
 * Cantidad de balas por arma: el arma que llevas en la mano recibe la cantidad completa
 * y el resto de armas que tienes, el 60 % (sin pasar de su reserva máxima).
 * Además, al superar cada oleada llegan 2 cargadores de reabastecimiento para cada arma.
 */
export const CAJA_MUNICION = {
  cada: [5, 8],             // cada cuántas bajas cae una caja (al azar en este intervalo: media 1 de cada 6-7)
  vida: 40,                 // segundos en el suelo
  otras: 0.6,               // fracción que reciben las armas que no llevas en la mano
  balas: { pistola: 72, toro: 32, subfusil: 90, escopeta: 24, recortada: 20, martillo: 32, fusil: 90, halcon: 30, lanzagranadas: 3 },
  oleada: 2,                // cargadores de reabastecimiento para cada arma al superar una oleada
};

/** Armas elegibles en el equipamiento inicial. */
export const SECUNDARIAS = ['pistola', 'toro'];
export const PRINCIPALES = ['subfusil', 'escopeta', 'recortada', 'martillo', 'fusil', 'halcon', 'lanzagranadas'];
/** Armas cuerpo a cuerpo elegibles (además del cuchillo, que siempre llevas en la tecla V). */
export const CUERPO = ['bate', 'hacha', 'marro', 'katana'];

/** Molotov: se rompe al chocar y deja un charco de fuego que quema a los zombis. */
export const MOLOTOV = { vel: 14, radio: 3.2, duracion: 7, dps: 60, dpsJugador: 18, max: 3, lanzamiento: 0.6, suelta: 0.25 };

/**
 * Asistencia de apuntado (moderada a propósito):
 * cono: grados en los que el disparo se "dobla" hacia el objetivo; tiron: fracción de esa corrección
 * (nunca 1: sigue haciendo falta apuntar). friccion: multiplicador de sensibilidad con la mira sobre
 * un zombi. iman: al empezar a apuntar, giro parcial (imanK) hacia un objetivo dentro de ese cono.
 */
export const ASISTENCIA = {
  baja: { cono: 3, tiron: 0.6, conoFric: 4.5, friccion: 0.72, iman: 0, imanK: 0, seguir: 0, seguirVel: 0 },
  // nivel por defecto: se nota claramente (corrige el disparo, la mira acompaña al zombi y
  // al apuntar "salta" hacia él), pero hay que apuntar más o menos en su dirección
  media: { cono: 7, tiron: 0.9, conoFric: 9, friccion: 0.5, iman: 12, imanK: 0.75, seguir: 10, seguirVel: 5 },
  alta: { cono: 10, tiron: 1, conoFric: 12, friccion: 0.4, iman: 18, imanK: 0.9, seguir: 14, seguirVel: 9 },
};

export const ORDEN_ARMAS = ['pistola', 'toro', 'subfusil', 'escopeta', 'recortada', 'martillo', 'fusil', 'halcon', 'lanzagranadas', 'bate', 'hacha', 'marro', 'katana'];
