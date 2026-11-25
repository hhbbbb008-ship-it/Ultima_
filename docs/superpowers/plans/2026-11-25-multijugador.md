# Multijugador cooperativo — Plan de implementación

> **Para quien ejecute:** SUB-HABILIDAD REQUERIDA: usar superpowers:subagent-driven-development (recomendada) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas `- [ ]`.

**Meta:** Salas cooperativas de hasta 4 jugadores con anfitrión que simula, relevo en Cloudflare Durable Objects y skins visibles.

**Arquitectura:** Un Worker sirve los archivos estáticos y enruta `/sala/<codigo>` a un Durable Object `Sala` (WebSocket con hibernación) que solo retransmite. El primer jugador es anfitrión: corre oleadas y zombis como hoy; los demás reciben réplicas de zombis. La lógica de la sala vive en una clase pura (`SalaLogica`) para probarla sin Cloudflare.

**Tecnologías:** JavaScript con módulos ES sin compilación en el cliente, Three.js (ya incluido), Cloudflare Workers + Durable Objects (SQLite), `wrangler`, `node:test`, Playwright en Python (ya usado en `pruebas/`), Blender `bpy` para el cuerpo del jugador.

**Diseño:** `docs/superpowers/specs/2026-11-25-multijugador-design.md`

## Restricciones globales
- Máximo 4 jugadores por sala; códigos de 4 letras mayúsculas.
- Envío: posición de jugador 15 Hz, zombis 10 Hz (ajustable en la Tarea 8).
- Plan gratis: Durable Objects solo SQLite (`new_sqlite_classes`), API de hibernación obligatoria, un mensaje no puede pasar de 16 KB.
- El modo de un jugador no usa la red y no puede ser más lento ni cambiar.
- Cliente sin paso de compilación; cada archivo nuevo del cliente se agrega a la lista del `sw.js` y se sube la versión de caché.
- Todas las pruebas existentes en `pruebas/` deben seguir pasando después de cada tarea (`CHROMIUM=/usr/bin/google-chrome python3 pruebas/<nombre>.py`).
- Se conservan todas las funciones existentes.

## Enfoque de revisión (casos que el diseño implica pero no nombra)
- Código de sala en minúsculas, con espacios o inválido → se normaliza o se rechaza con mensaje claro.
- Quinto jugador intentando entrar → "sala llena", sin tumbar la sala.
- Mensaje malformado, no-JSON o demasiado grande → se ignora, la sala sigue viva.
- Anfitrión se sale con otros dentro → la sala se cierra y todos vuelven al menú con aviso.
- Pestaña en segundo plano (el navegador frena los temporizadores) → el jugador remoto no se queda teletransportado ni se rompe la interpolación.

## Estructura de archivos
- Crear `package.json`, `wrangler.jsonc`, `.assetsignore`, `.gitignore`
- Crear `servidor/index.js` (Worker: rutas), `servidor/Sala.js` (Durable Object), `servidor/SalaLogica.js` (reglas puras), `servidor/SalaLogica.test.js`
- Crear `src/red/protocolo.js` (tipos de mensaje compartidos cliente/servidor), `src/red/Red.js`, `src/red/Remotos.js`
- Crear `src/jugador/CuerpoJugador.js`, `herramientas/jugador_cuerpo.py`, `assets/modelos/jugador.glb`
- Modificar `src/juego/Partida.js`, `src/juego/Oleadas.js`, `src/enemigos/GestorZombis.js`, `src/ui/Interfaz.js`, `index.html`, `css/estilos.css`, `src/main.js`, `sw.js`, `README.md`
- Crear pruebas `pruebas/red_sala.mjs`, `pruebas/multi.py`

---

### Task 1: Reglas de la sala (lógica pura)

**Archivos:**
- Crear: `src/red/protocolo.js`, `servidor/SalaLogica.js`, `servidor/SalaLogica.test.js`, `package.json`, `.gitignore`

