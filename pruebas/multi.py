"""Multijugador en el navegador: dos (o más) jugadores contra el servidor local de salas.

Requiere el servidor:  sh pruebas/servidor_local.sh   (http://127.0.0.1:8787)
Uso: CHROMIUM=/usr/bin/google-chrome python3 pruebas/multi.py [fase]
     fase = lobby | remotos | zombis | dano | skins | reglas | todo (por defecto)
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contextlib import contextmanager
from playwright.sync_api import sync_playwright
from comun import CHROMIUM, ARGS, IGNORAR, comprobar, ejecutar

BASE = os.environ.get('MULTI_URL', 'http://127.0.0.1:8787/')
FASE = sys.argv[1] if len(sys.argv) > 1 else 'todo'


@contextmanager
def jugadores(n=2):
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROMIUM, args=ARGS)
        paginas = []
        for i in range(n):
            ctx = b.new_context(viewport={'width': 960, 'height': 540}, service_workers='block')
            p = ctx.new_page()
            p.errores = []
            p.on('pageerror', lambda e, p=p: p.errores.append(f'pageerror: {e}'))
            p.on('console', lambda m, p=p: p.errores.append(f'console.error: {m.text}') if m.type == 'error' and not any(x in m.text for x in IGNORAR) else None)
            paginas.append(p)
        try:
            yield paginas
        finally:
            b.close()


def abrir(p, extra=''):
    p.goto(BASE + extra)
    p.wait_for_function("() => !document.getElementById('bEntrar').classList.contains('oculto')", timeout=180_000)
    p.click('#bEntrar')
    p.wait_for_function("() => document.getElementById('menuPrincipal').classList.contains('visible')", timeout=60_000)


def crear(p, nombre='Ana'):
    p.click('[data-accion="multi"]')
    p.fill('#salaNombre', nombre)
    p.click('[data-accion="salaCrear"]')
    p.wait_for_function("() => /^[A-Z]{4}$/.test(document.getElementById('salaCodigo').textContent)", timeout=15_000)
    return p.eval_on_selector('#salaCodigo', 'e => e.textContent')


def unir(p, codigo, nombre='Beto'):
    p.click('[data-accion="multi"]')
    p.fill('#salaNombre', nombre)
    p.fill('#salaCodigoIn', codigo)
    p.click('[data-accion="salaUnir"]')


def filas(p):
    return p.eval_on_selector_all('#salaLista li', 'ls => ls.map(l => l.textContent)')


def sin_errores(ps):
    errs = [e for p in ps for e in p.errores]
    comprobar(not errs, 'sin errores en la consola' + ('' if not errs else ':\n    ' + '\n    '.join(errs[:8])))


def empezar_sala(a, ps):
    """El anfitrión empieza la partida (equipo por defecto) y todos entran al mapa."""
    a.click('[data-accion="salaEmpezar"]')
    a.click('[data-accion="empezar"]')
    for p in ps:
        p.wait_for_function("() => window.__juego.partida.estado === 'jugando' && window.__juego.partida.modoSala", timeout=60_000)
        p.evaluate("() => { window.__juego.partida.dios = true; }")   # que nadie muera durante la prueba


def lobby():
    with jugadores(2) as (a, b):
        abrir(a); abrir(b)
        cod = crear(a, 'Ana')
        comprobar(True, f'el anfitrión crea la sala {cod}')
        unir(b, cod.lower(), 'Beto')
        b.wait_for_function("() => document.querySelectorAll('#salaLista li').length === 2", timeout=15_000)
        a.wait_for_function("() => document.querySelectorAll('#salaLista li').length === 2", timeout=15_000)
        a.wait_for_function("() => document.getElementById('salaLista').textContent.includes('Beto')", timeout=15_000)
        fa, fb = filas(a), filas(b)
        comprobar(any('Ana' in f and 'anfitri' in f.lower() for f in fb), f'el cliente ve al anfitrión por su nombre ({fb})')
        comprobar(any('Beto' in f for f in fa), f'el anfitrión ve al cliente por su nombre ({fa})')
        comprobar(a.is_visible('[data-accion="salaEmpezar"]') and not b.is_visible('[data-accion="salaEmpezar"]'), 'solo el anfitrión puede empezar')
        # código inválido
        b.click('[data-accion="salaSalir"]')
        a.wait_for_function("() => document.querySelectorAll('#salaLista li').length === 1", timeout=15_000)
        comprobar(True, 'al salir el cliente, el anfitrión ve 1 jugador')
        b.fill('#salaCodigoIn', 'ab1')
        b.click('[data-accion="salaUnir"]')
        b.wait_for_function("() => document.getElementById('salaError').textContent.length > 0", timeout=5_000)
        comprobar('código' in b.eval_on_selector('#salaError', 'e => e.textContent').lower(), 'un código inválido muestra error y no entra')
        sin_errores([a, b])
    # servidor caído
    with jugadores(1) as (c,):
        abrir(c, '?servidor=ws://127.0.0.1:9')
        c.click('[data-accion="multi"]')
        c.click('[data-accion="salaCrear"]')
        c.wait_for_function("() => document.getElementById('salaError').textContent.length > 0", timeout=15_000)
        comprobar('conectar' in c.eval_on_selector('#salaError', 'e => e.textContent').lower(), 'sin servidor avisa "no se pudo conectar"')


def todo():
    for f in FASES.values():
        if f is not todo:
            f()


FASES = {'lobby': lobby, 'todo': todo}

if __name__ == '__main__':
    ejecutar('multi ' + FASE, FASES[FASE])
