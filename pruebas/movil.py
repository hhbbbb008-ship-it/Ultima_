"""Prueba en celular emulado (844×390, horizontal, pantalla táctil): el botón ⇥ de dash y las tres
cargas del HUD se ven dentro de la pantalla, no tapan otros botones y responden al toque.
Guarda capturas en la carpeta indicada por CAPTURAS (por defecto pruebas/capturas)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import navegador, cargar, entrar, empezar_partida, comprobar, sin_errores, ejecutar

J = 'window.__juego'
CAPTURAS = os.environ.get('CAPTURAS') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'capturas')


def caja(page, sel):
    return page.eval_on_selector(sel, """e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e);
        return { x: r.x, y: r.y, w: r.width, h: r.height, visible: s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05 && r.width > 0 }; }""")


def solapan(a, b):
    return a['x'] < b['x'] + b['w'] and b['x'] < a['x'] + a['w'] and a['y'] < b['y'] + b['h'] and b['y'] < a['y'] + a['h']


def dentro(c):
    return c['x'] >= 0 and c['y'] >= 0 and c['x'] + c['w'] <= 844 and c['y'] + c['h'] <= 390


def prueba():
    os.makedirs(CAPTURAS, exist_ok=True)
    with navegador(movil=True) as (page, errores):
        cargar(page); entrar(page)
        comprobar(page.evaluate(f"() => {J}.tactil.activo"), 'los controles táctiles se activan solos')
        empezar_partida(page)
        page.evaluate(f"() => {{ {J}.partida.dios = true; {J}.jugador.bebidas = 2; }}")
        page.wait_for_timeout(800)
        b = caja(page, '#tactil .tb.dash')
        comprobar(b['visible'] and dentro(b), f"el botón ⇥ se ve dentro de la pantalla ({b['x']:.0f}, {b['y']:.0f}, {b['w']:.0f}×{b['h']:.0f})")
        comprobar(b['w'] >= 44, f"tamaño cómodo para el pulgar ({b['w']:.0f} px)")
        otros = page.evaluate("""() => [...document.querySelectorAll('#tactil .tb')].filter(e => !e.classList.contains('dash') && !e.classList.contains('oculto') && getComputedStyle(e).display !== 'none')
            .map(e => { const r = e.getBoundingClientRect(); return { c: e.className, x: r.x, y: r.y, w: r.width, h: r.height }; })""")
        choques = [o['c'] for o in otros if solapan(b, o)]
        comprobar(not choques, f'no tapa ningún otro botón ({choques})')
        comprobar('⇥' in page.inner_text('#tactil .tb.dash') and '3' in page.inner_text('#tactil .tb.dash small'), 'el botón muestra ⇥ y el contador de cargas (3)')
        h = caja(page, '#hDash')
        comprobar(h['visible'] and dentro(h), f"las 3 cargas se ven junto a la salud ({h['x']:.0f}, {h['y']:.0f}, {h['w']:.0f}×{h['h']:.0f})")
        s = caja(page, '#hSaludBarra')
        comprobar(0 <= h['y'] - (s['y'] + s['h']) < 12 and abs(h['x'] - s['x']) < 12, 'las cargas están justo debajo de la barra de vida')
        # no desplazan el resto del bloque de salud (mismas posiciones que en la versión anterior)
        bot, gra = caja(page, '#hBotiquines'), caja(page, '#hGranadas')
        comprobar(abs(bot['x'] - 279) <= 3 and abs(gra['x'] - 317) <= 3, f"botiquines y granadas siguen en su sitio (x = {bot['x']:.0f} y {gra['x']:.0f})")
        page.screenshot(path=os.path.join(CAPTURAS, 'movil_dash_lleno.png'))

        # tocar el botón: gasta una carga, se ilumina durante el impulso y el HUD lo refleja
        centro = (b['x'] + b['w'] / 2, b['y'] + b['h'] / 2)
        page.touchscreen.tap(*centro)
        page.wait_for_function(f"() => {J}.jugador.dashCargas === 2", timeout=3000)
        comprobar(True, 'tocar ⇥ hace el dash (3 → 2 cargas)')
        page.wait_for_timeout(400)
        page.touchscreen.tap(*centro)
        page.wait_for_function(f"() => {J}.jugador.dashCargas === 1", timeout=3000)
        page.wait_for_timeout(500)
        llenas = page.evaluate("() => [...document.querySelectorAll('#hDash i')].map(i => i.classList.contains('llena'))")
        comprobar(llenas == [True, False, False], f'el HUD muestra 1 carga llena y 2 vacías ({llenas})')
        comprobar('1' in page.inner_text('#tactil .tb.dash small'), 'el contador del botón baja a 1')
        page.screenshot(path=os.path.join(CAPTURAS, 'movil_dash_recargando.png'))
        # bebida táctil ⚡: recupera una carga
        bb = caja(page, '#tactil .tb.bebida')
        page.touchscreen.tap(bb['x'] + bb['w'] / 2, bb['y'] + bb['h'] / 2)
        page.wait_for_function(f"() => {J}.jugador.dashCargas === 2 && {J}.jugador.bebidas === 1", timeout=3000)
        comprobar(True, 'el botón ⚡ (bebida) recupera una carga')
        # el editor del HUD permite mover el botón de dash
        page.evaluate(f"() => {{ {J}.partida.pausar(); {J}.editorHud.abrir('menuPausa'); }}")
        page.wait_for_timeout(300)
        b2 = caja(page, '#tactil .tb.dash')
        page.touchscreen.tap(b2['x'] + b2['w'] / 2, b2['y'] + b2['h'] / 2)
        page.wait_for_timeout(200)
        nombre = page.inner_text('#edNombre')
        comprobar('Dash' in nombre, f'el editor del HUD táctil incluye el botón de dash ("{nombre.strip()}")')
        page.screenshot(path=os.path.join(CAPTURAS, 'movil_editor_hud.png'))
        page.click('#edCancelar')
        page.wait_for_timeout(300)
        sin_errores(errores)


if __name__ == '__main__':
    ejecutar('movil', prueba)
