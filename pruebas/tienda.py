"""Prueba de la Tienda: monedas, compras, límites, desbloqueo de armas, suministros al empezar
y la nueva bebida energética (mismo precio y límite; ahora recupera una carga de dash)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import navegador, cargar, entrar, empezar_partida, comprobar, sin_errores, ejecutar

J = 'window.__juego'


def prueba():
    with navegador() as (page, errores):
        cargar(page); entrar(page)
        consts = page.evaluate("""async () => { const t = await import('./src/juego/Tienda.js');
            return { bebida: t.PRECIO_BEBIDA, max: t.MAX_RESERVA, sum: t.SUMINISTROS_MAX.bebidas, botiquin: t.PRECIO_BOTIQUIN, toro: t.PRECIOS_ARMAS.toro }; }""")
        comprobar(consts['bebida'] == 20 and consts['max'] == 20 and consts['sum'] == 3, f'bebida: mismo precio (20) y límites (reserva 20, te llevas 3) {consts}')
        T = f'{J}.tienda'
        page.evaluate(f"() => {{ {T}.d.monedas = 2000; {T}.d.bebidas = 0; {T}.d.botiquines = 0; {T}.d.armas = []; {T}.guardar(); }}")
        # comprar bebida
        e = page.evaluate(f"() => {T}.comprarBebida()")
        comprobar(e == '' and page.evaluate(f"() => {T}.d.bebidas") == 1 and page.evaluate(f"() => {T}.monedas") == 1980, 'comprar una bebida cuesta 20 monedas')
        # límite de reserva
        page.evaluate(f"() => {{ {T}.d.bebidas = 20; }}")
        comprobar(page.evaluate(f"() => {T}.comprarBebida()") == 'Reserva llena', 'no se pasa de 20 bebidas en reserva')
        page.evaluate(f"() => {{ {T}.d.bebidas = 5; }}")
        # botiquín y arma
        comprobar(page.evaluate(f"() => {T}.comprarBotiquin()") == '' and page.evaluate(f"() => {T}.d.botiquines") == 1, 'comprar botiquín')
        comprobar(page.evaluate(f"() => {T}.comprarArma('toro')") == '' and page.evaluate(f"() => {T}.desbloqueada('toro')"), 'desbloquear el Toro .45')
        comprobar(page.evaluate(f"() => {T}.comprarArma('toro')") == 'Ya la tienes', 'no se compra dos veces')
        comprobar('Colosos' in page.evaluate(f"() => {T}.comprarArma('katana')"), 'la katana no se compra')
        page.evaluate(f"() => {{ {T}.d.monedas = 5; }}")
        comprobar('Te faltan' in page.evaluate(f"() => {T}.comprarBebida()"), 'sin monedas suficientes no se compra')
        # pantalla de la tienda: texto nuevo de la bebida
        page.evaluate(f"() => {J}.interfaz.accion('tienda')")
        texto = page.eval_on_selector('#tSuministros', 'e => e.innerText')
        comprobar('carga de dash' in texto and 'estamina' not in texto.lower() and '15 s' not in texto, 'la tarjeta de la bebida explica que recupera una carga de dash')
        page.evaluate(f"() => {J}.interfaz.accion('volver')")
        # al empezar se lleva hasta 3 bebidas de la reserva
        empezar_partida(page, secundaria='toro')
        r = page.evaluate(f"() => [{J}.jugador.bebidas, {T}.d.bebidas, {J}.armas.inventario.toro ? 1 : 0]")
        comprobar(r == [3, 2, 1], f'se lleva 3 bebidas (quedan 2 en reserva) y el Toro desbloqueado ({r})')
        # monedas al matar zombis y al superar oleadas
        m0 = page.evaluate(f"() => {T}.monedas")
        page.evaluate(f"() => {J}.eventos.emit('zombi:muerto', {{ zombi: {{ def: {J}.zombis.todos.find(z => z.tipo === 'acorazado').def }}, tipo: 'acorazado', parte: 'cabeza', pos: {J}.jugador.pos.clone() }})")
        page.evaluate(f"() => {J}.eventos.emit('oleada:fin', {{ n: 2, bono: 0 }})")
        comprobar(page.evaluate(f"() => {T}.monedas") - m0 == 3 + 7, 'monedas por acorazado con tiro a la cabeza (3) y por oleada 2 (7)')
        page.wait_for_timeout(300)
        sin_errores(errores)


if __name__ == '__main__':
    ejecutar('tienda', prueba)
