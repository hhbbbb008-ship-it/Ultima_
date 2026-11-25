"""Prueba de la recarga +8 %: con C.BONO_RECARGA = 1.08 el tiempo de recarga es el de la tabla
dividido entre 1.08 (subfusil táctica y en vacío, escopeta cartucho a cartucho), medido avanzando
el sistema de armas fotograma a fotograma. Las armas cuerpo a cuerpo no se ven afectadas."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import navegador, cargar, entrar, empezar_partida, congelar, comprobar, sin_errores, ejecutar

J = 'window.__juego'
# recarga el arma 'id' (con 'municion' balas en el cargador) y mide cuánto tarda en quedar lista
MEDIR = """([id, municion]) => { const A = window.__juego.armas;
  if (!A.inventario[id]) A.dar(id, false);
  A.equipar(id); A.estado = 'listo'; A.golpeT = -1; A.cuchilloT = -1;
  const a = A.inventario[id]; a.municion = municion; a.reserva = a.def.reservaMax;
  A.iniciarRecarga();
  if (A.estado !== 'recargando') return -1;
  const dt = 1 / 1000; let t = 0;
  while (A.estado === 'recargando' && t < 20) { A.actualizarEstado(dt); t += dt; }
  return { t, total: A.recargaTotal ?? null, lleno: a.municion === a.def.cargador }; }"""


def prueba():
    with navegador() as (page, errores):
        cargar(page); entrar(page)
        info = page.evaluate("""async () => { const m = await import('./src/armas/DefArmas.js'); const s = m.ARMAS.subfusil, e = m.ARMAS.escopeta;
            return { bono: m.C.BONO_RECARGA, recarga: s.recarga, vacia: s.recargaVacia, ini: e.recargaInicio, cart: e.recargaCartucho, fin: e.recargaFin, cargE: e.cargador,
              cuerpo: m.tiempoRecarga(m.ARMAS.bate, 'recarga') === m.ARMAS.bate.recarga }; }""")
        B = info['bono']
        comprobar(B == 1.08, f'C.BONO_RECARGA = {B}')
        comprobar(info['recarga'] == 2.0 and info['vacia'] == 2.45, 'la tabla del subfusil conserva sus valores base (2,0 s / 2,45 s)')
        empezar_partida(page)
        congelar(page)
        r = page.evaluate(MEDIR, ['subfusil', 10])
        esperado = info['recarga'] / B
        comprobar(abs(r['t'] - esperado) < 0.003 and r['lleno'], f"subfusil, recarga táctica: {r['t']:.3f} s = 2,0 / 1,08 = {esperado:.3f} s (antes 2,000 s; {100 * (1 - r['t'] / info['recarga']):.1f} % menos)")
        r = page.evaluate(MEDIR, ['subfusil', 0])
        esperado = info['vacia'] / B
        comprobar(abs(r['t'] - esperado) < 0.003 and r['lleno'], f"subfusil, recarga en vacío: {r['t']:.3f} s = 2,45 / 1,08 = {esperado:.3f} s")
        # escopeta de corredera desde vacía: inicio + 6 cartuchos + fin, todo con el bono
        r = page.evaluate(MEDIR, ['escopeta', 0])
        esperado = (info['ini'] + info['cargE'] * info['cart'] + info['fin']) / B
        comprobar(abs(r['t'] - esperado) < 0.01 and r['lleno'], f"escopeta cartucho a cartucho: {r['t']:.3f} s = {esperado:.3f} s")
        # con otro bono el tiempo cambia (una sola constante global)
        page.evaluate("async () => { const m = await import('./src/armas/DefArmas.js'); m.C.BONO_RECARGA = 2; }")
        r = page.evaluate(MEDIR, ['subfusil', 10])
        comprobar(abs(r['t'] - 1.0) < 0.003, f"cambiando solo C.BONO_RECARGA a 2 la recarga pasa a {r['t']:.3f} s")
        page.evaluate("async () => { const m = await import('./src/armas/DefArmas.js'); m.C.BONO_RECARGA = 1.08; }")
        comprobar(info['cuerpo'], 'las armas cuerpo a cuerpo no se ven afectadas')
        sin_errores(errores)


if __name__ == '__main__':
    ejecutar('recarga', prueba)
