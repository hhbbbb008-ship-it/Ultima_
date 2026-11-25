/**
 * Tipos de zombi (diseños originales). Velocidades en m/s, daño por golpe.
 * vida se multiplica por la dificultad de la oleada y del modo.
 */
export const TIPOS = {
  caminante: {
    nombre: 'Caminante', vida: 110, vel: [1.1, 1.7], velAlerta: [1.6, 2.4], dano: 22, alcance: 1.35,
    preparacion: 0.5, recuperacion: 0.7, escala: 1.0, radio: 0.32, puntos: 60, masa: 1,
    piel: 'pielCaminante', ojos: 'ojos', voz: 'caminante', anim: 'andar',
  },
  corredor: {
    nombre: 'Corredor', vida: 70, vel: [3.6, 4.2], velAlerta: [4.6, 5.3], dano: 13, alcance: 1.25,
    preparacion: 0.28, recuperacion: 0.45, escala: 0.96, radio: 0.3, puntos: 80, masa: 0.8,
    piel: 'pielCorredor', ojos: 'ojos', voz: 'corredor', anim: 'correr', delgado: true,
  },
  acorazado: {
    nombre: 'Acorazado', vida: 330, vel: [1.3, 1.6], velAlerta: [1.7, 2.1], dano: 30, alcance: 1.4,
    preparacion: 0.6, recuperacion: 0.8, escala: 1.08, radio: 0.38, puntos: 130, masa: 1.8,
    piel: 'pielAcorazado', ojos: 'ojos', voz: 'acorazado', anim: 'andar',
    armadura: 0.5, cascoVida: 120,          // el torso recibe la mitad; el casco absorbe disparos a la cabeza
  },
  escupidor: {
    nombre: 'Escupidor', vida: 150, vel: [1.6, 1.9], velAlerta: [2.0, 2.4], dano: 16, alcance: 1.3,
    preparacion: 0.5, recuperacion: 0.7, escala: 1.02, radio: 0.36, puntos: 140, masa: 1.3,
    piel: 'pielEscupidor', ojos: 'ojos', voz: 'escupidor', anim: 'andar',
    distancia: 9, rangoEscupir: 19, recargaEscupir: 3.2, danoAcido: 16,
  },
  coloso: {
    nombre: 'Coloso', vida: 1900, vel: [1.8, 2.0], velAlerta: [2.1, 2.4], dano: 45, alcance: 2.5,
    preparacion: 0.75, recuperacion: 1.1, escala: 1.62, radio: 0.72, puntos: 650, masa: 6,
    piel: 'pielColoso', ojos: 'ojosRojos', voz: 'coloso', anim: 'andar', jefe: true,
    velCarga: 8, rangoCarga: [5, 16], recargaCarga: 7, danoCarga: 38,
  },
};
