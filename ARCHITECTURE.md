# Virtual Arcade — arquitectura

Evolución de *Bolera 3D* a un centro recreativo 3D por el que se camina con un personaje.
Este documento recoge el análisis previo y las decisiones técnicas.

## 1. Análisis del proyecto actual

| Pieza | Cómo está hecha | ¿Reutilizable? |
|---|---|---|
| Render | Three.js imperativo dentro de la clase `Game` (sin React Three Fiber) | Sí: el mundo usa el mismo patrón |
| Física | Rapier (`PhysicsWorld`), paso fijo 1/240 s | Sí, para billar / air hockey / futbolín |
| UI | React 19 solo para paneles DOM; Zustand como puente | Sí: mismo estilo (cristal, lima, dorado) |
| Audio | Web Audio sintetizado (`audio`) | Sí: ambiente y efectos de interfaz |
| Texturas | Procedurales en canvas | Sí: todo el local se texturiza igual |
| Progresión | `stats`, `coins`, `owned` en localStorage (`storage`) | Base del perfil del jugador |

El simulador de bolos es autocontenido: `Game` crea su renderer, su escena, su input y su bucle.

## 2. Decisiones

1. **Three.js imperativo, no React Three Fiber.** El bowling ya está escrito así; mezclar los dos
   duplicaría el bucle y la gestión de escena. React sigue siendo solo la capa de menús.
2. **Personaje 3D en tercera persona** (preferencia del usuario). Es la opción que mejor transmite
   "entrar en un local". El personaje es procedural (piezas con articulaciones y animación por
   código: quieto, caminar, correr, interactuar), coherente con la regla del proyecto de no usar
   recursos externos. Se puede sustituir por un modelo GLB con licencia CC0 (p. ej. Kenney / Quaternius)
   sin tocar el resto: solo cambia `Avatar`.
3. **Colisiones del personaje sin Rapier.** El local es plano: círculo (personaje) contra cajas
   alineadas (paredes y muebles) en 2D. Es exacto para este caso, barato y testeable
   (`world/collide.ts`). Rapier se reserva para los minijuegos, donde sí hace falta.
4. **Cada actividad es un módulo con su propio renderer y bucle**, montado en su capa (`#stage` para
   bolos, `#world-stage` para el local). Solo la capa activa renderiza; las demás quedan congeladas
   con su estado intacto. Así el bowling se integra **sin reescribirlo** y al volver al local el
   personaje sigue donde estaba.
5. **Registro de actividades** (`world/activities.ts`): id, nombre, posición en el local, radio de
   interacción y si está disponible. El local coloca marcadores y detecta proximidad a partir de
   esta lista; añadir un juego = una entrada + su módulo.
6. **Estado global mínimo**: `useWorldStore` (lugar activo, pantalla del local, actividad cercana,
   personaje) separado de `useGameStore` (bolos). Persistencia con el `storage` existente.

## 3. Estructura

```
src/
  world/            el local: World (bucle, cámara, input), Hall (edificio y zonas),
                    props (mobiliario y máquinas), Avatar, collide, activities, worldStore
  game/ scene/ physics/ scoring/ config/   bowling (sin cambios de estructura)
  audio/ utils/ store/                      sistemas compartidos
  ui/               menús de bowling
  ui/world/         menús del local: título, HUD, pausa, joystick táctil
```

Los próximos minijuegos irán en `src/games/<id>/` con la misma forma que el bowling:
una clase con `mount(host)`, bucle propio activo solo cuando su lugar está activo, y un
botón "Volver al local" que llama a `useWorldStore.getState().leave()`.

## 4. Plan por etapas

| Etapa | Contenido | Estado |
|---|---|---|
| 1 | Local con 7 zonas, personaje, movimiento, cámara orbital con colisión, colisiones | Hecho |
| 2 | Proximidad, indicador, "Pulsa E", fundido de entrada/salida, bowling integrado | Hecho |
| 3 | Billar → Air hockey → Futbolín → Dardos (máquinas ya colocadas, "Próximamente") | Pendiente |
| 4 | Pasos y sonidos por zona, más animación, estadísticas por juego, logros | Parcial (ambiente) |
| 5 | Testing en navegador y móvil | Parcial |

## 5. Atajos conocidos

- Las máquinas son geometría procedural detallada, no modelos descargados.
- Sin sombras dinámicas en el local (sombra de contacto bajo el personaje): rendimiento estable.
- La cámara evita las paredes con un raycast contra las paredes y muebles altos; no contra objetos bajos.