**Interfaces:**
- Produce `src/red/protocolo.js`: `export const T = { HOLA, JUGADOR, ZOMBIS, DISPARO, DANO, FIN, ENTRO, SALIO }` (cadenas) y `export const MAX_BYTES = 16384`, `export const normalizarCodigo(c: string): string | null` (mayúsculas, solo A–Z, exactamente 4 letras; si no, `null`).
- Produce `SalaLogica`: `constructor(max = 4)`, `unir(): {ok:true, id:number, anfitrion:boolean} | {ok:false, motivo:'llena'}`, `salir(id): {cerrar:boolean}`, `destino(emisor:number, tipo:string): 'todos' | 'anfitrion' | 'descartar'`, `get anfitrionId(): number | null`, `get jugadores(): number[]`.
- Reglas: `ZOMBIS` y `FIN` solo vienen del anfitrión (si no, `descartar`); `DANO` va solo al anfitrión; el resto va a todos menos el emisor (`'todos'`); si sale el anfitrión, `cerrar: true`. Los ids no se reutilizan dentro de una misma sala.

- [ ] **Paso 1:** `git init` en la raíz del proyecto, crear `package.json` (`"type": "module"`, `"scripts": {"test": "node --test servidor/"}`) y `.gitignore` (`node_modules`, `.wrangler`, `pruebas/capturas`).
- [ ] **Paso 2: Escribir pruebas que fallan** en `servidor/SalaLogica.test.js`: `unir` asigna id 1 y `anfitrion:true` al primero y `anfitrion:false` al segundo; el quinto recibe `{ok:false, motivo:'llena'}`; `salir(anfitrion)` devuelve `{cerrar:true}` y `salir(otro)` `{cerrar:false}`; `destino(2,'ZOMBIS')` es `'descartar'` y `destino(1,'ZOMBIS')` es `'todos'`; `destino(2,'DANO')` es `'anfitrion'`; un id liberado no se reutiliza; `normalizarCodigo(' abcd ')` es `'ABCD'`, `normalizarCodigo('ab')` y `normalizarCodigo('AB1D')` son `null`.
- [ ] **Paso 3:** Ejecutar `npm test`. Esperado: FALLA (módulos no existen).
- [ ] **Paso 4:** Implementar `protocolo.js` y `SalaLogica.js` con las firmas de arriba.
- [ ] **Paso 5:** Ejecutar `npm test`. Esperado: todas pasan.
- [ ] **Paso 6:** Commit `feat: reglas de sala y protocolo`.

### Task 2: Worker y Durable Object con hibernación

**Archivos:**
- Crear: `servidor/index.js`, `servidor/Sala.js`, `wrangler.jsonc`, `.assetsignore`, `pruebas/red_sala.mjs`
- Modificar: `package.json` (devDependency `wrangler`)

**Interfaces:**
- Consume: `SalaLogica`, `T`, `MAX_BYTES`, `normalizarCodigo`.
- Produce: WebSocket en `/sala/<CODIGO>`; al conectar, el servidor envía `{t: T.HOLA, id, anfitrion, jugadores}`; cuando alguien entra/sale envía `{t: T.ENTRO, id}` / `{t: T.SALIO, id}`; al cerrarse por salida del anfitrión envía `{t: T.FIN, motivo:'anfitrion'}` y cierra los sockets. Los mensajes se reenvían según `destino`, añadiendo `de: <id emisor>`.

