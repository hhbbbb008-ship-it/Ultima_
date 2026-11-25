import { Guardado } from './Guardado.js';
import { ARMAS, BOTIQUIN, GRANADA, MOLOTOV } from '../armas/DefArmas.js';

/**
 * Tienda y monedas (progreso persistente entre partidas).
 *
 * - Las monedas se ganan matando zombis (según el tipo, +1 por tiro a la cabeza)
 *   y al superar oleadas. Se guardan al momento, así no se pierden si abandonas.
 * - Se gastan en la Tienda del menú: desbloquear armas para el equipamiento
 *   inicial, y comprar botiquines y granadas que se guardan en tu reserva.
 * - Al empezar una partida te llevas de la reserva hasta 3 botiquines y 4 granadas.
 *
 * Son independientes de los "puntos" de la partida, que siguen sirviendo para
 * comprar armas, munición y botiquines en las paredes.
 */
// el bate, el hacha y el marro vienen desbloqueados; la katana se gana matando Colosos
export const ARMAS_GRATIS = ['pistola', 'subfusil', 'bate', 'hacha', 'marro'];
export const PRECIOS_ARMAS = { toro: 150, recortada: 200, escopeta: 250, halcon: 350, martillo: 400, fusil: 450, lanzagranadas: 600 };
/** La katana no se compra: se gana al matar este número de Colosos (en total, entre todas las partidas). */
export const JEFES_KATANA = 5;
export const PRECIO_MOLOTOV = 30;
export const PRECIO_BOTIQUIN = 40;
export const PRECIO_GRANADA = 25;
export const LOTE_GRANADAS = { n: 5, precio: 110 };
export const PRECIO_CHALECO = 60;
export const PRECIO_BEBIDA = 20;
export const MAX_RESERVA = 20;
export const SUMINISTROS_MAX = { chalecos: 2, bebidas: 3, molotovs: MOLOTOV.max };
const MONEDAS_TIPO = { caminante: 1, corredor: 1, acorazado: 2, escupidor: 2, coloso: 15 };

export class Tienda {
  constructor(ctx) {
    this.ctx = ctx;
    this.d = Guardado.tienda();
    this.partida = 0;                       // monedas ganadas en la partida actual
    ctx.eventos.on('zombi:muerto', ({ tipo, parte }) => {
      if (!ctx.partida?.jugando) return;
      if (tipo === 'coloso') this.jefeMuerto();
      this.ganar((MONEDAS_TIPO[tipo] || 1) + (parte === 'cabeza' ? 1 : 0));
    });
    ctx.eventos.on('oleada:fin', ({ n }) => this.ganar(3 + n * 2));
  }

  get monedas() { return this.d.monedas; }
  guardar() { Guardado.guardarTienda(this.d); }

  ganar(n) {
    this.d.monedas += n; this.d.totalGanado = (this.d.totalGanado || 0) + n; this.partida += n;
    this.guardar();
    this.ctx.eventos.emit('monedas', { cant: n, total: this.d.monedas });
  }

  gastar(n) {
    if (this.d.monedas < n) return false;
    this.d.monedas -= n; this.guardar();
    this.ctx.audio.reproducir?.('compra', { bus: 'interfaz', reverb: 0 });
    return true;
  }

  get jefes() { return this.d.jefes || 0; }

  /** Cuenta los Colosos muertos; al llegar a JEFES_KATANA se desbloquea la katana. */
  jefeMuerto() {
    this.d.jefes = this.jefes + 1; this.guardar();
    if (this.d.jefes === JEFES_KATANA) this.ctx.eventos.emit('katana:desbloqueada');
    else if (this.d.jefes < JEFES_KATANA) this.ctx.eventos.emit('jefe:contado', { n: this.d.jefes, total: JEFES_KATANA });
  }

  desbloqueada(id) {
    if (id === 'katana') return this.jefes >= JEFES_KATANA;
    return ARMAS_GRATIS.includes(id) || this.d.armas.includes(id);
  }
  precioArma(id) { return PRECIOS_ARMAS[id] ?? 0; }

  /** Devuelve '' si se compró, o el motivo por el que no. */
  comprarArma(id) {
    if (this.desbloqueada(id)) return 'Ya la tienes';
    if (id === 'katana') return `Mata ${JEFES_KATANA} Colosos para conseguirla (llevas ${this.jefes})`;
    const p = this.precioArma(id);
    if (!this.gastar(p)) return `Te faltan ${p - this.d.monedas} monedas`;
    this.d.armas.push(id); this.guardar();
    return '';
  }
  comprarBotiquin() {
    if (this.d.botiquines >= MAX_RESERVA) return 'Reserva llena';
    if (!this.gastar(PRECIO_BOTIQUIN)) return `Te faltan ${PRECIO_BOTIQUIN - this.d.monedas} monedas`;
    this.d.botiquines++; this.guardar(); return '';
  }
  comprarChaleco() {
    if ((this.d.chalecos || 0) >= MAX_RESERVA) return 'Reserva llena';
    if (!this.gastar(PRECIO_CHALECO)) return `Te faltan ${PRECIO_CHALECO - this.d.monedas} monedas`;
    this.d.chalecos = (this.d.chalecos || 0) + 1; this.guardar(); return '';
  }
  comprarBebida() {
    if ((this.d.bebidas || 0) >= MAX_RESERVA) return 'Reserva llena';
    if (!this.gastar(PRECIO_BEBIDA)) return `Te faltan ${PRECIO_BEBIDA - this.d.monedas} monedas`;
    this.d.bebidas = (this.d.bebidas || 0) + 1; this.guardar(); return '';
  }
  comprarMolotov() {
    if ((this.d.molotovs || 0) >= MAX_RESERVA) return 'Reserva llena';
    if (!this.gastar(PRECIO_MOLOTOV)) return `Te faltan ${PRECIO_MOLOTOV - this.d.monedas} monedas`;
    this.d.molotovs = (this.d.molotovs || 0) + 1; this.guardar(); return '';
  }
  comprarGranadas(lote = false) {
    const n = lote ? LOTE_GRANADAS.n : 1, p = lote ? LOTE_GRANADAS.precio : PRECIO_GRANADA;
    if (this.d.granadas + n > MAX_RESERVA) return 'Reserva llena';
    if (!this.gastar(p)) return `Te faltan ${p - this.d.monedas} monedas`;
    this.d.granadas += n; this.guardar(); return '';
  }

  /** Lo que te llevarás a la próxima partida desde la reserva. */
  suministros() {
    const d = this.d;
    return {
      botiquines: Math.min(d.botiquines, BOTIQUIN.max), granadas: Math.min(d.granadas, GRANADA.max),
      chalecos: Math.min(d.chalecos || 0, SUMINISTROS_MAX.chalecos), bebidas: Math.min(d.bebidas || 0, SUMINISTROS_MAX.bebidas),
      molotovs: Math.min(d.molotovs || 0, SUMINISTROS_MAX.molotovs),
    };
  }

  /** Al empezar una partida: saca los suministros de la reserva. */
  tomarSuministros() {
    const s = this.suministros();
    this.d.botiquines -= s.botiquines; this.d.granadas -= s.granadas;
    this.d.chalecos = (this.d.chalecos || 0) - s.chalecos; this.d.bebidas = (this.d.bebidas || 0) - s.bebidas;
    this.d.molotovs = (this.d.molotovs || 0) - s.molotovs;
    this.partida = 0;
    this.guardar();
    return s;
  }

  /** Nombre legible de un arma (para la interfaz). */
  static nombre(id) { return ARMAS[id]?.nombre || id; }
}
