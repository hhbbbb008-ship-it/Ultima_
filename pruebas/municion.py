"""Prueba de munición: cajas que sueltan los zombis, reparto (arma en mano completa, resto 60 %),
tope de reserva, reabastecimiento al superar oleada y compra de munición en la pared."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import navegador, cargar, entrar, empezar_partida, congelar, comprobar, sin_errores, ejecutar

J = 'window.__juego'


def prueba():
    with navegador() as (page, errores):
        cargar(page); entrar(page)
        empezar_partida(page, principal='subfusil', secundaria='pistola')
        page.evaluate(f"() => {{ {J}.partida.dios = true; }}")
        congelar(page)
        A = f'{J}.armas'
        page.evaluate(f"() => {{ const i = {A}.inventario; i.subfusil.reserva = 0; i.pistola.reserva = 0; {J}.armas.equipar('subfusil'); }}")
        # caja de munición junto al jugador
        page.evaluate(f"() => {{ const p = {J}.jugador.pos; {J}.municion.crear({{ x: p.x + 0.5, z: p.z }}); }}")
        comprobar(page.evaluate(f"() => {J}.municion.activas.length") == 1, 'se crea una caja de munición')
        page.evaluate(f"() => {J}.municion.actualizar(0.016)")
        r = page.evaluate(f"() => [{A}.inventario.subfusil.reserva, {A}.inventario.pistola.reserva, {J}.municion.activas.length]")
        comprobar(r == [90, 44, 0], f'recoger: subfusil en mano +90, pistola +60 % de 72 = 44, la caja desaparece ({r})')
        # tope de la reserva
        page.evaluate(f"() => {{ const i = {A}.inventario; i.subfusil.reserva = i.subfusil.def.reservaMax - 10; }}")
        page.evaluate(f"() => {J}.municion.repartir()")
        comprobar(page.evaluate(f"() => {A}.inventario.subfusil.reserva === {A}.inventario.subfusil.def.reservaMax"), 'nunca supera la reserva máxima')
        # todo lleno: la caja se queda
        page.evaluate(f"() => {{ for (const e of Object.values({A}.inventario)) e.reserva = e.def.reservaMax; const p = {J}.jugador.pos; {J}.municion.crear({{ x: p.x, z: p.z }}); {J}.municion.actualizar(0.016); }}")
        comprobar(page.evaluate(f"() => {J}.municion.activas.length") == 1, 'con todo lleno la caja se queda en el suelo')
        page.evaluate(f"() => {J}.municion.limpiar()")
        # caja al morir zombis (cada 5-8 bajas) y siempre el Coloso
        page.evaluate(f"() => {{ {J}.partida.estado = 'jugando'; for (let k = 0; k < 8; k++) {J}.eventos.emit('zombi:muerto', {{ zombi: {{ def: {J}.zombis.todos.find(z => z.tipo === 'caminante').def }}, tipo: 'caminante', parte: 'torso', pos: {{ x: 30, y: 0, z: 30 }} }}); }}")
        comprobar(page.evaluate(f"() => {J}.municion.activas.length") >= 1, 'cae una caja como mucho cada 8 bajas')
        n = page.evaluate(f"() => {J}.municion.activas.length")
        page.evaluate(f"() => {J}.eventos.emit('zombi:muerto', {{ zombi: {{ def: {J}.zombis.todos.find(z => z.tipo === 'coloso').def }}, tipo: 'coloso', parte: 'torso', pos: {{ x: -30, y: 0, z: -30 }} }})")
        comprobar(page.evaluate(f"() => {J}.municion.activas.length") == n + 1, 'el Coloso siempre suelta una caja')
        congelar(page)
        # caducan a los 40 s
        page.evaluate(f"() => {J}.municion.actualizar(41)")
        comprobar(page.evaluate(f"() => {J}.municion.activas.length") == 0, 'las cajas desaparecen a los 40 s')
        # reabastecimiento al superar oleada
        page.evaluate(f"() => {{ const i = {A}.inventario; i.subfusil.reserva = 0; i.pistola.reserva = 0; {J}.municion.reabastecer(); }}")
        r = page.evaluate(f"() => [{A}.inventario.subfusil.reserva, {A}.inventario.pistola.reserva]")
        comprobar(r == [60, 24], f'reabastecimiento: 2 cargadores por arma ({r})')
        # munición en la pared (mitad de precio si ya tienes el arma)
        page.evaluate(f"() => {{ {J}.puntuacion.puntos = 5000; }}")
        r = page.evaluate(f"""() => {{ const e = {A}.estaciones.find(x => x.arma === 'subfusil'); const info = {A}.infoEstacion(e);
            const antes = {J}.puntuacion.puntos; {A}.comprar(e); return [info.precio, e.precio, antes - {J}.puntuacion.puntos, {A}.inventario.subfusil.reserva === {A}.inventario.subfusil.def.reservaMax]; }}""")
        comprobar(r[0] == r[1] // 2 and r[2] == r[0] and r[3], f'comprar munición en la pared cuesta la mitad y llena la reserva ({r})')
        page.wait_for_timeout(300)
        sin_errores(errores)


if __name__ == '__main__':
    ejecutar('municion', prueba)