- [ ] **Paso 1:** `npm i -D wrangler`. Crear `wrangler.jsonc`: `name` del Worker actual (`square-river-fc0b`), `main: servidor/index.js`, `assets: {directory: ".", binding: "ASSETS"}`, `durable_objects.bindings: [{name:"SALA", class_name:"Sala"}]`, `migrations: [{tag:"v1", new_sqlite_classes:["Sala"]}]`, `compatibility_date` de hoy. `.assetsignore` excluye `servidor`, `docs`, `pruebas`, `herramientas`, `node_modules`, `wrangler.jsonc`, `package*.json`, `.git`.
- [ ] **Paso 2: Escribir la prueba que falla** `pruebas/red_sala.mjs` (usa el `WebSocket` global de Node 22; recibe la URL base como argumento): dos clientes entran a `/sala/ABCD`; el primero recibe `HOLA` con `anfitrion:true`, el segundo con `anfitrion:false`; un mensaje `JUGADOR` del 2º llega al 1º con `de:2` y no regresa al emisor; un `ZOMBIS` del 2º no llega a nadie; cinco clientes → el quinto recibe cierre con motivo `llena`; un mensaje de texto no JSON y otro de 20 KB no tumban la sala (el siguiente mensaje válido sigue llegando); si cierra el anfitrión, el otro recibe `FIN`; `/sala/ab1` responde 400.
- [ ] **Paso 3:** Arrancar `npx wrangler dev --port 8787` y ejecutar `node pruebas/red_sala.mjs ws://127.0.0.1:8787`. Esperado: FALLA.
- [ ] **Paso 4:** Implementar `servidor/index.js` (`fetch`: rutas `/sala/...` → `env.SALA.getByName(codigo)`; el resto → `env.ASSETS.fetch(request)`) y `servidor/Sala.js` (clase `Sala extends DurableObject`; usa `this.ctx.acceptWebSocket(ws)` y `ws.serializeAttachment({id})`; al despertar de la hibernación reconstruye `SalaLogica` desde `this.ctx.getWebSockets()`; `webSocketMessage` valida tamaño y JSON antes de reenviar).
- [ ] **Paso 5:** Ejecutar la prueba otra vez. Esperado: todas las comprobaciones pasan.
- [ ] **Paso 6:** Commit `feat: servidor de sala con Durable Object`.

### Task 3: Cliente de red y menú de sala

**Archivos:**
- Crear: `src/red/Red.js`, `pruebas/multi.py`
- Modificar: `src/main.js`, `src/juego/Partida.js`, `src/ui/Interfaz.js`, `index.html`, `css/estilos.css`, `sw.js`

**Interfaces:**
- Consume: `T`, `normalizarCodigo`.
- Produce `Red`: `constructor(ctx)`, `conectar(codigo: string): Promise<{id:number, anfitrion:boolean}>`, `enviar(tipo: string, datos: object): void`, `cerrar(): void`, `alMensaje(tipo: string, fn: (msg:object)=>void): void`, propiedades `activa: boolean`, `id`, `esAnfitrion`, `jugadores: number[]`. Se expone como `ctx.red`.
- `Partida`: nuevo `modoSala: boolean` (falso por defecto) y `iniciarSala(codigo, mapa)`.
- Menú principal: botón "Multijugador" → crear sala (genera código aleatorio) o unirse (campo de 4 letras); muestra el código y la lista de jugadores.

- [ ] **Paso 1: Escribir la prueba que falla** `pruebas/multi.py`: dos páginas Playwright contra `http://127.0.0.1:8787`; la 1 crea una sala y lee el código; la 2 se une con él en minúsculas; ambas muestran 2 jugadores en la lista; un código inválido muestra un mensaje de error y no entra; con el servidor apagado muestra "no se pudo conectar".
- [ ] **Paso 2:** Ejecutar (con `wrangler dev` activo). Esperado: FALLA.
- [ ] **Paso 3:** Implementar `Red.js` (reconexión: un solo reintento; si falla, aviso y vuelta al menú) y el menú en `Interfaz.js`/`index.html`/`estilos.css`. La URL del WebSocket se deriva de `location` (`wss://` si es https).
- [ ] **Paso 4:** Ejecutar `multi.py` y las pruebas existentes (`humo`, `juego`, `movil`). Esperado: todo pasa.
- [ ] **Paso 5:** Añadir `src/red/*.js` al `sw.js`, subir la versión de caché; commit `feat: cliente de red y menú de sala`.

### Task 4: Jugadores remotos visibles

**Archivos:**
- Crear: `src/red/Remotos.js`
- Modificar: `src/juego/Partida.js`, `src/main.js`, `pruebas/multi.py`

