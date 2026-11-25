/**
 * Registro de mapas. Para añadir uno nuevo: crear su archivo en esta carpeta
 * (ver BarrioCenizas.js como plantilla) y añadirlo a esta lista.
 */
import { BarrioCenizas } from './BarrioCenizas.js';
import { HospitalSanJudas } from './HospitalSanJudas.js';
import { Ruta9 } from './Ruta9.js';
import { GranjaAlamos } from './GranjaAlamos.js';

export const MAPAS = Object.fromEntries([BarrioCenizas, HospitalSanJudas, Ruta9, GranjaAlamos].map(m => [m.id, m]));
export const ORDEN_MAPAS = ['barrio', 'hospital', 'autopista', 'granja'];
