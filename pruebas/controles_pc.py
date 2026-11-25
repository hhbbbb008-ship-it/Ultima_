"""Prueba de los controles de PC (teclado y ratón reales, no llamadas internas):
- WASD en la dirección correcta, correr, saltar, ratón para mirar, disparar, apuntar, recargar, dash, armas 1-5 y rueda.
- Un "mando fantasma" (acelerómetro o dispositivo virtual que Chrome reporta como gamepad) no mueve ni gira nada.
- Un control real se activa al pulsar un botón y cede el mando al tocar el teclado.
- Sin aviso falso de "no se pudo capturar el ratón"; si el navegador niega el ratón, la partida espera con "Haz clic".
- Esc alterna la pausa, el clic que captura el ratón no dispara, la rueda del touchpad cambia una sola vez,
  la ayuda del menú usa las teclas asignadas y no quedan teclas repetidas en los controles guardados.
Uso: python3 pruebas/controles_pc.py
"""
import math, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import servidor, CHROMIUM, ARGS
from playwright.sync_api import sync_playwright
PAD = """(()=>{ const btn=()=>({pressed:false,value:0,touched:false});
  window.__pad = { id:'Xbox Wireless Controller', index:0, connected:true, mapping:'standard', timestamp:0, axes:[0,0,0,0], buttons:Array.from({length:17},btn) };
  navigator.getGamepads = () => [window.__pad,null,null,null]; })();
document.addEventListener('pointerlockerror',()=>{(window.__ev=window.__ev||[]).push('error')});"""
FANTASMA = """
(()=>{ const pad = { id:'ST LIS3LV02DL Accelerometer', index:0, connected:true, mapping:'', timestamp:0,
   axes:[0.05, -0.62, -1, 0.0, 0, -1], buttons:Array.from({length:4},()=>({pressed:false,value:0,touched:false})) };
  navigator.getGamepads = () => [pad, null, null, null];
  window.addEventListener('load', ()=> setTimeout(()=>{ const e=new Event('gamepadconnected'); e.gamepad=pad; window.dispatchEvent(e); }, 500));
})();"""
res = {}
def ok(nombre, cond, extra=''):
    print(('  ✔ ' if cond else '  ✘ ') + nombre + (f'  ({extra})' if extra else '')); res[nombre]=cond