**Interfaces:**
- Consume: `ctx.red`, `ctx.jugador` (posición, yaw, pitch), `ctx.escena`.
- Produce `Remotos`: `constructor(ctx)`, `aplicar(msg: {de:number, p:[x,y,z], yaw:number, pitch:number, arma:string, vivo:boolean}): void`, `quitar(id: number): void`, `actualizar(dt: number): void` (interpola hacia el último estado; si pasan más de 1.5 s sin mensajes, deja de moverlo sin teletransportar), `broadcastEstado(dt)` envía `JUGADOR` a 15 Hz solo si `ctx.red.activa`.
- Un remoto se dibuja como cápsula con color por id hasta la Tarea 7.

- [ ] **Paso 1: Prueba que falla** (en `multi.py`): la página 1 se mueve; la página 2 ve un remoto en la posición aproximada (±1 m) tras 1 s, y tras mover la pestaña 1 a segundo plano 2 s y volver, el remoto no salta más de 5 m de golpe.
- [ ] **Paso 2:** Ejecutar. Esperado: FALLA.
- [ ] **Paso 3:** Implementar `Remotos.js` y engancharlo a `Partida.actualizar` solo si `modoSala`. `ZOMBIS`/`JUGADOR` de ids no existentes crean el remoto al vuelo; `SALIO` lo quita.
- [ ] **Paso 4:** Ejecutar `multi.py` y todas las pruebas existentes. Esperado: pasan.
- [ ] **Paso 5:** Commit `feat: jugadores remotos`.

### Task 5: Oleadas y zombis compartidos

**Archivos:**
- Modificar: `src/enemigos/GestorZombis.js`, `src/juego/Oleadas.js`, `src/enemigos/Zombi.js`, `src/juego/Partida.js`, `pruebas/multi.py`

**Interfaces:**
- Consume: `ctx.red`, `T.ZOMBIS`.
- Produce en `GestorZombis`: `instantanea(): {n:number, z:Array<[id, tipo, x, z, ry, vida, anim]>}` (anfitrión), `aplicarInstantanea(msg): void` (cliente: crea, mueve por interpolación y elimina réplicas sin IA ni colisiones propias) y `maxEnSala = 60` (tope de zombis activos en sala).
- Cada zombi tiene `id` estable asignado por el anfitrión. El anfitrión envía `ZOMBIS` a 10 Hz con la oleada y la puntuación compartida. Los clientes no ejecutan `Oleadas.actualizar`.

- [ ] **Paso 1: Prueba que falla**: anfitrión y cliente en el mismo mapa; el anfitrión fuerza una oleada; el cliente ve la misma cantidad de zombis (±2) y el mismo número de oleada tras 2 s.
- [ ] **Paso 2:** Ejecutar. Esperado: FALLA.
- [ ] **Paso 3:** Implementar. Con `modoSala` falso, `GestorZombis` y `Oleadas` se comportan exactamente como antes.
- [ ] **Paso 4:** Ejecutar `multi.py` y todas las pruebas existentes (`juego`, `municion`, `tienda`, `dash`). Esperado: pasan.
- [ ] **Paso 5:** Commit `feat: zombis y oleadas compartidos`.

### Task 6: Disparos y daño

**Archivos:**
- Modificar: `src/armas/SistemaArmas.js`, `src/enemigos/GestorZombis.js`, `src/red/Remotos.js`, `pruebas/multi.py`

**Interfaces:**
- Produce mensajes: `DISPARO {arma, o:[x,y,z], d:[x,y,z]}` (para efectos en los demás: sonido, fogonazo, trazo) y `DANO {zid:number, cantidad:number, cabeza:boolean}` (al anfitrión). El anfitrión aplica el daño, suma puntos al emisor y las muertes se reflejan en la siguiente instantánea.

- [ ] **Paso 1: Prueba que falla**: el cliente dispara a un zombi y la vida del zombi baja en el anfitrión; un disparo del cliente produce efecto visible en el anfitrión.
- [ ] **Paso 2:** Ejecutar. Esperado: FALLA.
- [ ] **Paso 3:** Implementar; en modo sala, el cliente no resta vida local, la aplica el anfitrión.
- [ ] **Paso 4:** Ejecutar `multi.py` y todas las pruebas existentes. Esperado: pasan.
- [ ] **Paso 5:** Commit `feat: disparos y daño en sala`.

