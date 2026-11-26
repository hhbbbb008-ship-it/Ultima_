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


def ir_a_sala(p):
    if not p.is_visible('#pantallaSala'):
        p.click('[data-accion="multi"]')


def crear(p, nombre='Ana'):
    ir_a_sala(p)
    p.fill('#salaNombre', nombre)
    p.click('[data-accion="salaCrear"]')
    p.wait_for_function("() => /^[A-Z]{4}$/.test(document.getElementById('salaCodigo').textContent)", timeout=15_000)
    return p.eval_on_selector('#salaCodigo', 'e => e.textContent')


def unir(p, codigo, nombre='Beto'):
    ir_a_sala(p)
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


def skins():
    with jugadores(2) as (a, b):
        for p in (a, b):
            abrir(p)
        # cada uno elige su aspecto en la pantalla de sala (se guarda en el navegador)
        a.click('[data-accion="multi"]')
        b.click('[data-accion="multi"]')
        comprobar(b.is_visible('#salaSkin'), 'la pantalla de sala muestra el selector de aspecto')
        b.click('#salaSkin [data-skin="ropa"][data-valor="1"]')
        b.click('#salaSkin [data-skin="gorra"][data-valor="2"]')
        sk = b.evaluate("() => window.__juego.ajustes.skin")
        comprobar(sk['ropa'] != a.evaluate("() => window.__juego.ajustes.skin.ropa") and sk['gorra'] is not None, f'el aspecto elegido queda en los ajustes ({sk})')
        b.reload()
        b.wait_for_function("() => window.__juego && window.__juego.ajustes", timeout=60_000)
        comprobar(b.evaluate("() => window.__juego.ajustes.skin.ropa") == sk['ropa'], 'el aspecto se recuerda al recargar')
        abrir(b)
        cod = crear(a, 'Ana')
        unir(b, cod, 'Beto')
        b.wait_for_function("() => window.__juego.red.activa", timeout=15_000)
        a.wait_for_function("() => window.__juego.red.jugadores.length === 2", timeout=15_000)
        empezar_sala(a, [a, b])
        a.wait_for_function("() => window.__juego.remotos.lista.size === 1", timeout=10_000)
        a.wait_for_timeout(500)
        vista = a.evaluate("() => { const r = [...window.__juego.remotos.lista.values()][0]; return { ropa: r.cuerpo.materiales.ropa.color.getHex(), gorra: !!r.cuerpo.gorra?.visible, partes: r.raiz.getObjectsByProperty('isMesh', true).length } }")
        comprobar(vista['ropa'] == sk['ropa'], f"el anfitrión ve la ropa del cliente con su color ({vista['ropa']:#08x})")
        comprobar(vista['gorra'] and vista['partes'] >= 8, f"el cuerpo tiene cabeza, torso, brazos, piernas y gorra ({vista['partes']} mallas)")
        # un aspecto inválido en la red se sustituye por el de por defecto
        b.evaluate("() => window.__juego.red.mandar({ t: 'jug', n: 'Beto', skin: { ropa: 'rojo', piel: -5, gorra: 123, mochila: 'si' } })")
        a.wait_for_timeout(800)
        inval = a.evaluate("() => { const r = [...window.__juego.remotos.lista.values()][0]; return { ropa: r.cuerpo.materiales.ropa.color.getHex(), piel: r.cuerpo.materiales.piel.color.getHex(), def: window.__juego.remotos.skinPorDefecto } }")
        comprobar(inval['ropa'] == inval['def']['ropa'] and inval['piel'] == inval['def']['piel'], f'un aspecto inválido se reemplaza por el de por defecto ({inval})')
        # se anima al caminar
        a.evaluate("() => { const r = [...window.__juego.remotos.lista.values()][0]; r._p0 = r.cuerpo.piernaI.rotation.x; }")
        for x in range(10):
            b.evaluate(f"() => {{ const j = window.__juego.jugador; j.pos.set({x * 0.4}, j.pos.y, 2); }}")
            b.wait_for_timeout(70)
        movio = a.evaluate("() => { const r = [...window.__juego.remotos.lista.values()][0]; return Math.abs(r.cuerpo.piernaI.rotation.x - r._p0) + Math.abs(r.cuerpo.piernaD.rotation.x); }")
        comprobar(movio > 0.05, f'las piernas se mueven cuando camina ({movio:.2f})')
        sin_errores([a, b])


