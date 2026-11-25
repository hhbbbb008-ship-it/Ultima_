"""Prueba de: armas cuerpo a cuerpo desbloqueadas (menos la katana), granadas y bebidas que sueltan
los zombis (ritmo, Coloso, recogida y límite) y giro simétrico con el stick derecho del control
aunque Chrome lo muestre con un stick inclinado.
Uso: python3 pruebas/suministros.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import servidor, CHROMIUM, ARGS
from playwright.sync_api import sync_playwright
INIT_PAD = """(()=>{ const st={axes:[0,0,0,0], b:new Array(17).fill(0), visto:false}; window.__st=st;
 navigator.getGamepads=()=>{ if(!st.visto) return [null,null,null,null];
   return [{id:'Xbox Wireless Controller (STANDARD GAMEPAD)',index:0,connected:true,mapping:'standard',timestamp:performance.now(),
     axes:st.axes.slice(), buttons:st.b.map(v=>({pressed:v>0.5,value:v,touched:v>0}))},null,null,null]; };
 window.__pulsar=(i,ms=150)=>{ st.b[i]=1; setTimeout(()=>st.b[i]=0,ms); }; })();"""
res = {}
def ok(n, c, extra=''):
    print(('  ✔ ' if c else '  ✘ ') + n + (f'  ({extra})' if extra else '')); res[n] = c
def J(pg,e): return pg.evaluate("()=>"+e)
MENU = "()=>document.getElementById('menuPrincipal').classList.contains('visible')"
with servidor() as base, sync_playwright() as p:
    URL = base + 'index.html'
    b = p.chromium.launch(executable_path=CHROMIUM, args=ARGS)
    pg = b.new_page(viewport={'width':1280,'height':720}); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#bEntrar:not(.oculto)', timeout=180000)
    pg.evaluate("()=>localStorage.clear()"); pg.reload(); pg.wait_for_selector('#bEntrar:not(.oculto)', timeout=180000)
    pg.click('#bEntrar'); pg.wait_for_function(MENU, timeout=60000)
    d = {i: J(pg, f"window.__juego.tienda.desbloqueada('{i}')") for i in ['bate','hacha','marro','katana']}
    ok('bate, hacha y marro desbloqueados sin comprar; la katana no', d == {'bate':True,'hacha':True,'marro':True,'katana':False}, str(d))
    pg.evaluate("async()=>{const c=window.__juego; await c.partida.nueva('clasico','barrio',{secundaria:'pistola',principal:'subfusil',cuerpo:'marro'}); c.oleadas.estado='inactiva'; c.zombis.limpiar();}")
    pg.wait_for_timeout(500)
    ok('se puede llevar el marro a la partida', 'marro' in J(pg, "Object.keys(window.__juego.armas.inventario)"))
    r = pg.evaluate("""()=>{const c=window.__juego, j=c.jugador; const V=c.camara.position.constructor; const cnt={granada:0,bebida:0};
      for(let i=0;i<300;i++){ c.suministros.alMorir({tipo:'caminante',pos:new V(j.pos.x+30+(i%10),0,j.pos.z+30+Math.floor(i/10)%10)});
        for(const s of c.suministros.activos.splice(0)) { cnt[s.tipo]++; c.escena.remove(s.g); } }
      c.suministros.alMorir({tipo:'coloso',pos:new V(j.pos.x+20,0,j.pos.z)}); const col=c.suministros.activos.map(s=>s.tipo).sort();
      c.suministros.limpiar(); return {cnt, col};}""")
    n = r['cnt']['granada'] + r['cnt']['bebida']
    ok('caen entre 1 de cada 7 y 1 de cada 11 bajas, de los dos tipos', 27 <= n <= 43 and min(r['cnt'].values()) > 0, str(r['cnt']))
    ok('el Coloso suelta una granada y una bebida', r['col'] == ['bebida','granada'])
    pg.evaluate("""()=>{const c=window.__juego, j=c.jugador; j.granadas=1; j.bebidas=j.bebidasMax;
      c.suministros.crear('granada',{x:j.pos.x+3,z:j.pos.z}); c.suministros.crear('bebida',{x:j.pos.x-3,z:j.pos.z});
      for(const s of [...c.suministros.activos]){ j.pos.x=s.pos.x; j.pos.z=s.pos.z; c.suministros.actualizar(0.016);} }""")
    ok('pasar por encima recoge la granada', J(pg, "window.__juego.jugador.granadas") == 2)
    ok('con las bebidas al máximo la lata se queda en el suelo', J(pg, "window.__juego.suministros.activos.map(s=>s.tipo)") == ['bebida'])
    pg.close()
    # giro con el stick derecho: Chrome muestra el control mientras el stick está inclinado
    pg = b.new_page(viewport={'width':1280,'height':720}); pg.add_init_script(INIT_PAD)
    pg.goto(URL); pg.wait_for_selector('#bEntrar:not(.oculto)', timeout=180000)
    pg.click('#bEntrar'); pg.wait_for_function(MENU, timeout=60000)
    pg.evaluate("()=>{__st.visto=true; __st.axes=[0.3,0,0.85,0];}"); pg.wait_for_timeout(300); pg.evaluate("()=>{__st.axes=[0,0,0,0]}")
    pg.evaluate("async()=>{await window.__juego.partida.nueva('clasico','barrio',{secundaria:'pistola',principal:'subfusil'});}"); pg.wait_for_timeout(800)
    pg.evaluate("()=>__pulsar(2)"); pg.wait_for_timeout(300)
    g = []
    for x in (1, -1):
        a = J(pg, "window.__juego.jugador.yaw"); pg.evaluate(f"()=>{{__st.axes=[0,0,{x},0]}}"); pg.wait_for_timeout(1000); pg.evaluate("()=>{__st.axes=[0,0,0,0]}"); pg.wait_for_timeout(100)
        g.append(abs(J(pg, "window.__juego.jugador.yaw") - a))
    ok('el stick derecho gira igual a la derecha que a la izquierda', min(g) > 2 and max(g) / min(g) < 1.3, f'{g[0]:.2f} / {g[1]:.2f} rad')
    ok('sin errores en la página', not errs, str(errs[:2]))
    b.close()
print('OK: suministros' if all(res.values()) else 'FALLÓ: suministros')
sys.exit(0 if all(res.values()) else 1)
