# Bolera 3D — contexto para Claude

Simulador de bolos de diez en el navegador. Repo: https://github.com/polb1/Bolos-3D (rama `main`). Lee también `README.md` y `REVERSE_ENGINEERING.md`. Responde en español.

## Origen
Reconstrucción inspirada en https://padel-mto1.onrender.com/ (simulador de pádel 3D). De la referencia se toman el estilo y la estructura, nunca sus recursos: azul marino `#0a1020`, acento lima `#d8f24a`, puntuaciones en dorado, paneles de cristal con desenfoque, menú central con chips, ajustes en pestañas, banner central y barras de cine.

## Stack
Vite + TypeScript + React 19 (solo la interfaz) + Zustand + Three.js imperativo dentro de la clase `Game` + Rapier (`@dimforge/rapier3d-compat`) + Web Audio sintetizado (sin archivos de audio) + Vitest.

## Virtual Arcade (local en pixel art)
El juego arranca en un centro recreativo 2D visto desde arriba, en pixel art y por salas (decisión del usuario); los juegos son 3D. Decisiones y etapas en `ARCHITECTURE.md`.
- `world/`: `World` (canvas 2D con zoom entero, bucle, movimiento, cámara, salas atenuadas, entrada/salida de actividades), `map` (salas, puertas, muebles), `sprites` (todo dibujado por código píxel a píxel), `collide` (círculo contra cajas), `activities` (registro en casillas), `worldStore`.
- Solo se dibuja la capa activa (`useWorldStore.place`): `#world-stage` o `#stage` (bolos 3D). Al volver, el personaje sigue donde estaba.
- **Air hockey** (`src/games/airhockey/`, diseño en `AIR_HOCKEY_DESIGN.md`): física 2D propia y sin gráficos con tests, IA por niveles, modos contra la IA, dos jugadores y entrenamiento. Interfaz en `src/ui/airhockey/`; `window.__hockey.frame(dt)` para probarlo.
- Billar, futbolín, dardos y recreativas están colocados y muestran «Próximamente»: cada uno irá en `src/games/<id>/` en 3D.
- En desarrollo, `window.__world` y `window.__game` permiten probar desde la consola; `__world.frame(dt)` avanza un paso aunque el panel del navegador esté oculto.

## Arquitectura de la bolera (`src/`)
- `config/`: `constants.ts` (medidas reglamentarias y parámetros físicos), `settings.ts`.
- `physics/PhysicsWorld.ts`: mundo de Rapier.
  - Pista con zona aceitada (μ 0,02, primeros 12,2 m) y zona seca (μ 0,26): de ahí sale el gancho, sin programarlo.
  - Canaletas, foso, bolos (casco convexo del perfil real) y bola.
  - Imperfecciones con semilla (`setVariation`): desnivel de la pista distinto en cada partida y tolerancias de los bolos.
  - Detección: bolos derribados (`isPinDown`, inclinación >32° o fuera de la plataforma) y bolos que se tambalean sin caer (`wobblers`).
- `scoring/scoring.ts`: reglas oficiales como funciones puras.
- `game/`:
  - `Game.ts`: bucle principal, fases, cámara y lanzamiento.
  - `SwingTracker.ts`: convierte el arrastre en tiro (velocidad y dirección de los últimos ~80 ms; la curva final del gesto da efecto).
  - `PinRack.ts`: recolocadora animada (barra de protección, mesa que levanta los bolos en pie, barrido al foso, recolocación o juego nuevo).
  - `match.ts`: turnos, splits y textos del banner.
  - `Input.ts`.
- `scene/`:
  - `Alley.ts`: bolera, pistas vecinas y luces.
  - `Monitor.ts`: tele sobre la pista. Muestra la puntuación y, tras un strike o spare, la cámara va a ella para un clip animado propio dibujado en canvas, que se puede saltar.
  - `pinMesh.ts`, `textures.ts` (todas las texturas son procedurales).
- `audio/`, `store/useGameStore.ts`, `ui/`, `utils/`.

## Decisiones del usuario (no deshacer)
- **Lanzamiento:**
  - Sin barra de potencia ni línea de tiro: se agarra la bola, se echa atrás y se suelta hacia los bolos.
  - La bola no cruza la línea de falta al arrastrar: al llegar a ella sale sola con la velocidad de la mano.
  - `Q`/`E` o la rueda dan un efecto de muñeca previo.
- **Dificultad alta:** dispersión humana en la suelta y bolos que pueden tambalearse sin caer. Los resultados siempre salen de la física, nunca de un aleatorio sin relación con ella.
- **Online:** la base está en `ONLINE.md`: sala por `?sala=`, servidor `npm run server` y jugadores visibles en el local. El juego debe seguir funcionando sin servidor.

## Comandos
`npm install` · `npm run dev` (http://localhost:5173) · `npm test` (64 tests) · `npm run server` (sala online, puerto 8787) · `npm run build`

## Pruebas en navegador
El navegador integrado de la app no tenía WebGL; se probó con Chrome headless + SwiftShader (`--use-angle=swiftshader --enable-unsafe-swiftshader`) y puppeteer-core. En headless los eventos del ratón llegan espaciados y la velocidad del gesto sale falsa. Para medirla bien, envía los eventos por CDP con `Input.dispatchMouseEvent` y un `timestamp` explícito.

## Pendiente / sin verificar
- Probar con GPU real: sensación del arrastre, velocidad de un gesto rápido, sonido.
- Clip de la tele en móvil.
- Ver el juego nuevo que baja tras un strike.