def reglas():
    with jugadores(2) as (a, b):
        preparar([a, b])
        iniciar_oleada(a)
        a.wait_for_function("() => window.__juego.zombis.activos.filter(z => z.vivo && z.estado !== 'emerger').length >= 2", timeout=30_000)
        # la pausa del anfitrión no congela la partida de los demás
        a.evaluate("() => window.__juego.partida.pausar()")
        p0 = a.evaluate("() => window.__juego.zombis.activos.filter(z => z.vivo).map(z => [z.pos.x, z.pos.z])")
        a.wait_for_timeout(1500)
        p1 = a.evaluate("() => window.__juego.zombis.activos.filter(z => z.vivo).map(z => [z.pos.x, z.pos.z])")
        mov = sum(abs(x0 - x1) + abs(z0 - z1) for (x0, z0), (x1, z1) in zip(p0, p1))
        comprobar(mov > 0.5, f'con el anfitrión en pausa los zombis siguen moviéndose ({mov:.1f} m)')
        a.evaluate("() => window.__juego.partida.reanudar()")
        # pestaña del anfitrión en segundo plano (sin requestAnimationFrame): la partida sigue
        a.evaluate("""() => { const j = window.__juego; j._fn = j.motor.fn; j.motor.fn = () => {};
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); }""")
        z0 = b.evaluate(ESTADO_Z)['pos']
        b.wait_for_timeout(1500)
        z1 = b.evaluate(ESTADO_Z)['pos']
        comunes = [k for k in z0 if k in z1]
        mov = sum(abs(z0[k][0] - z1[k][0]) + abs(z0[k][1] - z1[k][1]) for k in comunes)
        comprobar(mov > 0.5, f'con la pestaña del anfitrión oculta, el cliente sigue viendo moverse a los zombis ({mov:.1f} m)')
        a.evaluate("""() => { const j = window.__juego; j.motor.fn = j._fn; delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }""")
        # caída y reaparición al terminar la oleada
        b.evaluate("() => { const j = window.__juego; j.partida.dios = false; j.jugador.recibirDano(9999, null); }")
        b.wait_for_function("() => window.__juego.partida.estado === 'caido'", timeout=5_000)
        comprobar(True, 'en sala, al morir quedas caído (espectador), no termina la partida')
        a.wait_for_function("() => { const r = [...window.__juego.remotos.lista.values()][0]; return r && !r.vivo && !r.obj.vivo; }", timeout=5_000)
        comprobar(True, 'el anfitrión ve al cliente caído y sus zombis dejan de perseguirlo')
        a.evaluate("""() => { const j = window.__juego; j.oleadas.cola = [];
            for (const z of [...j.zombis.activos]) if (z.vivo) z.recibirImpacto(99999, z.puntoTorso(), new j.jugador.pos.constructor(0, 0, 1), 'torso', 'pistola');
            j.oleadas.muertos = j.oleadas.totalOleada; }""")
        b.wait_for_function("() => window.__juego.partida.estado === 'jugando' && window.__juego.jugador.vivo", timeout=15_000)
        comprobar(b.evaluate("() => window.__juego.jugador.salud") == 100, 'al terminar la oleada el caído reaparece con la salud completa')
        # todos caídos → derrota para todos (sin tocar la partida guardada de un jugador ni sus récords)
        GUARDA = "async () => (await import('./src/juego/Guardado.js')).Guardado"
        for p in (a, b):
            p.evaluate(f"async () => {{ const G = await ({GUARDA})(); G.guardar({{ modo: 'clasico', mapa: 'barrio', oleada: 4, puntuacion: {{}}, armas: {{}} }}); }}")
        recs = [p.evaluate(f"async () => JSON.stringify((await ({GUARDA})()).records())") for p in (a, b)]
        for p in (a, b):
            p.evaluate("() => { const j = window.__juego; j.partida.dios = false; j.jugador.recibirDano(9999, null); }")
        for p in (a, b):
            p.wait_for_function("() => window.__juego.partida.estado === 'fin' && document.getElementById('pantallaFin').classList.contains('visible')", timeout=10_000)
        comprobar(True, 'si caen todos, la partida termina para todos')
        for i, p in enumerate((a, b)):
            g = p.evaluate(f"async () => (await ({GUARDA})()).cargar()")
            comprobar(g and g['oleada'] == 4, 'terminar en sala no borra tu partida guardada de un jugador')
            comprobar(p.evaluate(f"async () => JSON.stringify((await ({GUARDA})()).records())") == recs[i], 'ni cambia tus récords de un jugador')
        sin_errores([a, b])
    # el anfitrión se va: el cliente vuelve al menú con aviso
    with jugadores(2) as (a, b):
        preparar([a, b])
        a.evaluate("() => window.__juego.partida.salirAlMenu()")
        b.wait_for_function("() => !window.__juego.partida.modoSala && window.__juego.partida.estado === 'menu'", timeout=10_000)
        txt = b.eval_on_selector('#salaError', 'e => e.textContent')
        comprobar('anfitri' in txt.lower(), f'si el anfitrión se va, el cliente vuelve al menú con aviso ("{txt}")')
        sin_errores([a, b])


