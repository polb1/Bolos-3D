# Virtual Arcade — contexto para Claude

Salón de juegos en el navegador: un local 3D en tercera persona con bolera, air hockey y dardos jugables (billar, futbolín y recreativas aún «Próximamente»). Repo: https://github.com/polb1/Bolos-3D. Lee también `README.md`, `ARCHITECTURE.md` y `REVERSE_ENGINEERING.md`. Responde en español.

## Estilo visual (decisión del usuario, nov 2026)
Local cálido y acogedor, nada futurista ni neones: suelo de roble, yeso con zócalo de madera, ladrillo tras la barra, vigas, lámparas colgantes de luz cálida, alfombras, sofás, cuadros y plantas. Rótulos de madera pintada (`woodSign`). La interfaz usa paneles color espresso, texto crema y acento ámbar (`--lime` y `--blue-*` en `styles.css` conservan el nombre antiguo: son el acento y los tonos suaves). Los minijuegos ocurren dentro del mismo salón (`world3d/lounge.ts`).

## Stack
Vite + TypeScript + React 19 (solo la interfaz) + Zustand + Three.js imperativo (cada juego es una clase con su `renderer`) + Rapier (`@dimforge/rapier3d-compat`, solo bolera) + Web Audio sintetizado (sin archivos de audio) + Vitest. Todas las texturas son procedurales (`utils/canvas.ts`).

## Estructura (`src/`)
- `world3d/`: local 3D por defecto. `World` (bucle, movimiento, cámara, entrada/salida de actividades), `Hall` (el edificio y sus zonas), `props` (muebles), `textures`, `lounge` (sala compartida por los minijuegos), `activities` (puntos de juego), `hockeyLobby` (círculos online).
- `world/`: local alternativo en pixel art 2D, y lo compartido por ambos locales: `worldStore`, `instance`, `collide`.
- `games/bowling/`: la bolera (ver abajo). `games/airhockey/`: física 2D propia con tests, IA por niveles, online 1 contra 1 (diseño en `AIR_HOCKEY_DESIGN.md`). `games/darts/`: dardos. Cada juego lleva su interfaz en `games/<id>/ui/`.
- `net/`: cliente y protocolo de la sala online (servidor en `server/`). `audio/`, `config/settings.ts` (ajustes y calidad), `ui/` (App, portada, carga, `common.ts` con `click`/`useEsc`), `utils/` (matemáticas, aleatorio con semilla, `SwingTracker`, `canvas`).
- Solo se dibuja la capa activa (`useWorldStore.place`). Al volver, el personaje sigue donde estaba.

## Bolera (`games/bowling/`)
- `constants.ts`: medidas reglamentarias y parámetros físicos.
- `physics/PhysicsWorld.ts`: pista con zona aceitada (μ 0,02, primeros 12,2 m) y seca (μ 0,26), de ahí sale el gancho; bolos con el casco convexo del perfil real; imperfecciones con semilla; bolos derribados y bolos que se tambalean.
- `scoring/`: reglas oficiales como funciones puras. `game/`: `Game` (bucle, fases, cámara, lanzamiento), `PinRack` (recolocadora), `match`, `ai`, `Input`. `scene/`: `Alley`, `Monitor` (tele con clip tras strike/spare), `pinMesh`, `textures`. `store/useGameStore.ts`. `ui/`.

## Dardos (`games/darts/`)
- `physics.ts` (puro, con tests): radios reglamentarios, `scoreAt`, vuelo con gravedad y rozamiento (`fly`), `launch`, 501 con doble salida, rebotes en el alambre o contra otro dardo (`bounceOut`, geometría pura para que el online coincida), objetivos de la IA (`aiTarget`, `bedCentre`).
- `Darts.ts`: escena, gesto (pulsar = apuntar, echar atrás y lanzar), partidas al mejor de 5 legs contra la IA (Fácil/Media/Experta ≈ 50/30/20 dardos por leg) u online (se envían origen y velocidad del tiro; ambos lados simulan lo mismo). Cartel de reglas clicable con zoom (`poster.ts`).
- La fuerza del gesto cambia poco la velocidad (exponente 0,05): un 5 % más de velocidad ya sube el dardo ~10 cm.

## Decisiones del usuario (no deshacer)
- **Bolera:** sin barra de potencia ni línea de tiro: se agarra la bola, se echa atrás y se suelta; al llegar a la línea de falta sale sola con la velocidad de la mano; `Q`/`E` o la rueda dan efecto. Dispersión humana y bolos que pueden tambalearse; los resultados siempre salen de la física.
- **Dardos:** primer diseño (diana clásica de bar, pared lisa), sin mira, dardo centrado abajo, línea a 2,37 m.
- **Online:** sala por `?sala=`, servidor `npm run server`; el juego debe funcionar sin servidor. Render despliega a mano (Manual Deploy) y el servidor se redespliega con el cliente.

## Comandos
`npm install` · `npm run dev` (http://localhost:5173) · `npm test` (76 tests) · `npm run server` (sala online, puerto 8787) · `npm run build`

## Pruebas en navegador
En desarrollo `window.__world`, `__game`, `__hockey`, `__darts` y `__stores` están expuestos. Todos tienen `frame(dt)` para avanzar a mano: el panel del navegador integrado suele estar oculto y entonces `requestAnimationFrame` no corre. Para entrar en un juego: `__world.enter()`, poner `__world.pos` sobre la actividad, `__world.frame(0.016)` y `__world.interact()`. En headless los eventos del ratón llegan espaciados y la velocidad de un gesto sale falsa.

## Pendiente / sin verificar
- Probar con GPU, ratón y dedo reales: sensación de los gestos, rendimiento del local en móviles modestos, sonido.
- Billar, futbolín y recreativas siguen sin juego.
