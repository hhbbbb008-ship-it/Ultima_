/**
 * Guardado de la partida (punto de control al inicio de cada oleada), récords
 * por modo y mapa, y la última selección de mapa/modo del menú.
 */
const CLAVE = 'ultimaNoche.partida.v1';
const CLAVE_RECORD = 'ultimaNoche.records.v1';
const CLAVE_SEL = 'ultimaNoche.seleccion.v1';
const CLAVE_TIENDA = 'ultimaNoche.tienda.v1';
/** Estado inicial de la cartera: unas monedas y dos granadas para probar la tienda. */
const TIENDA_INICIAL = { monedas: 60, armas: [], botiquines: 0, granadas: 2, chalecos: 0, bebidas: 0, molotovs: 0, jefes: 0, totalGanado: 0 };

const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? def; } catch (e) { return def; } };
const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };

/** Clave de récord: modo + mapa (las partidas antiguas sin mapa cuentan como Barrio Cenizas). */
export const claveRecord = (modo, mapa = 'barrio') => `${modo}|${mapa}`;

export const Guardado = {
  guardar(datos) { escribir(CLAVE, { ...datos, fecha: Date.now() }); },
  cargar() { const g = leer(CLAVE, null); if (g && !g.mapa) g.mapa = 'barrio'; return g; },
  borrar() { try { localStorage.removeItem(CLAVE); } catch (e) { /* nada */ } },
  hay() { return !!this.cargar(); },
  records() {
    const r = leer(CLAVE_RECORD, {});
    for (const k of Object.keys(r)) if (!k.includes('|')) { r[claveRecord(k)] ??= r[k]; delete r[k]; }   // migración
    return r;
  },
  record(modo, mapa) { return this.records()[claveRecord(modo, mapa)]; },
  /** Registra un resultado; devuelve true si es un nuevo récord para ese modo y mapa. */
  registrar(modo, mapa, total, oleada) {
    const r = this.records(), k = claveRecord(modo, mapa);
    const nuevo = !r[k] || total > r[k].total;
    if (nuevo) r[k] = { total, oleada, fecha: Date.now() };
    escribir(CLAVE_RECORD, r);
    return nuevo;
  },
  seleccion() { return leer(CLAVE_SEL, {}); },
  tienda() { return { ...TIENDA_INICIAL, ...leer(CLAVE_TIENDA, {}) }; },
  guardarTienda(t) { escribir(CLAVE_TIENDA, t); },
  guardarSeleccion(sel) { escribir(CLAVE_SEL, sel); },
};
