"""Prueba del dash de esquive:
- 3 cargas: 3 usos seguidos funcionan y el cuarto queda bloqueado.
- Las cargas vuelven de una en una, cada C.DASH_RECARGA segundos.
- Invulnerable durante el impulso (C.DASH_DURACION) y vulnerable después.
- Empuja hacia donde te mueves, o hacia atrás si estás quieto.
- La bebida energética recupera una carga al instante (y no se gasta con las cargas llenas).
- Funciona con la tecla Q, con el botón 1 del control y la bebida con la B.
La lógica se congela (estado 'pausa') y se avanza el tiempo a mano, fotograma a fotograma."""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import navegador, cargar, entrar, empezar_partida, congelar, comprobar, sin_errores, ejecutar

J = 'window.__juego'
# avanza la lógica del jugador 'seg' segundos a 60 FPS (sin entrada pulsada)
PASO = """(seg) => { const c = window.__juego, j = c.jugador; let t = 0;
  while (t < seg - 1e-9) { const dt = Math.min(1 / 60, seg - t); j.actualizar(dt, c.entrada); t += dt; } c.entrada.finFotograma(); }"""


def prueba():
    with navegador() as (page, errores):
        cargar(page); entrar(page)
        C = page.evaluate("async () => { const m = await import('./src/jugador/Jugador.js'); return m.C; }")
        comprobar(C['DASH_CARGAS'] == 3 and C['DASH_RECARGA'] == 4 and abs(C['DASH_DURACION'] - 0.2) < 1e-9,
                  f"constantes: DASH_CARGAS={C['DASH_CARGAS']}, DASH_RECARGA={C['DASH_RECARGA']} s, DASH_DURACION={C['DASH_DURACION']} s")
        R, D = C['DASH_RECARGA'], C['DASH_DURACION']
        empezar_partida(page)
        congelar(page)
        page.evaluate(f"""() => {{ const c = {J}; c.zombis.limpiar(); c.partida.dios = false; c.oleadas.estado = 'inactiva';
            const j = c.jugador; j.pos.set(0, 0, 10); j.vel.set(0, 0, 0); j.yaw = 0; j.salud = 100; j.bebidas = 2; }}""")
        paso = lambda s: page.evaluate(PASO, s)
        estado = lambda: page.evaluate(f"() => {{ const j = {J}.jugador; return {{ cargas: j.dashCargas, t: j.dashRecargaT, dashT: j.dashT, salud: j.salud, x: j.pos.x, z: j.pos.z, bebidas: j.bebidas }}; }}")
        comprobar(estado()['cargas'] == 3, 'empieza con 3 cargas')

        # --- invulnerabilidad durante el impulso (primer dash, hacia delante = -z)
        e0 = estado()
        comprobar(page.evaluate(f"() => {J}.jugador.dash(0, -1)"), 'dash 1 hacia delante')
        page.evaluate(f"() => {J}.jugador.recibirDano(40, null, 'golpe')")
        comprobar(estado()['salud'] == 100, 'invulnerable durante el impulso: un golpe de 40 no hace daño')
        paso(D * 0.5)
        page.evaluate(f"() => {J}.jugador.recibirDano(40, null, 'golpe')")
        comprobar(estado()['salud'] == 100, 'sigue invulnerable a mitad del impulso')
        paso(D * 0.5 + 1 / 60)
        e1 = estado()
        comprobar(e1['dashT'] == 0, 'el impulso termina tras C.DASH_DURACION')
        avance = e0['z'] - e1['z']
        comprobar(avance > 0.8 * C['DASH_VEL'] * D and abs(e1['x'] - e0['x']) < 0.2, f'empuja hacia donde te mueves ({avance:.2f} m hacia delante)')
        page.evaluate(f"() => {J}.jugador.recibirDano(40, null, 'golpe')")
        comprobar(estado()['salud'] == 60, 'después del impulso vuelve a recibir daño (100 → 60)')
        page.evaluate(f"() => {{ {J}.jugador.salud = 100; }}")

        # --- dash 2 sin moverse: hacia atrás (+z)
        z0 = estado()['z']
        comprobar(page.evaluate(f"() => {J}.jugador.dash(0, 0)"), 'dash 2 (quieto)')
        comprobar(not page.evaluate(f"() => {J}.jugador.dash(0, 0)"), 'no se encadena otro dash mientras dura el impulso')
        paso(D + 1 / 60)
        comprobar(estado()['z'] - z0 > 0.8 * C['DASH_VEL'] * D, f"quieto: el dash va hacia atrás ({estado()['z'] - z0:.2f} m)")
        # --- dash 3 y cuarto bloqueado
        comprobar(page.evaluate(f"() => {J}.jugador.dash(1, 0)"), 'dash 3')
        paso(D + 1 / 60)
        e = estado()
        comprobar(e['cargas'] == 0, 'tras 3 usos quedan 0 cargas')
        comprobar(not page.evaluate(f"() => {J}.jugador.dash(1, 0)") and estado()['cargas'] == 0 and estado()['dashT'] == 0, 'el cuarto dash queda bloqueado')

        # --- recarga de una en una cada DASH_RECARGA s (empieza a contar desde el primer dash)
        transcurrido = 3 * (D + 1 / 60)          # tiempo avanzado desde el primer dash
        e = estado()
        comprobar(abs(e['t'] - transcurrido) < 0.02, f"la recarga corre desde que falta la primera carga ({e['t']:.2f} s)")
        paso(R - transcurrido - 0.05)
        comprobar(estado()['cargas'] == 0, f'a los {R - 0.05:.2f} s del primer dash aún no ha vuelto ninguna carga')
        paso(0.1)
        comprobar(estado()['cargas'] == 1, f'a los {R:.0f} s (C.DASH_RECARGA) vuelve una carga')
        paso(R - 0.1)
        comprobar(estado()['cargas'] == 1, 'la segunda no vuelve antes de otros C.DASH_RECARGA s (de una en una)')
        paso(0.1)
        comprobar(estado()['cargas'] == 2, 'la segunda carga vuelve a los 2 × C.DASH_RECARGA s')
        # --- la bebida recupera una carga al instante
        comprobar(page.evaluate(f"() => {J}.jugador.beberBebida()"), 'beber una bebida')
        e = estado()
        comprobar(e['cargas'] == 3 and e['bebidas'] == 1 and e['t'] == 0, f"la bebida recupera 1 carga al instante (3/3, quedan {e['bebidas']} bebidas)")
        paso(R + 1)
        comprobar(estado()['cargas'] == 3 and estado()['t'] == 0, 'con las cargas llenas la recarga no avanza')
        comprobar(not page.evaluate(f"() => {J}.jugador.beberBebida()") and estado()['bebidas'] == 1, 'con las cargas llenas la bebida no se gasta')
        page.evaluate(f"() => {J}.jugador.dash(0, 0)"); paso(D + 0.02)
        page.evaluate(f"() => {{ {J}.jugador.bebidas = 0; }}")
        comprobar(not page.evaluate(f"() => {J}.jugador.beberBebida()") and estado()['cargas'] == 2, 'sin bebidas no se recupera nada')

        # --- entrada real: tecla Q, tecla B y botón 1 del control (la partida en marcha)
        page.evaluate(f"() => {{ const j = {J}.jugador; j.dashCargas = 3; j.dashRecargaT = 0; j.bebidas = 1; j.pos.set(0, 0, 12); j.vel.set(0, 0, 0); {J}.partida.dios = true; {J}.partida.estado = 'jugando'; }}")
        page.keyboard.press('q')
        page.wait_for_function(f"() => {J}.jugador.dashCargas === 2", timeout=3000)
        comprobar(True, 'la tecla Q hace el dash')
        page.wait_for_timeout(400)
        page.keyboard.press('b')
        page.wait_for_function(f"() => {J}.jugador.dashCargas === 3 && {J}.jugador.bebidas === 0", timeout=3000)
        comprobar(True, 'la tecla B (bebida) recupera la carga')
        page.wait_for_timeout(300)
        page.evaluate("""() => { const botones = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
            window.__mandoFalso = { index: 0, connected: true, id: 'prueba', axes: [0, 0, 0, 0], buttons: botones };
            navigator.getGamepads = () => [window.__mandoFalso]; }""")
        page.evaluate("() => { window.__mandoFalso.buttons[1] = { pressed: true, value: 1 }; }")
        page.wait_for_function(f"() => {J}.jugador.dashCargas === 2", timeout=3000)
        page.evaluate("() => { window.__mandoFalso.buttons[1] = { pressed: false, value: 0 }; }")
        comprobar(True, 'el botón 1 del control (B / ○) hace el dash')
        cargas = page.evaluate(f"() => [...document.querySelectorAll('#hDash i')].map(i => i.classList.contains('llena'))")
        comprobar(cargas == [True, True, False], f'el HUD muestra 2 de 3 cargas llenas ({cargas})')
        page.wait_for_timeout(300)
        sin_errores(errores)


if __name__ == '__main__':
    ejecutar('dash', prueba)
