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


def preparar(ps):
    a = ps[0]
    for p in ps:
        abrir(p)
    cod = crear(a, 'Ana')
    for i, p in enumerate(ps[1:]):
        unir(p, cod, ['Beto', 'Ceci', 'Dani'][i])
        p.wait_for_function("() => window.__juego.red.activa", timeout=15_000)
    a.wait_for_function(f"() => window.__juego.red.jugadores.length === {len(ps)}", timeout=15_000)
    empezar_sala(a, ps)
    return cod


REMOTO = """() => { const r = [...window.__juego.remotos.lista.values()][0];
    return r ? { x: r.raiz.position.x, z: r.raiz.position.z, visible: r.raiz.visible } : null }"""


def remotos():
    with jugadores(2) as (a, b):
        preparar([a, b])
        # el anfitrión se teletransporta y camina; el cliente lo ve llegar
        a.evaluate("() => { const j = window.__juego.jugador; j.pos.set(3, j.pos.y, 3); }")
        b.wait_for_timeout(1000)
        r = b.evaluate(REMOTO)
        comprobar(r and r['visible'] and abs(r['x'] - 3) < 1 and abs(r['z'] - 3) < 1, f'el cliente ve al anfitrión en su posición (±1 m): {r}')
        ra = a.evaluate(REMOTO)
        comprobar(ra is not None, 'el anfitrión también ve al cliente')
        # pestaña "en segundo plano": deja de enviar 2 s → el remoto se queda quieto, sin derivar
        a.evaluate("() => { window.__juego.red._vaciar = window.__juego.red.vaciar; window.__juego.red.vaciar = () => {}; }")
        a.evaluate("() => { const j = window.__juego.jugador; j.pos.set(5, j.pos.y, 3); }")
        b.wait_for_timeout(2000)
        quieto = b.evaluate(REMOTO)
        comprobar(abs(quieto['x'] - 3) < 0.5, f'sin mensajes el remoto no se mueve ni deriva ({quieto})')
        a.evaluate("() => { window.__juego.red.vaciar = window.__juego.red._vaciar; }")
        muestras = [quieto['x']]
        for _ in range(16):
            b.wait_for_timeout(25)
            muestras.append(b.evaluate(REMOTO)['x'])
        saltos = max(abs(muestras[i + 1] - muestras[i]) for i in range(len(muestras) - 1))
        comprobar(abs(muestras[-1] - 5) < 0.5 and saltos < 1.2, f'al volver los mensajes se mueve suave hasta la nueva posición (salto máx {saltos:.2f} m, final {muestras[-1]:.2f})')
        # pausa en sala: el mundo no se congela para los demás
        a.evaluate("() => window.__juego.partida.pausar()")
        a.evaluate("() => { const j = window.__juego.jugador; j.pos.set(6, j.pos.y, 6); }")
        b.wait_for_timeout(800)
        rp = b.evaluate(REMOTO)
        comprobar(abs(rp['x'] - 6) < 1, f'con el anfitrión en pausa se sigue enviando su estado ({rp})')
        # sale el cliente: el anfitrión deja de verlo
        b.evaluate("() => window.__juego.partida.salirAlMenu()")
        a.wait_for_function("() => window.__juego.remotos.lista.size === 0", timeout=10_000)
        comprobar(True, 'cuando un jugador sale, su cuerpo desaparece para los demás')
        sin_errores([a, b])


ESTADO_Z = """() => { const j = window.__juego; return {
    vivos: j.zombis.contarVivos(), n: j.oleadas.n, est: j.oleadas.estado, rest: j.oleadas.restantes,
    replicas: j.zombis.activos.filter(z => z.replica).length,
    pos: Object.fromEntries(j.zombis.activos.filter(z => z.vivo).map(z => [z.id, [z.pos.x, z.pos.z]])) } }"""


def iniciar_oleada(a):
    a.evaluate("() => { const o = window.__juego.oleadas; if (o.estado === 'preparacion') o.cuenta = 0; }")


