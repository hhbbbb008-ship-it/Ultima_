"""
Utilidades comunes de las pruebas de Última Noche (Playwright para Python).

- Sirve la carpeta del juego por HTTP en un puerto libre (hilo en segundo plano).
- Abre Chromium sin ventana con WebGL por software (SwiftShader).
- Espera a que termine la carga, entra al menú y arranca partidas.
- Recoge los errores de consola y de página para que cada prueba falle si aparece alguno.

Uso:  python3 pruebas/humo.py   (o cualquier otra prueba de esta carpeta)
Variable opcional: CHROMIUM=/ruta/al/chrome (por defecto /opt/pw-browsers/chromium si existe).
"""
import functools
import http.server
import os
import socketserver
import sys
import threading
from contextlib import contextmanager

from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROMIUM = os.environ.get('CHROMIUM') or ('/opt/pw-browsers/chromium' if os.path.exists('/opt/pw-browsers/chromium') else None)
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
# avisos conocidos del navegador sin GPU que no son fallos del juego
IGNORAR = ('GPU stall due to ReadPixels', 'GL Driver Message', 'WebGL: INVALID', 'Automatic fallback to software WebGL')


class _Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


@contextmanager
def servidor():
    manejador = functools.partial(_Silencioso, directory=RAIZ)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(('127.0.0.1', 0), manejador) as s:
        hilo = threading.Thread(target=s.serve_forever, daemon=True)
        hilo.start()
        try:
            yield f'http://127.0.0.1:{s.server_address[1]}/'
        finally:
            s.shutdown()


class Fallo(AssertionError):
    pass


def comprobar(cond, msg):
    if not cond:
        raise Fallo(msg)
    print(f'  ✔ {msg}')


@contextmanager
def navegador(movil=False):
    """Devuelve (page, errores). movil=True emula un celular en horizontal de 844×390 con pantalla táctil."""
    with servidor() as url, sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROMIUM, args=ARGS)
        if movil:
            ctx = b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36')
        else:
            ctx = b.new_context(viewport={'width': 1280, 'height': 720})
        page = ctx.new_page()
        errores = []
        page.on('pageerror', lambda e: errores.append(f'pageerror: {e}'))
        page.on('console', lambda m: errores.append(f'console.error: {m.text}') if m.type == 'error' and not any(i in m.text for i in IGNORAR) else None)
        page.goto(url)
        page.url_base = url
        try:
            yield page, errores
        finally:
            b.close()


def cargar(page, timeout=180_000):
    """Espera a que el juego termine de cargar (botón de entrar visible)."""
    page.wait_for_function("""() => !document.getElementById('bEntrar').classList.contains('oculto')
        || /Error/.test(document.getElementById('cargaTexto').textContent)""", timeout=timeout)
    texto = page.eval_on_selector('#cargaTexto', 'e => e.textContent')
    comprobar('Error' not in texto, f'el juego carga sin error ({texto.strip()})')


def entrar(page):
    """Pulsa ENTRAR (inicia el audio tras el gesto) y espera al menú principal."""
    page.click('#bEntrar')
    page.wait_for_function("() => document.getElementById('menuPrincipal').classList.contains('visible')", timeout=60_000)


def empezar_partida(page, modo='clasico', mapa='barrio', principal='subfusil', secundaria='pistola', cuerpo=''):
    page.evaluate("""async ([modo, mapa, equipo]) => { await window.__juego.partida.nueva(modo, mapa, equipo); }""",
                  [modo, mapa, {'secundaria': secundaria, 'principal': principal, 'cuerpo': cuerpo}])
    page.wait_for_function("() => window.__juego.partida.estado === 'jugando'", timeout=60_000)


def congelar(page):
    """Detiene la lógica de la partida (estado 'pausa' sin menú) para controlar el tiempo a mano."""
    page.evaluate("() => { window.__juego.partida.estado = 'pausa'; }")


def sin_errores(errores):
    comprobar(not errores, 'sin errores en la consola' + ('' if not errores else ':\n    ' + '\n    '.join(errores[:10])))


def ejecutar(nombre, fn):
    print(f'== {nombre}')
    try:
        fn()
    except Exception as e:  # noqa: BLE001 — se informa y se devuelve código de error
        print(f'  ✘ {type(e).__name__}: {e}')
        print(f'FALLÓ: {nombre}')
        sys.exit(1)
    print(f'OK: {nombre}')
