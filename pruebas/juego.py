"""Prueba de partida: moverse, correr sin límite (también hacia atrás), saltar, disparar, recargar,
oleadas con zombis, pausa y barrido de las armas cuerpo a cuerpo."""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import navegador, cargar, entrar, empezar_partida, comprobar, sin_errores, ejecutar

J = 'window.__juego'


def prueba():
    with navegador() as (page, errores):
        cargar(page); entrar(page)
        empezar_partida(page, principal='subfusil', cuerpo='bate')
        page.evaluate(f"() => {{ {J}.partida.dios = true; }}")      # que los zombis no terminen la prueba
        comprobar(page.evaluate(f"() => {J}.armas.actual.def.id") == 'subfusil', 'empieza con el arma principal elegida')
        comprobar(page.evaluate(f"() => {J}.jugador.estamina === undefined && {J}.jugador.energia === undefined"), 'el jugador ya no tiene estamina ni energía')

        # correr hacia delante durante 7 s: no se agota nunca
        p0 = page.evaluate(f"() => {J}.jugador.pos.clone()")
        page.keyboard.down('Shift'); page.keyboard.down('w')
        muestras = []
        for _ in range(14):
            page.wait_for_timeout(500)
            muestras.append(page.evaluate(f"() => [{J}.jugador.corriendo, {J}.jugador.velHoriz]"))
        page.keyboard.up('w')
        p1 = page.evaluate(f"() => {J}.jugador.pos.clone()")
        corriendo = [m[0] for m in muestras[1:]]
        comprobar(all(corriendo), f'corre 7 s seguidos sin agotarse ({sum(corriendo)}/{len(corriendo)} muestras corriendo)')
        vmax = max(m[1] for m in muestras)
        comprobar(6.3 < vmax < 7.4, f'velocidad normal de carrera conservada ({vmax:.2f} m/s, esperado ≈ 7)')
        # correr hacia atrás (Mayús + S)
        page.keyboard.down('s'); page.wait_for_timeout(1200)
        atras = page.evaluate(f"() => {J}.jugador.corriendo")
        page.keyboard.up('s'); page.keyboard.up('Shift')
        comprobar(atras, 'Mayús + S sigue corriendo hacia atrás')
        comprobar(math.hypot(p1['x'] - p0['x'], p1['z'] - p0['z']) > 2, f"el jugador se ha desplazado corriendo ({math.hypot(p1['x'] - p0['x'], p1['z'] - p0['z']):.1f} m)")
        # saltar
        page.wait_for_timeout(300)
        page.keyboard.press('Space'); page.wait_for_timeout(150)
        comprobar(page.evaluate(f"() => !{J}.jugador.enSuelo || {J}.jugador.pos.y > 0.2"), 'Espacio salta')
        page.wait_for_timeout(900)

        # disparar con el clic izquierdo
        m0 = page.evaluate(f"() => {J}.armas.actual.municion")
        page.evaluate(f"() => {J}.entrada.activos.add('Mouse0')"); page.wait_for_timeout(600)
        page.evaluate(f"() => {J}.entrada.activos.delete('Mouse0')")
        m1 = page.evaluate(f"() => {J}.armas.actual.municion")
        comprobar(m1 < m0, f'disparar gasta munición ({m0} → {m1})')
        page.wait_for_timeout(300)
        # recargar con R
        page.keyboard.press('r'); page.wait_for_timeout(150)
        comprobar(page.evaluate(f"() => {J}.armas.estado") == 'recargando', 'R empieza la recarga')
        page.wait_for_function(f"() => {J}.armas.estado === 'listo'", timeout=10_000)
        comprobar(page.evaluate(f"() => {J}.armas.actual.municion === {J}.armas.actual.def.cargador"), 'la recarga llena el cargador')

        # oleada: se adelanta la cuenta atrás y salen zombis
        page.evaluate(f"() => {{ {J}.oleadas.cuenta = 0; }}")
        page.wait_for_function(f"() => {J}.oleadas.estado === 'activa' && {J}.zombis.contarVivos() > 0", timeout=30_000)
        comprobar(True, f"empieza la oleada 1 con zombis ({page.evaluate(f'() => {J}.oleadas.totalOleada')} en total)")

        # pausa y continuar
        page.evaluate(f"() => {J}.partida.pausar()")
        comprobar(page.eval_on_selector('#menuPausa', 'e => e.classList.contains("visible")'), 'el menú de pausa se abre')
        page.evaluate(f"() => {J}.partida.reanudar()")
        comprobar(page.evaluate(f"() => {J}.partida.estado") == 'jugando', 'se reanuda la partida')

        # barrido de cada arma cuerpo a cuerpo (solo visual; daño y objetivos sin cambios)
        defs = page.evaluate("""async () => { const m = await import('./src/armas/DefArmas.js');
            return Object.fromEntries(['bate','hacha','marro','katana'].map(id => [id, { dano: m.ARMAS[id].dano, objetivos: m.ARMAS[id].objetivos, barrido: m.ARMAS[id].barrido }])); }""")
        esperado = {'bate': (85, 2), 'hacha': (150, 1), 'marro': (230, 3), 'katana': (170, 5)}
        comprobar(all((defs[k]['dano'], defs[k]['objetivos']) == v for k, v in esperado.items()), 'daño y objetivos cuerpo a cuerpo sin cambios')
        comprobar(all(defs[k]['barrido'] for k in esperado), 'bate, hacha, marro y katana tienen barrido')
        comprobar(defs['katana']['barrido']['color'] == 0xffffff and defs['katana']['barrido']['escala'] == 1, 'la katana conserva la media luna blanca original')
        colores = {defs[k]['barrido']['color'] for k in esperado}
        comprobar(len(colores) == 4, 'cada arma tiene su propio color de barrido')
        comprobar(defs['bate']['barrido']['duracion'] < defs['katana']['barrido']['duracion'] < defs['marro']['barrido']['duracion']
                  and defs['bate']['barrido']['escala'] < 1 < defs['marro']['barrido']['escala'], 'bate corto y rápido · marro amplio y lento')
        comprobar(defs['hacha']['barrido'].get('vertical') is True, 'el hacha tiene un arco vertical')

        # el barrido se ve al golpear con cada arma (simulación fotograma a fotograma, lógica congelada)
        for id in ['bate', 'hacha', 'marro', 'katana']:
            r = page.evaluate("""id => { const A = window.__juego.armas;
                window.__juego.partida.estado = 'pausa';
                if (!A.inventario[id]) A.dar(id, false);
                A.equipar(id); A.estado = 'listo'; A.cadenciaT = 0; A.golpeT = -1; A.barridoT = -1;
                A.iniciarGolpe();
                let visto = false, rot = [], esc = 0, t = 0;
                const color = A.barrido.material.color.getHex();
                while (t < 1.6) { A.actualizarEstado(1 / 60); t += 1 / 60;
                  if (A.barrido.visible && A.barrido.material.opacity > 0.05) { visto = true; rot.push(A.barrido.rotation.z); esc = Math.max(esc, A.barrido.scale.x); } }
                return { visto, color, rotIni: rot[0], esc, fin: A.barridoT === -1 && !A.barrido.visible }; }""", id)
            b = defs[id]['barrido']
            comprobar(r['visto'] and r['color'] == b['color'] and r['fin'], f"{id}: muestra su barrido (color #{r['color']:06x}, escala máx. {r['esc']:.2f}) y desaparece")
            if id == 'hacha':
                comprobar(r['rotIni'] < -0.6, f"hacha: barrido girado en vertical (rotación {r['rotIni']:.2f} rad)")
            else:
                comprobar(r['rotIni'] > 0.2, f"{id}: barrido horizontal (rotación {r['rotIni']:.2f} rad)")
        page.evaluate(f"() => {{ {J}.partida.estado = 'jugando'; }}")
        # golpe real con el bate desde la ranura 5 y el clic izquierdo
        page.evaluate(f"() => {J}.armas.equipar('subfusil')")
        page.keyboard.press('5')
        page.wait_for_function(f"() => {J}.armas.actual.def.id === 'bate' && {J}.armas.estado === 'listo'", timeout=5000)
        page.evaluate(f"() => {J}.entrada.activos.add('Mouse0')")
        page.wait_for_function(f"() => {J}.armas.barridoT >= 0", timeout=3000)
        page.evaluate(f"() => {J}.entrada.activos.delete('Mouse0')")
        comprobar(True, 'el golpe del bate con el clic izquierdo lanza el barrido')
        page.wait_for_timeout(500)
        sin_errores(errores)


if __name__ == '__main__':
    ejecutar('juego', prueba)