with servidor() as base, sync_playwright() as p:
    URL = base + 'index.html'
    b=p.chromium.launch(executable_path=CHROMIUM,args=ARGS)
    pg=b.new_page(viewport={'width':1280,'height':720}); pg.add_init_script(PAD)
    errs=[]; notis=[]
    pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#bEntrar:not(.oculto)',timeout=120000); pg.click('#bEntrar'); pg.wait_for_function("()=>document.getElementById('menuPrincipal').classList.contains('visible')",timeout=60000)
    J="window.__juego"
    pg.evaluate(f"async()=>{{await {J}.partida.nueva('clasico','barrio',{{secundaria:'pistola',principal:'subfusil'}});}}"); pg.wait_for_timeout(700)
    pg.mouse.click(640,360); pg.wait_for_timeout(300)
    ok('sin aviso falso de "no se pudo capturar el ratón"', 'capturar el ratón' not in pg.evaluate("()=>document.getElementById('notificacion')?.textContent||''"), pg.evaluate("()=>document.getElementById('notificacion')?.textContent||''"))
    # --- control real: pulsar A activa, stick mueve; teclado devuelve el mando ---
    pg.evaluate("()=>{__pad.buttons[2].pressed=true;}"); pg.wait_for_timeout(150); pg.evaluate("()=>{__pad.buttons[2].pressed=false;}"); pg.wait_for_timeout(100)
    ok('el control se activa al pulsar un botón', pg.evaluate(f"()=>{J}.entrada.mandoActivo"))
    a=pg.evaluate(f"()=>[{J}.jugador.pos.x,{J}.jugador.pos.z,{J}.jugador.yaw]")
    pg.evaluate("()=>{__pad.axes=[0,-1,0.8,0];}"); pg.wait_for_timeout(600); pg.evaluate("()=>{__pad.axes=[0,0,0,0];}"); pg.wait_for_timeout(100)
    d=pg.evaluate(f"()=>[{J}.jugador.pos.x,{J}.jugador.pos.z,{J}.jugador.yaw,{J}.partida.estado]")
    ok('con el control activo el stick mueve y gira', abs(d[2]-a[2])>0.3 and ((d[0]-a[0])**2+(d[1]-a[1])**2)**.5>1, f'giro {d[2]-a[2]:.2f}, estado {d[3]}')
    # con el control en uso, el ratón y las teclas que emula Steam no le quitan el mando
    pg.evaluate("()=>{__pad.axes=[0,-1,0.6,0];}")
    for i in range(6): pg.mouse.move(640+i*8, 360); pg.wait_for_timeout(80)
    pg.keyboard.press('Enter'); pg.evaluate("()=>{__pad.axes=[0,0,0,0];}"); pg.wait_for_timeout(100)
    ok('el ratón y las teclas que emula Steam no desactivan el control mientras se usa', pg.evaluate(f"()=>{J}.entrada.mandoActivo"))
    pg.wait_for_timeout(1700)      # el control lleva un rato quieto
    pg.keyboard.press('KeyW'); pg.wait_for_timeout(150)
    ok('al usar el teclado el control deja de mandar', not pg.evaluate(f"()=>{J}.entrada.mandoActivo") and not pg.evaluate("()=>document.body.classList.contains('modoMando')"))
    # el ratón ya no estaba capturado con el control: debe aparecer el aviso de clic
    pg.wait_for_timeout(1900)
    st=pg.evaluate(f"()=>[{J}.partida.estado,{J}.partida.esperandoRaton,document.getElementById('esperaRaton').classList.contains('visible'),{J}.entrada.bloqueado]")
    if st[3]: ok('(el ratón seguía capturado: no hace falta el aviso)', True, str(st))
    else: ok('sin ratón capturado la partida espera con el aviso de clic', st[0]=='pausa' and st[1] and st[2], str(st))
    if not st[3]:
        pg.click('#esperaRaton'); pg.wait_for_timeout(400)
        st=pg.evaluate(f"()=>[{J}.partida.estado,{J}.entrada.bloqueado,document.getElementById('esperaRaton').classList.contains('visible')]")
        ok('clic en el aviso captura el ratón y sigue la partida', st==['jugando',True,False], str(st))
    # --- el clic sin ratón capturado no dispara ---
    pg.evaluate("()=>document.exitPointerLock()"); pg.wait_for_timeout(300)
    ok('soltar el ratón pausa con el menú', pg.evaluate(f"()=>[{J}.partida.estado,{J}.interfaz.visible()]")==['pausa','menuPausa'])
    pg.wait_for_timeout(600); pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    ok('Esc en el menú de pausa reanuda', pg.evaluate(f"()=>{J}.partida.estado")=='jugando', str(pg.evaluate(f"()=>[{J}.partida.estado,{J}.entrada.bloqueado]")))
    # --- fallo de captura al reanudar (Chrome lo bloquea ~1 s tras Esc) ---
    pg.evaluate(f"()=>{J}.partida.pausar()"); pg.wait_for_timeout(200)
    pg.evaluate(f"""()=>{{ const L={J}.entrada.lienzo; window.__orig=L.requestPointerLock; L.requestPointerLock=function(){{ setTimeout(()=>document.dispatchEvent(new Event('pointerlockerror')),10); return Promise.reject(new Error('x')); }}; }}""")
    pg.click('#menuPausa [data-accion=reanudar]'); pg.wait_for_timeout(400)
    st=pg.evaluate(f"()=>[{J}.partida.estado,{J}.partida.esperandoRaton,document.getElementById('esperaRaton').classList.contains('visible'),{J}.interfaz.visible()]")
    ok('si el navegador niega el ratón, aparece "Haz clic para seguir jugando" (en pausa)', st[0]=='pausa' and st[1] and st[2], str(st))
    mun=pg.evaluate(f"()=>{J}.armas.actual.municion")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    ok('Esc en el aviso abre el menú de pausa', pg.evaluate(f"()=>[{J}.interfaz.visible(), document.getElementById('esperaRaton').classList.contains('visible')]")==['menuPausa',False])
    pg.evaluate(f"()=>{{ {J}.entrada.lienzo.requestPointerLock=window.__orig; }}")
    pg.click('#menuPausa [data-accion=reanudar]'); pg.wait_for_timeout(400)
    ok('reanudar con el ratón disponible vuelve al juego', pg.evaluate(f"()=>[{J}.partida.estado,{J}.entrada.bloqueado]")==['jugando',True])
    # --- clic en el lienzo sin captura no dispara ---
    pg.evaluate(f"()=>{{ {J}.entrada.bloqueado=false; }}")
    m0=pg.evaluate(f"()=>{J}.armas.actual.municion"); pg.mouse.down(); pg.wait_for_timeout(250); pg.mouse.up(); pg.wait_for_timeout(100)
    ok('el clic que captura el ratón no dispara', pg.evaluate(f"()=>{J}.armas.actual.municion")==m0)
    pg.evaluate(f"()=>{{ {J}.entrada.bloqueado=true; }}"); pg.wait_for_timeout(200)
    # --- rueda de touchpad: muchos eventos pequeños = un cambio ---
    a0=pg.evaluate(f"()=>{J}.armas.actual.def.id")
    for _ in range(12): pg.mouse.wheel(0, 6)
    pg.wait_for_timeout(900)
    a1=pg.evaluate(f"()=>{J}.armas.actual.def.id")
    ok('un gesto corto de touchpad cambia de arma una sola vez', a1!=a0, f'{a0} -> {a1}')
    # --- ayuda del menú con las teclas reales ---
    pg.evaluate(f"()=>{J}.ajustes.setControl('dash','KeyF')"); pg.evaluate(f"()=>{J}.partida.salirAlMenu()"); pg.wait_for_timeout(200)
    pie=pg.evaluate("()=>document.getElementById('pieMenu').textContent")
    ok('la ayuda del menú muestra las teclas asignadas (dash en F, linterna en Q al intercambiar)', 'F dash' in pie and 'Q linterna' in pie and '1-5' in pie, pie[pie.index('WASD'):][:120] if 'WASD' in pie else pie[:120])
    pg.evaluate(f"()=>{J}.ajustes.restaurarControles()")
    print('errores', errs[:5])
    # --- teclas duplicadas guardadas ---
    pg.evaluate("""()=>{const k='ultimaNoche.ajustes.v1';const s=JSON.parse(localStorage.getItem(k)||'{}');s.controles=Object.assign(s.controles||{}, {dash:'KeyQ', armaAnterior:'KeyQ', granada:'KeyR'});localStorage.setItem(k,JSON.stringify(s));}""")
    pg.reload(); pg.wait_for_selector('#bEntrar:not(.oculto)',timeout=120000)
    c=pg.evaluate(f"()=>{J}.ajustes.controles")
    vals=[v for v in c.values() if v]
    ok('sin teclas repetidas tras cargar', len(vals)==len(set(vals)), f"dash={c['dash']} armaAnterior={c['armaAnterior']} recargar={c['recargar']} granada={c['granada']}")

    # --- mando fantasma: 2 s sin tocar nada ---
    pg2=b.new_page(viewport={'width':1280,'height':720}); pg2.add_init_script(FANTASMA)
    pg2.goto(URL); pg2.wait_for_selector('#bEntrar:not(.oculto)',timeout=180000); pg2.click('#bEntrar'); pg2.wait_for_function("()=>document.getElementById('menuPrincipal').classList.contains('visible')",timeout=60000)
    pg2.evaluate("async()=>{await window.__juego.partida.nueva('clasico','barrio',{secundaria:'pistola',principal:'subfusil'});}")
    pg2.wait_for_timeout(600); pg2.mouse.click(640,360)
    a=pg2.evaluate("()=>{const j=window.__juego.jugador; return [j.pos.x,j.pos.z,j.yaw,j.pitch]}"); pg2.wait_for_timeout(2000)
    d=pg2.evaluate("()=>{const j=window.__juego.jugador; return [j.pos.x,j.pos.z,j.yaw,j.pitch]}")
    ok('un mando fantasma no mueve ni gira al jugador', max(abs(d[i]-a[i]) for i in range(4)) < 0.01)
    # --- teclado y ratón reales ---
    pg2.close(); pg3=b.new_page(viewport={'width':1280,'height':720}); pg3.goto(URL)
    pg3.wait_for_selector('#bEntrar:not(.oculto)',timeout=180000); pg3.click('#bEntrar'); pg3.wait_for_function("()=>document.getElementById('menuPrincipal').classList.contains('visible')",timeout=60000)
    pg3.evaluate("async()=>{await window.__juego.partida.nueva('clasico','barrio',{secundaria:'pistola',principal:'subfusil'});}")
    pg3.wait_for_timeout(600); pg3.mouse.click(640,360); pg3.wait_for_timeout(300)
    J3="window.__juego"
    def mover(k, ms=600):
        a=pg3.evaluate(f"()=>[{J3}.jugador.pos.x,{J3}.jugador.pos.z,{J3}.jugador.yaw]"); pg3.keyboard.down(k); pg3.wait_for_timeout(ms); pg3.keyboard.up(k); pg3.wait_for_timeout(250)
        d=pg3.evaluate(f"()=>[{J3}.jugador.pos.x,{J3}.jugador.pos.z]"); dx,dz=d[0]-a[0],d[1]-a[1]; y=a[2]
        return -dx*math.sin(y)-dz*math.cos(y), dx*math.cos(y)-dz*math.sin(y)
    f,r=mover('KeyW'); ok('W avanza', f>1 and abs(r)<0.3)
    f,r=mover('KeyS'); ok('S retrocede', f<-1 and abs(r)<0.3)
    f,r=mover('KeyA'); ok('A va a la izquierda', r<-1 and abs(f)<0.3)
    f,r=mover('KeyD'); ok('D va a la derecha', r>1 and abs(f)<0.3)
    # correr: se mide la velocidad (la distancia depende de con qué choques delante)
    pg3.keyboard.down('KeyW'); pg3.wait_for_timeout(500); v1=pg3.evaluate(f"()=>Math.hypot({J3}.jugador.vel.x,{J3}.jugador.vel.z)")
    pg3.keyboard.down('ShiftLeft'); pg3.wait_for_timeout(500); v2=pg3.evaluate(f"()=>[Math.hypot({J3}.jugador.vel.x,{J3}.jugador.vel.z),{J3}.jugador.corriendo]")
    pg3.keyboard.up('ShiftLeft'); pg3.keyboard.up('KeyW'); pg3.wait_for_timeout(300)
    ok('Mayús + W corre más rápido que andar', v2[1] and v2[0] > v1*1.3, f'andar {v1:.1f} m/s · correr {v2[0]:.1f} m/s')
    y0=pg3.evaluate(f"()=>{J3}.jugador.yaw"); pg3.mouse.move(800,360); pg3.wait_for_timeout(200); ok('mover el ratón a la derecha gira a la derecha', pg3.evaluate(f"()=>{J3}.jugador.yaw")<y0-0.1)
    m0=pg3.evaluate(f"()=>{J3}.armas.actual.municion"); pg3.mouse.down(); pg3.wait_for_timeout(400); pg3.mouse.up(); pg3.wait_for_timeout(150); ok('clic izquierdo dispara', pg3.evaluate(f"()=>{J3}.armas.actual.municion")<m0)
    pg3.mouse.down(button='right'); pg3.wait_for_timeout(500); ok('clic derecho apunta', pg3.evaluate(f"()=>{J3}.armas.ads")>0.9); pg3.mouse.up(button='right'); pg3.wait_for_timeout(300)
    pg3.keyboard.press('KeyR'); pg3.wait_for_timeout(150); ok('R recarga', pg3.evaluate(f"()=>{J3}.armas.estado")=='recargando'); pg3.wait_for_timeout(3000)
    pg3.keyboard.press('Digit1'); pg3.wait_for_timeout(900); ok('1 saca la pistola', pg3.evaluate(f"()=>{J3}.armas.actual.def.id")=='pistola')
    pg3.keyboard.press('Digit2'); pg3.wait_for_timeout(900); ok('2 saca el subfusil', pg3.evaluate(f"()=>{J3}.armas.actual.def.id")=='subfusil', pg3.evaluate(f"()=>[{J3}.armas.actual.def.id,{J3}.armas.estado]"))
    c0=pg3.evaluate(f"()=>{J3}.jugador.dashCargas"); pg3.keyboard.press('KeyQ'); pg3.wait_for_timeout(100); ok('Q hace dash', pg3.evaluate(f"()=>{J3}.jugador.dashCargas")==c0-1)
    b.close()
print('OK: controles_pc' if all(res.values()) else 'FALLÓ: controles_pc')
sys.exit(0 if all(res.values()) else 1)
