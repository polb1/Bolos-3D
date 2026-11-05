# Virtual Arcade — arquitectura

Evolución de *Bolera 3D* a un centro recreativo por el que se camina con un personaje.
**Cambio de dirección:** el local pasa a ser 2D en pixel art, visto desde arriba y dividido en salas; los juegos siguen en 3D.
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
2. **Local 2D pixel art por salas** (decisión del usuario tras ver la versión 3D). Canvas 2D dibujado
   a 1 píxel = 1 unidad y escalado con zoom entero (`imageSmoothing` desactivado). Casillas de 16 px,
   7 salas unidas por puertas; la sala donde estás se ilumina y las demás quedan en penumbra.
   Personaje de 16×24 con 4 direcciones y ciclo de paso. Todo se dibuja por código (sin recursos externos).
   La primera versión 3D en tercera persona está en el historial de la rama `virtual-arcade`.
3. **Colisiones del personaje sin Rapier.** Círculo (pies del personaje) contra cajas alineadas
   (paredes y muebles) en casillas. Es exacto para este caso, barato y testeable
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
  world/            el local: World (bucle, render 2D, input), map (salas y muebles),
                    sprites (pixel art procedural), collide, activities, worldStore
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
| 1 | Local pixel art con 7 salas, personaje, movimiento, cámara, colisiones | Hecho (rehecho en 2D) |
| 2 | Proximidad, indicador, "Pulsa E", fundido de entrada/salida, bowling integrado | Hecho |
| 3 | Billar → Air hockey → Futbolín → Dardos (máquinas ya colocadas, "Próximamente") | Pendiente |
| 4 | Pasos y sonidos por zona, más animación, estadísticas por juego, logros | Parcial (ambiente) |
| 5 | Testing en navegador y móvil | Parcial |

## 5. Atajos conocidos

- Los textos de los carteles usan `fillText` monoespaciado escalado, no una fuente bitmap propia.
- Sin sonido de pasos todavía.
