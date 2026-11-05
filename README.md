# Bolera 3D

Simulador de bolos de diez en el navegador: pista reglamentaria en 3D, física de cuerpos rígidos real (Rapier) y puntuación oficial. Su interfaz parte del análisis de *Pádel 3D* (ver [REVERSE_ENGINEERING.md](REVERSE_ENGINEERING.md)).

## Uso

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # reglas de puntuación, turnos y física (headless)
npm run build    # producción en dist/
```

Requiere un navegador con WebGL (si no hay, la app lo indica).

## Controles

No hay barra de potencia ni línea de tiro: **el lanzamiento es el gesto**.

1. Agarra la bola (ratón o dedo) en la zona de aproximación.
2. Échala hacia atrás y lánzala hacia los bolos soltando el botón o el dedo.
3. La **velocidad y la dirección** de la bola son las de tu mano en los últimos ~80 ms; si el gesto **se curva** al final, la bola sale con efecto (como girar la muñeca).
4. La mano no puede pasar de la **línea de falta**: si llegas a ella arrastrando, la bola se suelta ahí con la velocidad que llevabas. Un gesto demasiado lento (< 1,5 m/s) solo deja la bola en el suelo.

| Acción | Escritorio | Táctil |
|---|---|---|
| Efecto de muñeca previo | `Q` / `E` o rueda | ↩ ↪ |
| Cámara · sonido · pausa | `C` · `M` · `ESC` | botones superiores |

Tras cada tiro se muestra lo que hiciste: km/h, ángulo y efecto.

## Cómo funciona la física

- Unidades reales: pista de 18,29 m y 1,054 m, bolos de 1,53 kg con el perfil reglamentario (casco convexo), bola de 21,7 cm y 12–16 lb, separación de 30,48 cm.
- **El gancho es emergente**: los primeros 12,2 m tienen fricción de pista aceitada (μ 0,02) y el resto, seca (μ 0,26). La bola sale patinando con rotación lateral; al llegar a la zona seca la fricción convierte esa rotación en desplazamiento lateral.
- Paso fijo de 1/240 s con CCD para la bola. Un bolo cuenta como derribado si se inclina más de ~32° o sale de la plataforma. Los bolos en pie se quedan donde están para la segunda bola.
- **Imperfecciones reales** (con semilla, reproducibles en tests): cada partida se juega en una pista con un ligero desnivel lateral distinto (milésimas de radián) que desvía la bola; los bolos varían dentro de la tolerancia reglamentaria (1,45–1,64 kg, colocación ±2,5 mm, fricción y rebote), y la suelta añade una pequeña dispersión sobre tu gesto.
- Un bolo reglamentario vuelca a partir de ~10°: los que se tambalean por debajo vuelven a su sitio y siguen en pie (el banner lo anuncia).
- **Tele de la bolera**: encima de la pista cuelga un monitor con tu puntuación. Tras un strike o un spare la cámara sube a la tele y reproduce un clip animado propio (bola entrando, bolos saltando, confeti y rótulo ¡STRIKE! / ¡DOBLE! / ¡PAVO! / ¡SPARE!) dibujado en tiempo real, con los bolos que estaban en pie en ese tiro. Se salta con clic, toque o `ESPACIO`.
- La máquina recolocadora barre los bolos caídos al foso y, cuando toca, baja un juego nuevo.
- Los sonidos (rodadura, impactos, canal, strike…) se sintetizan con Web Audio a partir de los eventos de contacto y la velocidad de la bola.

## Arquitectura

```
src/
  config/     constants.ts (medidas y parámetros físicos), settings.ts (opciones y calidad)
  physics/    PhysicsWorld.ts (mundo Rapier: pista, canaletas, foso, bola, bolos), pinShape.ts
  scoring/    scoring.ts — reglas oficiales, funciones puras
  game/       Game.ts (bucle, fases, cámara), PinRack.ts (bolos + recolocadora),
              SwingTracker.ts (gesto → tiro), Input.ts, match.ts (turnos, splits, banners)
  scene/      Alley.ts (bolera, luces), pinMesh.ts, textures.ts (texturas procedurales)
  audio/      AudioEngine.ts
  store/      useGameStore.ts (Zustand: pantallas, partida, HUD, ajustes, estadísticas)
  ui/         componentes React (menú, configuración, HUD, marcador, pausa, resultados, táctil)
  utils/      storage.ts, math.ts
```

React solo pinta la interfaz; Three.js funciona en modo imperativo dentro de `Game`, como en la web de referencia. Los dos se comunican a través del store.

Ajustes, récord y estadísticas se guardan en `localStorage` (`bowl.*`).
