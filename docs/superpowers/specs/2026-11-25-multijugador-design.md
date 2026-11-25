# Multijugador cooperativo — Última Noche (diseño)

Fecha: 2026-11-25 · Estado: pendiente de aprobación

## Intención y por qué
Jugar Última Noche con amigos contra las mismas oleadas de zombis, cada uno con su propia skin visible. El juego debe seguir funcionando igual en un solo jugador. El mundo abierto va después, sobre esta base.

## Metas
- Salas de hasta 4 jugadores, cooperativo (todos contra los zombis), con código de sala.
- Se ve a los demás jugadores con cuerpo y skin elegible (paleta de colores + accesorios).
- Funciona con el plan gratis de Cloudflare para jugar con amigos (~7 h/día de partida activa, estimación).
- Se publica desde GitHub al mismo Worker donde ya está el juego.

## No metas
- Nada de jugador contra jugador.
- Sin cuentas ni inicio de sesión (la skin y el progreso viven en el navegador).
- Sin protección contra tramposos (son amigos).
- Mundo abierto: queda fuera de este diseño.

## Anti-metas (sería un fracaso aunque funcione)
- Que el modo de un jugador se rompa o se vuelva más lento.
- Que los zombis se vean distintos para cada jugador de forma notoria.
- Que el servidor agote el plan gratis en una tarde.

## Restricciones
- Hosting: Cloudflare Worker (`square-river-fc0b.hhbbbb008.workers.dev`) con archivos estáticos. Hoy se sube por .zip, que no admite código de servidor; se pasará a GitHub (Workers Builds) con un `wrangler.jsonc`.
- Plan gratis: Durable Objects con SQLite, 100,000 solicitudes/día y 13,000 GB-s/día; los mensajes WebSocket entrantes cuentan 20:1; 10 ms de CPU por solicitud. Se debe usar la API de hibernación.
- Código sin paso de compilación en el cliente (módulos ES), como hoy.

## Enfoques considerados
1. **El anfitrión simula (elegido, recomendación mía).** Un jugador corre zombis y oleadas como hoy; un Durable Object solo retransmite. Reutiliza casi todo y gasta poco. A cambio, depende del equipo del anfitrión y, si se sale, la sala se cierra (traspaso de anfitrión: mejora posterior).
2. El servidor simula en Cloudflare: más justo, pero reescribir la lógica de zombis y el plan gratis no lo soporta bien (activo constante, 10 ms de CPU).
3. El servidor simula en la laptop (Node + tunnel): gratis, pero depende de que la laptop esté encendida.

Quién eligió: la persona pidió "hacerlo" tras ver la recomendación del enfoque 1 y los límites del plan gratis; se asume el enfoque 1 (confirmar al aprobar).

## Diseño (enfoque 1)
**Piezas**
- `servidor/` (nuevo): Worker + clase `Sala` (Durable Object con hibernación). Rutas: `/sala/<codigo>` abre el WebSocket. Reenvía mensajes, asigna ids de jugador y el rol de anfitrión (el primero en entrar), y avisa de entradas y salidas.
- `src/red/Red.js` (nuevo): cliente WebSocket, reconexión simple, envío a ~10–15 Hz con mensajes agrupados.
- `src/red/Remotos.js` (nuevo): jugadores remotos con interpolación de posición, giro y arma en mano.
- `src/jugador/CuerpoJugador.js` (nuevo): modelo visible del jugador (mismo método que los zombis: script de Blender → .glb) con paleta de colores y accesorios.
- Cambios en lo existente: `Partida` (modo "sala"), `Oleadas`, `GestorZombis` (en clientes no anfitriones, los zombis son réplicas sin IA), `Interfaz` (menú de sala, lista de jugadores, skin).

**Qué se sincroniza**
- Cada cliente → todos: posición, yaw/pitch, arma, estado (vivo/caído), disparos (para efectos).
- Anfitrión → clientes: lista de zombis (id, tipo, posición, vida), oleada actual, puntuación compartida, suministros.
- Cliente → anfitrión: daño que hizo a un zombi (el anfitrión lo aplica y confirma).
- Las compras, munición y equipo siguen siendo locales a cada jugador.

**Skins**
Elección en el menú (color de ropa, piel, gorra, mochila), guardada en el navegador y enviada al unirse.

## Fases (cada una se prueba antes de pasar a la siguiente)
1. Servidor + `wrangler.jsonc` + sala: dos navegadores conectados, con mensajes de ida y vuelta. Prueba automática con dos clientes simulados.
2. Jugadores remotos visibles (sin skin, cápsula) moviéndose suave.
3. Zombis y oleadas compartidas, con disparos y daño.
4. Cuerpo de jugador y skins.
5. Menú de sala, caída y reaparición, salida del anfitrión.
6. Ajuste de mensajes por segundo y medición del uso en el plan gratis.

## Decisiones de quien construye (mías, a revisar)
- 4 jugadores por sala, códigos de 4 letras.
- Frecuencia de envío: 15 Hz posición, 10 Hz zombis (se ajusta en la fase 6).
- Si el anfitrión se sale, la sala se cierra y se avisa.
- Si un jugador cae, espera a que termine la oleada para reaparecer.
- El modo con un jugador no usa la red.

## Riesgos
- Los límites del plan gratis se acaban antes de lo estimado: se medirá en la fase 6.
- El anfitrión con mucha carga (muchos zombis + 4 jugadores) puede bajar de FPS: se limita la cantidad de zombis activos en sala.
- Despliegue por GitHub: hay que migrar una vez del .zip al repositorio.