def uso():
    """Mensajes por segundo de cada jugador durante una oleada → solicitudes facturables por hora."""
    with jugadores(2) as (a, b):
        preparar([a, b])
        iniciar_oleada(a)
        a.wait_for_function("() => window.__juego.zombis.contarVivos() >= 4", timeout=30_000)
        # simulación a 60 Hz sin dibujar (como un equipo real), independiente de los FPS del navegador de pruebas
        for p in (a, b):
            p.evaluate("() => { const j = window.__juego; j._fn = j.motor.fn; j.motor.fn = () => {}; j._i = setInterval(() => j.paso(1 / 60, false), 1000 / 60); }")
        b.evaluate("() => { const j = window.__juego; j.armas.actual.municion = 999; j._t = setInterval(() => { j.armas.disparar(); const z = j.zombis.activos.find(z => z.replica && z.vivo); if (z) z.recibirImpacto(1, z.puntoTorso(), new j.jugador.pos.constructor(0,0,1), 'torso', 'pistola'); }, 90); }")
        e0 = [p.evaluate("() => window.__juego.red.enviados") for p in (a, b)]
        a.wait_for_timeout(10_000)
        e1 = [p.evaluate("() => window.__juego.red.enviados") for p in (a, b)]
        tasas = [(e1[i] - e0[i]) / 10 for i in range(2)]
        comprobar(min(tasas) > 3, f'hay tráfico real durante la medición ({tasas})')
        hora = [t / 20 * 3600 for t in tasas]
        print(f'    anfitrión {tasas[0]:.1f} msg/s ({hora[0]:.0f}/h) · cliente {tasas[1]:.1f} msg/s ({hora[1]:.0f}/h)')
        peor4 = hora[0] + 3 * hora[1]
        comprobar(max(hora) <= 3000, f'cada jugador gasta ≤ 3000 solicitudes facturables por hora (máx {max(hora):.0f})')
        comprobar(peor4 <= 12000, f'una sala de 4 gasta ≤ 12000/h → ≥ 8 h de juego al día en el plan gratis ({peor4:.0f}/h ≈ {100000 / peor4:.1f} h/día)')
        sin_errores([a, b])


