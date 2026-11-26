# Última Noche — supervivencia zombi en primera persona (navegador)

Shooter de supervivencia por oleadas en 3D para navegador de escritorio.
Está hecho con **Three.js (WebGL 2)** y **Web Audio**, sin paso de compilación ni dependencias que instalar.
Todos los recursos son originales y **se generan por código al arrancar**: texturas, mapas de normales, modelos de armas y zombis, sonidos y música.

## Publicarlo

**Con multijugador (Cloudflare Workers, recomendado):** el juego y el servidor de salas van juntos en un mismo Worker
(`wrangler.jsonc`). Se publica desde GitHub: cada `git push` vuelve a desplegar. Pasos en [Multijugador → Publicar](#publicar-en-cloudflare-desde-github).

**Solo un jugador (cualquier hosting estático):** arrastra la carpeta (o el .zip) a Netlify, Cloudflare o similar. Funciona todo
menos el botón *Multijugador*, que necesita el servidor de salas.

## Cómo ejecutarlo

El juego usa módulos ES, así que **debe servirse por HTTP**: abrir `index.html` con doble clic no funciona.

```bash
# Opción 1: Python 3
cd ultima-noche
python -m http.server 8000
# Abre http://localhost:8000

# Opción 2: Node.js
npx serve .
```

Navegadores probados: Chrome / Edge 120+ y Firefox 120+. Requiere **WebGL 2**.
Para publicarlo en internet basta con subir la carpeta a cualquier hosting estático (GitHub Pages, Netlify, Vercel, un servidor Apache/Nginx…).

## Multijugador cooperativo

Hasta **4 jugadores** contra las mismas oleadas. Menú principal → **Multijugador**:

1. Escribe tu nombre y elige tu aspecto (ropa, piel, gorra, mochila). Se guarda en el navegador.
2. **Crear sala** te da un código de 4 letras (p. ej. `KZMR`); compártelo. Tus amigos lo escriben y pulsan **Unirse**.
3. El anfitrión (quien creó la sala) elige mapa y modo en *Mapa y modo*, pulsa **Elegir equipo y empezar** y todos entran.
   Quien llegue tarde se une a la partida en curso.

Reglas de la sala:
- Zombis, oleadas y daño son compartidos; cada uno usa su equipo, su munición y sus objetos.
- **Puntos, monedas y lo que suelta un zombi son para quien lo mata.** El bono de oleada es para todos.
- Hay +50 % de zombis por cada jugador extra (máximo 60 a la vez).
- Si caes, quedas como espectador detrás de un compañero y **reapareces al terminar la oleada**. Si caen todos, se acaba la partida.
- La pausa solo abre el menú: la partida de los demás sigue.
- Si el anfitrión se va, la sala se cierra y todos vuelven al menú. Si se cae tu conexión, vuelves al menú y puedes entrar de nuevo con el código.
- Jugar en sala no toca tu partida guardada ni tus récords de un jugador.

### Cómo funciona por dentro
- **El anfitrión simula** zombis y oleadas en su navegador, como en solitario; los zombis van a por el jugador vivo más cercano.
  Los demás ven **réplicas** que siguen la instantánea del anfitrión, interpoladas para que se muevan suave.
- Los impactos se calculan **en el navegador de quien dispara** (respuesta inmediata) y el anfitrión aplica el daño real y confirma la baja.
- El servidor (`servidor/`) es un **Durable Object** por sala que solo reenvía mensajes. Usa la API de hibernación: una sala vacía no gasta.
- Cada jugador envía **un paquete 12 veces por segundo**, con todo lo que tenga que decir en ese momento.
  Así una partida de 4 gasta unas 9.000 solicitudes facturables por hora: **unas 11 horas de juego al día con el plan gratis de Cloudflare**
  (con 2 jugadores, el doble). Lo mide `pruebas/multi.py uso`.
- Si la pestaña del anfitrión queda en segundo plano, la partida sigue simulándose (el navegador no la congela para los demás).

### Probar en tu computadora
```bash
npm install              # instala wrangler (solo la primera vez)
npx wrangler dev         # juego + salas en http://localhost:8787
```
Abre dos ventanas (o una normal y una de incógnito) en `http://localhost:8787` y crea/únete a una sala.
Para usar un servidor de salas en otra máquina (p. ej. tu laptop con un túnel), añade `?servidor=wss://tu-servidor` a la dirección del juego.

### Publicar en Cloudflare desde GitHub
1. Sube esta carpeta a un repositorio de GitHub (puede ser privado).
2. En el panel de Cloudflare: **Workers & Pages** → tu Worker **ultima** → **Settings** → **Builds** → **Connect** y elige el repositorio.
3. Comando de despliegue: `npx wrangler deploy` (sin comando de compilación). Guarda.
4. Cada `git push` a la rama principal vuelve a publicar el juego y el servidor juntos.

Si tu Worker tiene otro nombre, cámbialo en `name` dentro de `wrangler.jsonc`. El plan gratis basta: los Durable Objects con SQLite están incluidos.

## Controles (reasignables en Configuración → Controles)

| Acción | Tecla |
|---|---|
| Moverse | W A S D |
| Apuntar / mirar | Ratón (Pointer Lock, movimiento sin aceleración si el navegador lo permite) |
| Disparar / Apuntar con la mira | Clic izquierdo / Clic derecho |
| Recargar | R |
| Correr (no se agota; también hacia atrás con Mayús + S) | Mayús izquierda |
| Saltar | Espacio |
| Dash de esquive (3 cargas) | Q |
| Comprar arma, munición o botiquín en la pared | E |
| Cuchillo | V |
| Usar botiquín | H |
| Lanzar granada | G |
| Lanzar molotov | T |
| Ponerse chaleco | C |
| Bebida energética (recupera 1 carga de dash) | B |
| Linterna | F |
| Cambiar arma | 1-5 por ranura (5 = cuerpo a cuerpo) (pulsar otra vez alterna entre las armas de esa ranura), rueda del ratón, X (siguiente), Z (anterior) |
| Mostrar rendimiento | F3 |
| Pausa y liberar el ratón | Esc |

> Si ya tenías controles guardados de una versión anterior, "Arma anterior" pasa sola de Q a Z para dejar la Q al dash.

### Dash de esquive

- Impulso corto (0,2 s) y muy rápido, de unos 4 m, hacia donde te mueves; si estás quieto, hacia atrás. Sirve para salir de un grupo de zombis.
- **Eres invulnerable mientras dura el impulso.**
- **3 cargas.** Cada dash gasta una y vuelven de una en una: cada carga tarda 4 s, solo mientras falte alguna.
- Las cargas se ven como tres círculos bajo la barra de vida: llenos, el que se está recargando (se va rellenando) y vacíos.
- La **bebida energética** recupera una carga al instante (si ya tienes las 3, no se gasta).
- Valores ajustables en `src/jugador/Jugador.js` (constante `C`): `DASH_DURACION`, `DASH_VEL`, `DASH_CARGAS` y `DASH_RECARGA`.

### Ratón y pausa

- **Esc** suelta el ratón y abre la pausa; **Esc** otra vez (o *Reanudar*) vuelve al juego.
- Si el navegador no deja capturar el ratón (Chrome lo impide durante ~1 s después de pulsar Esc), la partida se queda en pausa con el aviso **"Haz clic para seguir jugando"**. Un clic y sigues; nada se mueve mientras tanto.
- El clic que captura el ratón no dispara.
- La rueda cambia de arma una vez por muesca; con touchpad, un gesto corto cambia una sola arma.
- La ayuda del menú principal muestra las teclas que tengas asignadas. Si al actualizar quedaron dos acciones en la misma tecla, se separan solas al cargar.

### Control (Xbox, PlayStation o genérico)

El control se activa al **pulsar uno de sus botones** (conectarlo no basta: así los dispositivos que el sistema reporta como mando sin serlo, como acelerómetros o mandos virtuales, no mueven la cámara). Si dejas el control quieto un momento y tocas el teclado o mueves el ratón con intención, el teclado y el ratón vuelven a mandar. Mientras usas el control, los movimientos de ratón y las teclas que emulan programas como **Steam** (con el control también mueves el cursor del escritorio) no le quitan el mando.

El control de Xbox funciona también en **Firefox para Linux**, donde el navegador no le da la distribución estándar de botones (gatillos y cruceta llegan como ejes y el juego los traduce).

Conecta el control por USB o Bluetooth y pulsa cualquier botón: se detecta solo y funciona a la vez que el teclado o la pantalla táctil (en celular, los botones en pantalla se ocultan mientras usas el control y vuelven al tocar la pantalla). La sensibilidad del stick derecho se ajusta en Configuración → General.

| Botón | En partida | En los menús |
|---|---|---|
| Stick izquierdo / L3 | Moverse / correr (alterna) | Elegir opción |
| Stick derecho / R3 | Mirar / cuchillo | — |
| RT (R2) / LT (L2) | Disparar o golpear / apuntar | — |
| A (✕) | Saltar | Aceptar |
| B (○) | Dash de esquive | Volver |
| Back / View (Share) | Bebida energética (+1 carga de dash) | — |
| X (□) | Recargar · comprar en la pared | — |
| Y (△) | Cambiar de arma | — |
| LB (L1) / RB (R1) | Molotov / granada | — |
| Cruceta | ↑ botiquín · ↓ chaleco · ← linterna · → arma anterior | Elegir opción |
| Start (Options) | Pausa | Continuar |

### Controles táctiles (móvil y tableta)

Se activan solos en pantallas táctiles (o en Configuración → General → Controles táctiles). Los de PC siguen funcionando a la vez.

- **Joystick izquierdo** (aparece donde apoyas el pulgar). Empujarlo a fondo hacia delante = correr.
- **Arrastrar en la mitad derecha** = mirar. El **botón rojo** dispara y, sin soltar, también apunta arrastrando. Hay un segundo botón de disparo a la izquierda.
- Botones: apuntar (alterna), recargar, saltar, cuchillo, cambiar arma, botiquín, granada, molotov ✸, chaleco ◈, bebida ⚡ y **dash ⇥** (con contador de cargas), linterna y pausa. El joystick a fondo hacia delante o hacia atrás = correr. **COMPRAR** aparece solo junto a una estación.
- Ajustes de sensibilidad táctil, tamaño y opacidad de los botones. En móvil arranca en *Muy bajo* con resolución dinámica, pide pantalla completa y horizontal.

- **Personalizar el HUD táctil**: desde el menú de pausa (*Personalizar HUD*) o en Configuración → General. Arrastra cada botón y los bloques de salud, arma, puntuación y oleada; tócalo para cambiar su tamaño (50-180 %). *Restablecer* vuelve al diseño original. El diseño se guarda y se adapta a cualquier tamaño de pantalla.

## Tienda, monedas y granadas

- **Monedas** (se conservan entre partidas): 1 por caminante o corredor, 2 por acorazado o escupidor, 15 por Coloso, +1 si es tiro a la cabeza, y 3 + 2×oleada al superar una oleada. Se guardan al momento. Se ven en el HUD y al final de la partida.
- **Tienda** (menú principal y pantalla de equipamiento):
  - Desbloquear armas para el equipamiento: P-9 y Avispa vienen incluidas; Toro 150, Recortada 200, Segadora 250, Halcón 350, Martillo 400, Lince 450, Lanzagranadas Tifón 600. Cuerpo a cuerpo: el **bate, el hacha y el marro vienen desbloqueados**. **La katana no se compra: se desbloquea al matar 5 Colosos** (se cuentan entre todas las partidas).
  - Suministros para tu reserva (máx. 20 de cada):

    | Suministro | Precio | Te llevas por partida | Efecto |
    |---|---|---|---|
    | Botiquín | 40 | 3 | Cura 60 de salud (H o botón +) |
    | Granada | 25 (lote de 5: 110) | 4 | Fragmentación, 6,5 m (G o botón ●) |
    | Molotov | 30 | 3 | Charco de fuego 7 s (T o botón ✸) |
    | Chaleco | 60 | 2 | 100 de protección (C o botón ◈) |
    | Bebida energética | 20 | 3 | Recupera 1 carga de dash al instante (B o botón ⚡) |
  - Las compras en las paredes con *puntos* de partida siguen funcionando igual.
- **Granadas de fragmentación** (G o botón ●): se lanzan con animación, rebotan contra el escenario, explotan a los 2,3 s con daño en 6,5 m (con caída y necesitando línea de visión), empujan a los zombis, dejan una marca chamuscada y también te hacen daño si estás demasiado cerca.

- **Molotov** (T o botón ✸): se rompe al chocar (contra el suelo, una pared o un zombi) y deja un charco de fuego de 3,2 m durante 7 s que quema a los zombis que lo pisan (también te quema a ti si te metes).
- **Chaleco** (C o botón ◈): 100 puntos de protección que absorben el 70 % del daño hasta agotarse (barra azul bajo la salud).
- **Bebida energética** (B o botón ⚡): recupera al instante **1 carga de dash** (ver *Dash de esquive*). Ya no da energía ni velocidad: correr no gasta nada.

## Equipamiento

- Antes de cada partida eliges **arma secundaria** (P-9 o Toro .45), **arma principal** (Avispa, Segadora, Recortada, Martillo, Lince, Halcón o Lanzagranadas Tifón) y, si quieres, un **arma cuerpo a cuerpo** para la ranura 5, con fichas de daño, cadencia, alcance y precisión. Empiezas con su munición inicial; la elección se recuerda y *Reiniciar* / *Jugar de nuevo* la reutilizan.
- **Lanzagranadas Tifón** (ranura 4): dispara granadas que explotan al chocar (300 de daño en 5 m). Un tiro por recarga; las cajas de munición dan 3 granadas. A quemarropa también te hace daño.
- **Armas cuerpo a cuerpo** (ranura 5, sin munición; clic izquierdo o RT para golpear, manteniendo pulsado golpea seguido):
  - **Bate**: rápido, aturde y alcanza a 2 zombis.
  - **Hacha**: corte fuerte a un zombi.
  - **Marro** (martillo de demolición): lento y pesado, alcanza a 3 zombis, los lanza lejos y los aturde 1 s.
  - **Katana** (se gana matando 5 Colosos): barrido amplio con efecto de media luna blanca que alcanza a 5 zombis; **arranca de un tajo la armadura y el casco** de los acorazados y **mata de un golpe a los débiles** (caminantes, corredores y escupidores). Al Coloso le hace daño extra.
- El cuchillo (V) se sigue llevando siempre.
- **Barrido visual en todas las armas cuerpo a cuerpo** (solo estético; no cambia el daño ni los objetivos): el bate hace un barrido corto y rápido de tono crema, el hacha un arco vertical rojo, el marro uno amplio y lento azul acero, y la katana su media luna blanca de siempre. Se configuran en `src/armas/DefArmas.js` (campo `barrido`: color, escala, duración, vertical).
- **Recarga un 8 % más rápida** en todas las armas de fuego: el tiempo de recarga es el de la tabla dividido entre 1,08 (unos 7,4 % menos; por ejemplo, el subfusil pasa de 2,0 s a 1,85 s). Se cambia con una sola constante, `C.BONO_RECARGA` en `src/armas/DefArmas.js`.
- **Sin autoapuntado**: la asistencia de apuntado se quitó; los disparos van exactamente donde apuntas.
- **Estilo visual** (Configuración → General): *Realista* o *Cómic*. El modo Cómic da a los zombis sombreado plano por tonos, colores apagados y contornos negros en toda la escena, al estilo de los juegos de aventura con aspecto de cómic.

## Modelo de los zombis (hecho en Blender)

Los zombis usan un cuerpo modelado en Blender: cara demacrada con cuencas oscuras y dientes, pelo desordenado, camisa de franela rota (verde, roja, azul o gris), jeans sucios y botas. Está en `assets/modelos/zombi.glb` y se generó con el script `herramientas/zombi_caminante.py`.

- Cada tipo conserva lo suyo: el **corredor** es más flaco y va sin camisa, el **escupidor** tiene la barriga hinchada y las pústulas, el **Coloso** es enorme, sin camisa y con el brazo deforme, y el **acorazado** lleva placas y casco. La **katana** le arranca las placas y el casco y deja ver la camisa rota.
- El juego usa del modelo solo la malla y las texturas. Lo anima su propio esqueleto, así que el andar, los ataques, el aturdimiento, las sacudidas por impacto y la decapitación siguen igual.
- Algunos caminantes han perdido una mano.
- Si el archivo no carga, el juego usa automáticamente el zombi clásico.

**Para cambiar el modelo:** abre Blender, ve a la pestaña *Scripting*, abre `herramientas/zombi_caminante.py`, cambia `SEMILLA` si quieres otra variante y pulsa ▶. Copia el `zombi_caminante.glb` que genera a `assets/modelos/zombi.glb`. También puedes retocar el modelo en Blender antes de exportarlo, siempre que conserves los nombres de los huesos y de los materiales (`zc_piel`, `zc_camisa`, `zc_jeans`…).

## Mapas

| Mapa | Dificultad | Descripción |
|---|---|---|
| Barrio Cenizas | Media | Cruce de calles con puesto de control, gasolinera, solar y obras |
| Hospital San Judas | Alta | Patio de urgencias con tiendas de triaje, ambulancias y un helicóptero estrellado; los zombis también salen por las puertas del hospital |
| Ruta 9 | Media | Autopista atascada con peaje, paso elevado, tráiler cruzado, motel y taller; largas líneas de tiro |
| Granja Los Álamos | Muy alta | Granero, casa, silo y maizales que tapan la vista; más oscuro y con más niebla |

Se elige en **Mapa y modo**; al elegirlo se carga al instante como fondo del menú. Récords por mapa y modo. Para añadir mapas: `src/mundo/mapas/` (ver `BarrioCenizas.js` como plantilla) y registrarlo en `mapas/index.js`.

## Jugabilidad

- **Oleadas progresivas.** Cada oleada trae más zombis, con más vida y una mezcla de tipos más peligrosa. Cada 5 oleadas aparece un jefe, el **Coloso**. Entre oleadas hay un descanso de 12 segundos.
- **5 tipos de zombi**, cada uno con su IA, velocidad, resistencia, animaciones y voz:
  - **Caminante**: lento; algunos cojean o han perdido un brazo.
  - **Corredor**: muy rápido y frágil.
  - **Acorazado**: chaleco que reduce a la mitad el daño al torso. El casco absorbe disparos a la cabeza hasta que salta.
  - **Escupidor**: mantiene la distancia, lanza ácido con trayectoria balística y deja charcos corrosivos. Revienta al morir.
  - **Coloso**: jefe de gran tamaño. Golpea el suelo con daño en área, carga en línea recta y queda aturdido si choca contra un obstáculo.
- **IA.**
  - Detección por distancia, línea de visión y ruido de disparos.
  - Persecución por **campo de flujo**: rodean edificios y coches sin atravesar paredes.
  - Separación entre zombis para que no se amontonen.
  - Detección de atascos; si un zombi se queda atascado lejos del jugador, reaparece en otro punto.
- **8 armas + cuchillo**, en 4 ranuras:

  | Ranura | Arma | Tipo | Precio |
  |---|---|---|---|
  | 1 | P-9 Centinela | Pistola semiautomática (inicial) | — |
  | 1 | Toro .45 | Pistola pesada semiautomática, atraviesa 2 zombis | 600 |
  | 2 | Avispa SMG | Subfusil automático | 1000 |
  | 3 | Segadora 12 | Escopeta de corredera, recarga cartucho a cartucho | 1250 |
  | 3 | Recortada Mula | Escopeta de dos cañones: dos disparos devastadores a corta distancia, recarga basculante | 900 |
  | 3 | Martillo S12 | Escopeta semiautomática de cargador | 1750 |
  | 4 | Lince AR | Fusil automático | 2000 |
  | 4 | Halcón DMR | Fusil de tirador semiautomático con mira telescópica (zoom 2,4×), atraviesa 3 zombis | 1500 |

  - Valores de cada arma: munición limitada, cadencia, dispersión (de cadera, al apuntar, en movimiento y en el aire), retroceso con muelle, caída de daño con la distancia y penetración.
  - Recarga por cargador (táctica y en vacío), cartucho a cartucho (interrumpible disparando) o basculante.
- **Cajas de munición**: aproximadamente 1 de cada 6-7 zombis (y siempre el Coloso) suelta una al morir. Al pasar por encima, el arma en la mano recibe su cantidad completa (90 balas de subfusil o fusil, 72 de pistola, 32 de Toro o Martillo, 30 de Halcón, 24 cartuchos de Segadora, 20 de Recortada) y el resto de tus armas el 60 %, sin pasar de la reserva máxima. Duran 40 s en el suelo.
- **Reabastecimiento**: al superar cada oleada recibes 2 cargadores para cada arma que llevas.
- **Granadas y bebidas energéticas en la partida**: aproximadamente 1 de cada 9 zombis (entre 7 y 11 bajas) suelta una granada o una lata de bebida, al azar; el Coloso siempre suelta una de cada. Brillan con un halo verde (granada) o azul (bebida) y se recogen pasando por encima si no llevas el máximo (4 granadas, 3 bebidas); si vas lleno se quedan en el suelo. Duran 40 s (parpadean los últimos 6). Se ajustan en `src/juego/Suministros.js` (`SUMINISTRO_CAIDA`).
- **Botiquines** (máximo 3; curan 60 de salud con animación de uso). Se compran en una estación de pared (750), aparecen 2 en el mapa al empezar cada oleada, el Coloso siempre suelta uno y cualquier zombi tiene un 4 % de soltarlo (desaparece a los 40 s).
  - Animaciones: correderas, bomba, extracción del cargador, cambio de arma y balanceo.
- **Economía.** Ganas puntos al acertar y al abatir zombis, con bonificación por tiro a la cabeza, por cuchillada y por oleada completada. Con ellos compras armas y munición en las paredes; la puntuación total lleva multiplicador por racha.
- **Movimiento.** Correr no tiene límite ni barra de resistencia (también hacia atrás) y hay un dash de esquive con 3 cargas.
- **Salud.** Se regenera tras unos segundos sin recibir daño. Hay indicadores direccionales de daño, viñeta de sangre y latido cuando la salud es baja.
- **Modos.**
  - **Supervivencia**: 15 oleadas; si las superas, ganas.
  - **Noche eterna**: oleadas infinitas.
  - **Pesadilla**: 10 oleadas con zombis más duros.
- **Continuar.** La partida se guarda al empezar cada oleada (localStorage). Cada modo guarda su récord.

## Configuración gráfica

Hay cinco perfiles (**Muy bajo, Bajo, Medio, Alto, Ultra**) y un perfil **Personalizado**, que se activa al tocar cualquier opción.
**Todas las opciones se aplican al instante, sin reiniciar.** Cada una cambia parámetros reales del motor:

| Opción | Qué cambia realmente |
|---|---|
| Resolución interna | `pixelRatio` del renderizador (50-150 %) |
| Texturas | Regenera las texturas procedurales a 128-2048 px; mapas de normales desde Alto; filtrado anisótropo 1-16x |
| Sombras | Desactivadas / básicas 512 / PCF suave 1024 / 2048 / 4096 de penumbra amplia; en Ultra, las 2 farolas más cercanas también proyectan sombras |
| Distancia de renderizado | Plano lejano 45-170 m y ocultación de sectores del mapa por distancia |
| Detalle (LOD) | Polígonos de los zombis (4 niveles), distancias de LOD, detalles pequeños (dientes, dedos, costillas, púas) y objetos decorativos |
| Iluminación | Lambert (sin luces dinámicas) o PBR con 2/4/8/12 luces dinámicas asignadas a las fuentes más cercanas; en Ultra, sombras de la linterna |
| Oclusión ambiental | GTAO a media o a resolución completa |
| Antialiasing | FXAA, SMAA, MSAA 4x u 8x |
| Partículas | Tope de 500 a 9000 partículas y densidad de emisión |
| Efectos visuales | Luz del fogonazo, trazadoras, casquillos físicos, número de calcas de sangre y agujeros, duración de los cadáveres y audio HRTF |
| Niebla | Lineal, exponencial y capas de bruma volumétrica animada |
| Reflejos | Mapa de entorno o charcos con reflejo planar real (media o completa resolución) |
| Postprocesado | Gradación de color, bloom, viñeta, grano, aberración cromática y profundidad de campo con enfoque automático |
| Resolución dinámica | Baja la resolución interna hasta el 60 % si los FPS caen bajo el objetivo y la recupera con margen (con histéresis) |
| VSync / límite de FPS | Bucle con `requestAnimationFrame` o sin esperar al refresco, con tope de 30 a 240 FPS |

**Rendimiento.**
- Medidor de FPS con tiempo de fotograma, 1 % bajo, llamadas de dibujo, triángulos, memoria GPU y memoria JS (F3).
- Límite dinámico de zombis simultáneos según los FPS.
- Calidad automática opcional.
- Reserva de objetos (*pooling*) para zombis, partículas, calcas, casquillos, trazadoras y proyectiles.
- Geometría estática fusionada por sector y material.
- LOD geométrico y de animación: los zombis fuera de cámara o lejos se animan con menos frecuencia.

**Optimización de Ultra** (mismo aspecto, ~5 veces menos coste por fotograma medido en el mismo equipo):
- Sombras de la luna en PCF 4096 con disco de Vogel en vez de VSM 4096 con dos pasadas de desenfoque (era el ~70 % del coste).
- La oclusión ambiental (GTAO) y la profundidad de campo leen la profundidad del render principal en vez de volver a dibujar toda la escena (y todos los mapas de sombra) cada una.
- Cada zombi es una única malla con piel rígida (~7 llamadas de dibujo en vez de 28, también en las sombras).
- Charcos con reflejo a resolución reducida, sin MSAA, sin objetos menudos/partículas/calcas en el reflejo y desactivados si no hay charcos cerca y a la vista.
- Sombras de farolas actualizadas en fotogramas alternos; luces solo para fuentes a menos de 34 m; densidad de píxeles limitada a 2.

### Optimizaciones de esta versión

- El reflejo de los charcos se recalcula cada dos fotogramas (ahorra ~100 llamadas de dibujo por fotograma en Ultra).
- Los zombis lejanos ya no proyectan sombra (solo los cercanos y medios).
- Sin autoapuntado ya no se lanzan rayos contra los zombis en cada fotograma.
- El fuego del molotov reutiliza la luz de las explosiones (añadir luces encarece todos los materiales).
- En pantallas táctiles la densidad de píxeles se limita a 1,5× (hasta un 44 % menos de píxeles en celulares de alta densidad).
- El zombi de Blender junta piel, camisa y jeans en una sola textura, y los ojos, la boca y los dientes no proyectan sombra. Por eso cada caminante necesita 2 materiales en su malla principal en vez de 5 o 6. Con 20 zombis en Ultra hay menos llamadas de dibujo (858 frente a 960) y casi la mitad de triángulos (313 mil frente a 555 mil).

## Estructura del proyecto

```
index.html              Menús y HUD (HTML), mapa de importación de módulos
css/estilos.css         Estilo de la interfaz
vendor/three/           Three.js r187 + addons (postprocesado, Reflector, GLTFLoader, utilidades) — MIT
assets/modelos/         zombi.glb (cuerpo del zombi modelado en Blender)
herramientas/           zombi_caminante.py (script de Blender que genera zombi.glb)
src/
  main.js               Arranque y bucle principal
  motor/                Motor (render, postproceso, bucle), Recursos (texturas/materiales),
                        Entrada (teclado/ratón/pointer lock + capa virtual), Tactil (joystick y botones), Mando (control con la Gamepad API),
                        Colisiones (AABB, rayos), Eventos
  config/               Ajustes (perfiles, opciones, controles) y Graficos (aplicación en vivo)
  mundo/                Mundo (constructor de mapas, carga/descarga), Cielo, Iluminacion
  mundo/mapas/          Barrio Cenizas, Hospital San Judas, Ruta 9, Granja Los Álamos
  jugador/              Controlador en primera persona (movimiento, dash de esquive con cargas, salud) y cuerpo visible con skins (CuerpoJugador)
  armas/                Definiciones, modelos procedurales y sistema de armas
  enemigos/             Tipos, modelo con esqueleto, cuerpo del .glb (CuerpoGLB), IA del zombi, navegación, gestor
  efectos/              Partículas GPU, calcas y proyectiles de ácido
  juego/                Partida, oleadas, puntuación, botiquines y guardado
  ui/                   Interfaz (menús, configuración y HUD)
  audio/                Síntesis de sonido, audio 3D y música generativa
  rendimiento/          Medidor y adaptación automática
  red/                  Multijugador: protocolo, cliente de red (Red), jugadores remotos (Remotos), réplica de zombis y oleadas (Replicacion)
servidor/               Worker de Cloudflare: rutas (index.js), sala como Durable Object (Sala.js) y sus reglas (SalaLogica.js)
wrangler.jsonc          Configuración del Worker (archivos estáticos + Durable Object de salas)
pruebas/                Pruebas automáticas con Playwright (Python) y del servidor (Node)
```

Para depurar, el contexto del juego está disponible en la consola como `window.__juego`.

## Pruebas

En `pruebas/` hay pruebas automáticas con Playwright para Python. Cada una levanta su propio servidor y abre Chromium sin ventana, con WebGL por software:

```bash
pip install playwright
python3 pruebas/humo.py       # carga, menús, controles, sin rastro de estamina
python3 pruebas/juego.py      # moverse, correr sin límite, saltar, disparar, recargar, oleada, pausa, barridos
python3 pruebas/tienda.py     # monedas, compras, límites, suministros, bebida
python3 pruebas/municion.py   # cajas de munición, reparto, reabastecimiento, compra en la pared
python3 pruebas/dash.py       # 3 cargas, cuarto bloqueado, recarga de una en una, invulnerabilidad, bebida
python3 pruebas/recarga.py    # recarga con C.BONO_RECARGA (subfusil = 2,0 / 1,08 s)
python3 pruebas/movil.py      # celular 844×390: botón ⇥ y cargas visibles y respondiendo al toque
```

Multijugador (necesitan el servidor local de salas):

```bash
npm test                          # reglas de la sala (node:test, sin Cloudflare)
sh pruebas/servidor_local.sh      # arranca `wrangler dev` desde una copia en /tmp (no se reinicia al editar)
node pruebas/red_sala.mjs         # servidor: anfitrión, reenvío, paquetes, sala llena, basura, cierre
python3 pruebas/multi.py          # 2 navegadores: sala, remotos, zombis, daño, skins, reglas y consumo
python3 pruebas/multi.py uso      # solo la medición de mensajes por segundo y horas de juego en el plan gratis
node pruebas/red_sala.mjs wss://ultima.hhbbbb008.workers.dev   # contra el servidor publicado
```

Si Chromium no está en `/opt/pw-browsers/chromium`, indica su ruta con la variable `CHROMIUM` (o instala el de Playwright con `python3 -m playwright install chromium`).

## Créditos

Código, modelos, texturas, sonidos y música originales, generados por código para este proyecto (el zombi, con un script de Blender incluido en `herramientas/`).
Three.js © 2010-2025 three.js authors, licencia MIT (ver `vendor/three/LICENSE-three.txt`).