### Task 7: Cuerpo de jugador y skins

**Archivos:**
- Crear: `herramientas/jugador_cuerpo.py`, `assets/modelos/jugador.glb`, `src/jugador/CuerpoJugador.js`
- Modificar: `src/red/Remotos.js`, `src/ui/Interfaz.js`, `index.html`, `src/config/Ajustes.js`, `sw.js`

**Interfaces:**
- Produce `CuerpoJugador`: `crearCuerpoJugador(skin: Skin): THREE.Object3D` y `type Skin = {ropa:number, piel:number, gorra:number|null, mochila:boolean}` (colores como enteros hex); `Skin` se guarda en `Ajustes` (clave `skin`), se valida al leer (valores fuera de rango → valores por defecto) y se envía en `HOLA`/`JUGADOR` inicial (`skin`).
- El .glb se genera con el mismo método que el zombi (script de `bpy`, huesos mínimos y animaciones caminar/reposo); si falla la carga, se usa la cápsula de la Tarea 4.

- [ ] **Paso 1: Prueba que falla**: dos páginas con skins distintas; la 1 ve a la 2 con el color de ropa configurado (se comprueba leyendo el color del material del remoto); una skin inválida en el mensaje se reemplaza por la de por defecto.
- [ ] **Paso 2:** Ejecutar. Esperado: FALLA.
- [ ] **Paso 3:** Generar el .glb, implementar `CuerpoJugador`, la pantalla de skin en el menú y el uso en `Remotos`.
- [ ] **Paso 4:** Ejecutar `multi.py` y todas las pruebas existentes. Esperado: pasan.
- [ ] **Paso 5:** Commit `feat: cuerpo de jugador y skins`.

### Task 8: Caída, salida del anfitrión y medición de uso

**Archivos:**
- Modificar: `src/juego/Partida.js`, `src/red/Red.js`, `src/red/Remotos.js`, `src/ui/Interfaz.js`, `pruebas/multi.py`
- Crear: `pruebas/uso_red.mjs`

**Interfaces:**
- Reglas: un jugador caído queda en espectador hasta que termine la oleada y reaparece; si todos están caídos, termina la partida (`FIN`); si el anfitrión se sale, todos reciben `FIN {motivo:'anfitrion'}`, ven un aviso y vuelven al menú.
- `uso_red.mjs`: abre 4 clientes simulados durante 60 s con la frecuencia configurada y calcula mensajes entrantes por segundo y solicitudes facturables por hora (entrantes ÷ 20 × 3600). Si supera 12,000/hora, falla.

- [ ] **Paso 1: Pruebas que fallan**: caída/reaparición; salida del anfitrión con aviso; `uso_red.mjs` con umbral.
- [ ] **Paso 2:** Ejecutar. Esperado: FALLAN.
- [ ] **Paso 3:** Implementar; si el umbral falla, bajar las frecuencias (jugador 10 Hz, zombis 8 Hz) y agrupar mensajes en un solo envío por ciclo.
- [ ] **Paso 4:** Ejecutar todo (`multi.py`, `uso_red.mjs`, pruebas existentes). Esperado: pasa.
- [ ] **Paso 5:** Commit `feat: reglas de sala y medición de uso`.

### Task 9: Despliegue desde GitHub y documentación

**Archivos:**
- Modificar: `README.md`, `sw.js`

- [ ] **Paso 1:** Documentar en `README.md`: cómo crear/unirse a sala, límites del plan gratis, cómo probar en local (`npx wrangler dev`), y las pruebas.
- [ ] **Paso 2:** Dar a la persona los pasos para subir el repositorio a GitHub y conectarlo en Cloudflare (Workers → el Worker existente → Settings → Builds → conectar el repositorio; comando de despliegue `npx wrangler deploy`). Esperar su confirmación.
- [ ] **Paso 3:** Tras el primer despliegue, comprobar con `node pruebas/red_sala.mjs wss://square-river-fc0b.hhbbbb008.workers.dev` que la sala funciona en producción.
- [ ] **Paso 4:** Commit `docs: multijugador y despliegue`.