def zombis():
    with jugadores(2) as (a, b):
        preparar([a, b])
        iniciar_oleada(a)
        a.wait_for_function("() => window.__juego.zombis.contarVivos() >= 4", timeout=30_000)
        b.wait_for_timeout(1500)
        ha, hb = a.evaluate(ESTADO_Z), b.evaluate(ESTADO_Z)
        comprobar(ha['n'] == hb['n'] and hb['est'] == 'activa', f"misma oleada en ambos (anfitrión {ha['n']}/{ha['est']}, cliente {hb['n']}/{hb['est']})")
        comprobar(abs(ha['vivos'] - hb['vivos']) <= 2 and hb['replicas'] >= 1, f"el cliente ve los mismos zombis (anfitrión {ha['vivos']}, cliente {hb['vivos']}, réplicas {hb['replicas']})")
        comprobar(abs(ha['rest'] - hb['rest']) <= 2, f"mismos zombis restantes en el HUD ({ha['rest']} / {hb['rest']})")
        comunes = [k for k in ha['pos'] if k in hb['pos']]
        err = max(abs(ha['pos'][k][0] - hb['pos'][k][0]) + abs(ha['pos'][k][1] - hb['pos'][k][1]) for k in comunes) if comunes else 99
        comprobar(comunes and err < 2.5, f'las réplicas están donde los zombis del anfitrión (error máx {err:.2f} m)')
        comprobar(a.evaluate("() => window.__juego.zombis.activos.every(z => !z.replica)"), 'el anfitrión no tiene réplicas: simula él')
        # objetivo: un zombi va a por el jugador vivo más cercano (aquí, el cliente)
        zid = a.evaluate("""() => { const j = window.__juego, z = j.zombis.activos.find(z => z.vivo && z.estado !== 'emerger');
            j.jugador.pos.set(z.pos.x + 25, j.jugador.pos.y, z.pos.z + 25); return [z.id, z.pos.x, z.pos.z]; }""")
        b.evaluate("([x, z]) => { const j = window.__juego; j.partida.dios = false; j.jugador.salud = 100; j.jugador.pos.set(x + 1.2, j.jugador.pos.y, z); }", [zid[1], zid[2]])
        a.wait_for_function("id => { const z = window.__juego.zombis.activos.find(z => z.id === id); return z && z.obj && z.obj.remoto; }", arg=zid[0], timeout=10_000)
        comprobar(True, 'el zombi elige como objetivo al cliente, que está más cerca')
        # el ataque de un zombi del anfitrión daña al cliente
        for _ in range(40):
            b.evaluate("([x, z]) => { const j = window.__juego.jugador; j.pos.set(x, j.pos.y, z); }",
                       a.evaluate("id => { const z = window.__juego.zombis.activos.find(z => z.id === id) || window.__juego.zombis.activos.find(z => z.vivo); return [z.pos.x + 0.9, z.pos.z]; }", zid[0]))
            b.wait_for_timeout(250)
            if b.evaluate("() => window.__juego.jugador.salud") < 100:
                break
        salud = b.evaluate("() => window.__juego.jugador.salud")
        comprobar(salud < 100, f'el zombi del anfitrión hiere al cliente (salud {salud:.0f})')
        b.evaluate("() => { window.__juego.partida.dios = true; window.__juego.jugador.salud = 100; }")
        sin_errores([a, b])


def dano():
    with jugadores(2) as (a, b):
        preparar([a, b])
        iniciar_oleada(a)
        a.wait_for_function("() => window.__juego.zombis.activos.filter(z => z.vivo && z.estado !== 'emerger').length >= 2", timeout=30_000)
        b.wait_for_function("() => window.__juego.zombis.activos.filter(z => z.replica && z.vivo && z.estado !== 'emerger').length >= 2", timeout=10_000)
        GOLPE = """([cant, n]) => { const j = window.__juego, z = j.zombis.activos.filter(z => z.replica && z.vivo && z.estado !== 'emerger')[n];
            const r = z.recibirImpacto(cant, z.puntoTorso(), new j.jugador.pos.constructor(0, 0, 1), 'torso', 'pistola'); return [z.id, z.vida, r.muerto]; }"""
        zid, _, _ = b.evaluate(GOLPE, [30, 0])
        antes = a.evaluate("id => window.__juego.zombis.porId.get(id).vida + 30", zid)
        a.wait_for_function("([id, v]) => window.__juego.zombis.porId.get(id).vida <= v - 29", arg=[zid, antes], timeout=5_000)
        comprobar(True, 'el disparo del cliente quita vida al zombi en el anfitrión')
        pa, pb = a.evaluate("() => window.__juego.puntuacion.bajas"), b.evaluate("() => window.__juego.puntuacion.bajas")
        ma = a.evaluate("() => window.__juego.oleadas.muertos")
        zid2, _, muerto = b.evaluate(GOLPE, [99999, 1])
        comprobar(muerto, 'la réplica muere al momento en el cliente (respuesta inmediata)')
        a.wait_for_function("id => { const z = window.__juego.zombis.porId.get(id); return !z || !z.vivo; }", arg=zid2, timeout=5_000)
        b.wait_for_function(f"() => window.__juego.puntuacion.bajas === {pb + 1}", timeout=5_000)
        comprobar(True, 'el anfitrión confirma la baja y el cliente se la apunta')
        comprobar(a.evaluate("() => window.__juego.puntuacion.bajas") == pa, 'el anfitrión no se apunta la baja del cliente')
        comprobar(a.evaluate("() => window.__juego.oleadas.muertos") == ma + 1, 'la oleada cuenta la baja del cliente')
        # disparos visibles/audibles para los demás (y alertan a los zombis del anfitrión)
        vistos = a.evaluate("() => window.__juego.remotos.disparosVistos")
        b.evaluate("() => { const j = window.__juego; for (let i = 0; i < 3; i++) { j.armas.actual.municion = 10; j.armas.disparar(); } }")
        a.wait_for_function(f"() => window.__juego.remotos.disparosVistos >= {vistos + 3}", timeout=5_000)
        comprobar(True, 'el anfitrión ve y oye los disparos del cliente')
        sin_errores([a, b])


def todo():
    for f in FASES.values():
        if f is not todo:
            f()


FASES = {'lobby': lobby, 'remotos': remotos, 'zombis': zombis, 'dano': dano, 'todo': todo}

if __name__ == '__main__':
    ejecutar('multi ' + FASE, FASES[FASE])