def revision():
    """Hallazgos de la revisión final (cada uno falló antes de corregirse)."""
    VIVOS = "() => window.__juego.zombis.activos.filter(z => z.vivo && z.estado !== 'emerger').map(z => z.id)"
    with jugadores(2) as (a, b):
        preparar([a, b])
        iniciar_oleada(a)
        a.wait_for_function("() => window.__juego.zombis.activos.filter(z => z.vivo && z.estado !== 'emerger').length >= 3", timeout=30_000)
        b.wait_for_timeout(1200)
        # C2: un zombi que mata el anfitrión muere (no desaparece) en el cliente
        zid = [i for i in a.evaluate(VIVOS) if i in b.evaluate(VIVOS)][0]
        a.evaluate("id => { const j = window.__juego, z = j.zombis.porId.get(id); z.recibirImpacto(99999, z.puntoTorso(), new j.jugador.pos.constructor(0, 0, 1), 'torso', 'pistola'); }", zid)
        b.wait_for_function("id => { const z = window.__juego.zombis.porId.get(id); return z && z.estado === 'muerto'; }", arg=zid, timeout=5_000)
        comprobar(True, 'un zombi que mata otro jugador cae muerto en el cliente (no desaparece)')
        # C2: remate en equipo: el golpe final del cliente le da la baja al cliente
        zid = [i for i in a.evaluate(VIVOS) if i in b.evaluate(VIVOS)][0]
        bajas = b.evaluate("() => window.__juego.puntuacion.bajas")
        a.evaluate("id => { const j = window.__juego, z = j.zombis.porId.get(id); z.recibirImpacto(z.vida * 0.5, z.puntoTorso(), new j.jugador.pos.constructor(0, 0, 1), 'torso', 'pistola'); }", zid)
        b.wait_for_timeout(600)
        b.evaluate("id => { const j = window.__juego, z = j.zombis.porId.get(id); z.recibirImpacto(z.vidaMax * 0.6 + 1, z.puntoTorso(), new j.jugador.pos.constructor(0, 0, 1), 'torso', 'pistola'); }", zid)
        b.wait_for_function(f"() => window.__juego.puntuacion.bajas === {bajas + 1}", timeout=5_000)
        comprobar(True, 'en un remate en equipo, quien da el golpe final se lleva la baja')
        # M3: con la pestaña oculta, una tecla pulsada justo antes no se repite
        b.evaluate("() => { const j = window.__juego; j.jugador.granadas = 3; }")
        b.evaluate("""() => { const j = window.__juego; j._fn = j.motor.fn; j.motor.fn = () => {};
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            j.entrada.flancos.add(j.entrada.codigo('granada')); }""")
        b.wait_for_timeout(1500)
        g = b.evaluate("() => window.__juego.jugador.granadas")
        b.evaluate("() => { const j = window.__juego; j.motor.fn = j._fn; delete document.hidden; }")
        comprobar(g >= 2, f'con la pestaña oculta una pulsación no se repite sola (granadas: 3 → {g})')
        # M7: un caído puede abrir la pausa y salir al menú
        b.evaluate("() => { const j = window.__juego; j.partida.dios = false; j.jugador.recibirDano(9999, null); }")
        b.wait_for_function("() => window.__juego.partida.estado === 'caido'", timeout=5_000)
        b.evaluate("() => window.__juego.partida.pausar()")
        comprobar(b.evaluate("() => document.getElementById('menuPausa').classList.contains('visible')"), 'un jugador caído puede abrir el menú de pausa')
        b.evaluate("() => window.__juego.partida.reanudar()")
        comprobar(b.evaluate("() => window.__juego.partida.estado") == 'caido', 'y al reanudar sigue caído (no revive)')
        # I3: reiniciar del anfitrión reinicia a todos
        b.evaluate("() => { window.__juego.puntuacion.total = 5000; }")
        a.evaluate("() => window.__juego.interfaz.accion('reiniciar')")
        b.wait_for_function("() => window.__juego.partida.estado === 'jugando' && window.__juego.puntuacion.total === 0 && window.__juego.jugador.vivo", timeout=20_000)
        comprobar(True, 'si el anfitrión reinicia la partida, se reinicia para todos (también los caídos)')
        # I4: en la pantalla final nadie sigue enviando
        a.evaluate("() => window.__juego.partida.terminar(false)")
        for p in (a, b):
            p.wait_for_function("() => window.__juego.partida.estado === 'fin'", timeout=10_000)
        e0 = [p.evaluate("() => window.__juego.red.enviados") for p in (a, b)]
        a.wait_for_timeout(2000)
        e1 = [p.evaluate("() => window.__juego.red.enviados") for p in (a, b)]
        comprobar(e1 == e0, f'en la pantalla final no se envía nada (enviados {e0} → {e1})')
        # M1: quien entra con el anfitrión en la pantalla final espera en la sala
        cod = a.evaluate("() => window.__juego.red.codigo")
        b.evaluate("() => window.__juego.partida.salirAlMenu()")
        b.wait_for_timeout(500)
        unir(b, cod, 'Beto')
        b.wait_for_function("() => window.__juego.red.activa", timeout=15_000)
        b.wait_for_timeout(1500)
        comprobar(b.evaluate("() => window.__juego.partida.estado") == 'menu', 'quien entra mientras el anfitrión está en la pantalla final no arranca en un mundo muerto')
        a.evaluate("() => window.__juego.interfaz.accion('otra')")
        b.wait_for_function("() => window.__juego.partida.estado === 'jugando' && window.__juego.partida.modoSala", timeout=30_000)
        comprobar(True, 'y entra cuando el anfitrión pulsa "Jugar de nuevo"')
        sin_errores([a, b])
    with jugadores(2) as (a, b):
        abrir(a); abrir(b)
        # I4: anfitrión solo en la partida → no gasta mensajes
        crear(a, 'Ana')
        a.click('[data-accion="salaEmpezar"]')
        a.click('[data-accion="empezar"]')
        a.wait_for_function("() => window.__juego.partida.estado === 'jugando' && window.__juego.partida.modoSala", timeout=60_000)
        e0 = a.evaluate("() => window.__juego.red.enviados"); a.wait_for_timeout(2000); e1 = a.evaluate("() => window.__juego.red.enviados")
        comprobar(e1 == e0, f'el anfitrión solo en la sala no envía nada ({e0} → {e1})')
        a.evaluate("() => window.__juego.partida.salirAlMenu()")
        # I1: Volver desde la sala lleva al menú aunque antes se abriera el equipo
        cod = crear(a, 'Ana')
        a.click('[data-accion="salaEmpezar"]')
        a.evaluate("() => window.__juego.interfaz.accion('volver')")
        comprobar(a.is_visible('#pantallaSala'), 'Volver desde el equipo regresa a la sala')
        a.evaluate("() => window.__juego.interfaz.accion('volver')")
        comprobar(a.is_visible('#menuPrincipal'), 'Volver desde la sala lleva al menú principal')
        # I2: con una sala abierta, Jugar (un jugador) es una partida de un jugador y sale de la sala
        unir(b, cod, 'Beto')
        b.wait_for_function("() => window.__juego.red.activa", timeout=15_000)
        b.evaluate("() => window.__juego.interfaz.accion('volver')")
        b.evaluate("() => window.__juego.interfaz.accion('jugar')")
        b.evaluate("() => window.__juego.interfaz.accion('empezar')")
        b.wait_for_function("() => window.__juego.partida.estado === 'jugando'", timeout=60_000)
        comprobar(b.evaluate("() => !window.__juego.partida.modoSala && !window.__juego.red.activa"), 'Jugar desde el menú inicia una partida de un jugador y sale de la sala')
        a.wait_for_function("() => window.__juego.red.jugadores.length === 1", timeout=10_000)
        comprobar(True, 'y el anfitrión ve que ese jugador se fue')
        sin_errores([a, b])


def todo():
    for f in FASES.values():
        if f is not todo:
            f()


FASES = {'lobby': lobby, 'remotos': remotos, 'zombis': zombis, 'dano': dano, 'skins': skins, 'reglas': reglas, 'uso': uso, 'revision': revision, 'todo': todo}

if __name__ == '__main__':
    ejecutar('multi ' + FASE, FASES[FASE])
