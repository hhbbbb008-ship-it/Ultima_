"""Prueba de humo: el juego carga, el menú y las pantallas se abren y no hay errores ni rastro de la estamina."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import navegador, cargar, entrar, comprobar, sin_errores, ejecutar


def prueba():
    with navegador() as (page, errores):
        cargar(page)
        info = page.evaluate("""() => { const j = window.__juego; return {
            sistemas: ['motor','mundo','jugador','armas','zombis','oleadas','partida','interfaz','tienda','municion','tactil','mando'].filter(k => !j[k]),
            mapa: j.mapaActual, sectores: j.mundo.sectores.size, cajas: j.colisiones.cajas.length, zombis: j.zombis.todos.length } }""")
        comprobar(not info['sistemas'], f"todos los sistemas existen (faltan: {info['sistemas']})")
        comprobar(info['sectores'] > 0 and info['cajas'] > 50, f"mapa {info['mapa']} construido ({info['sectores']} sectores, {info['cajas']} colisiones)")
        comprobar(info['zombis'] >= 20, f"reserva de zombis precreada ({info['zombis']})")
        entrar(page)
        # HUD: sin barra de estamina y con 3 cargas de dash junto a la salud
        comprobar(page.query_selector('#hEstamina') is None and page.query_selector('.barra.estamina') is None, 'no existe la barra de estamina')
        comprobar(page.eval_on_selector('#hudSalud #hDash', 'e => e.children.length') == 3, 'el HUD tiene 3 cargas de dash junto a la salud')
        # pantallas del menú
        for accion, pantalla in [('modos', 'pantallaModos'), ('tienda', 'pantallaTienda'), ('ajustes:general', 'pantallaAjustes'), ('creditos', 'pantallaCreditos')]:
            page.evaluate("a => window.__juego.interfaz.accion(a)", accion)
            comprobar(page.eval_on_selector('#' + pantalla, 'e => e.classList.contains("visible")'), f'se abre {pantalla}')
            page.evaluate("() => window.__juego.interfaz.accion('volver')")
        # configuración: pestañas y controles
        page.evaluate("() => window.__juego.interfaz.accion('ajustes:controles')")
        filas = page.evaluate("""() => [...document.querySelectorAll('#secControles .fila')].map(f => f.innerText.replace(/\\s+/g, ' '))""")
        dash = [f for f in filas if 'Dash de esquive' in f]
        comprobar(dash and dash[0].rstrip().endswith('Q'), f'acción "Dash de esquive" con Q por defecto ({dash})')
        anterior = [f for f in filas if 'Arma anterior' in f]
        comprobar(anterior and anterior[0].rstrip().endswith('Z'), f'"Arma anterior" sigue existiendo, ahora en Z ({anterior})')
        saltar = [f for f in filas if f.startswith('Saltar')]
        comprobar(bool(saltar) and ('Espacio' in saltar[0] or 'Space' in saltar[0]), f'saltar sigue en Espacio ({saltar})')
        texto = page.eval_on_selector('#pantallaAjustes', 'e => e.innerText').lower()
        comprobar('estamina' not in texto and 'resistencia' not in texto, 'ninguna opción habla de estamina o resistencia')
        comprobar('dash de esquive' in page.eval_on_selector('#secControles', 'e => e.innerText').lower(), 'la tabla del control menciona el dash')
        for p in ['general', 'graficos', 'audio', 'controles']:
            page.evaluate("p => window.__juego.interfaz.pestana(p)", p)
        page.evaluate("() => window.__juego.interfaz.accion('volver')")
        page.wait_for_timeout(500)
        sin_errores(errores)


if __name__ == '__main__':
    ejecutar('humo', prueba)
