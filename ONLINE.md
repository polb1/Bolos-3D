# Multijugador online — base

Objetivo: que todos los que abran el juego con la misma sala entren en el mismo local y se vean a la vez. Más adelante podrán jugar juntos a los minijuegos.

## Cómo probarlo
1. `npm run server`: arranca la sala en `ws://localhost:8787`. Usa la variable `PORT` para cambiar el puerto.
2. `npm run dev` y abre el juego en dos pestañas o en dos equipos de la misma red: `http://<ip-del-pc>:5173/?sala=amigos`.
3. Escribe tu nombre en la portada y entra al local: verás a los demás con su ropa y su nombre.

- **Sala:** sin `?sala=`, todos van a la sala `local`.
- **Servidor en internet:** compila con `VITE_SERVER_URL=wss://tu-servidor` y despliega `server/server.ts` en cualquier hosting con Node 22.6 o superior (Render, Fly, Railway…).
- **Sin servidor:** el juego funciona igual. El chip pone «Sin conexión · modo local» y se reintenta solo en segundo plano.

## Piezas
| Archivo | Qué hace |
|---|---|
| `src/net/protocol.ts` | Mensajes (`hello`, `pos`, `game` / `welcome`, `join`, `pos`, `leave`, `game`, `full`) y su validación. Todo lo que llega de la red pasa por `parseClient` o `parseServer`. |
| `server/server.ts` | Servidor `ws` sin lógica de juego: reparte por salas, valida, limita a 32 jugadores por sala, 2 KB por mensaje y 40 mensajes por segundo, y avisa de quién entra y quién sale. Node lo ejecuta directamente, sin compilar. |
| `src/net/client.ts` | `net`: conexión con reconexión exponencial y posición propia a 10 Hz (solo si cambia). Los demás jugadores se mueven suavizados. `useNetStore` lleva el estado para la interfaz. |
| `src/world/World.ts` | Envía tu posición y el sitio donde estás (local, bolos o air hockey) y dibuja a los demás. Si alguien está en un minijuego, se ve semitransparente y su etiqueta indica a qué juega. |

## Siguiente paso: minijuegos online
- `net.sendGame(data)` y `net.onGame = (id, data) => …` ya reenvían mensajes libres a toda la sala.
- Para el air hockey 1 contra 1, lo sencillo es que el anfitrión ejecute `HockeyPhysics` y emita el estado 20–30 veces por segundo, y que el invitado solo envíe la posición de su mazo. Así la física sigue estando en un único sitio.
- Falta: retos e invitaciones entre jugadores (un mensaje `game` con `{ type: 'invite' }`), un chat y nombres únicos.
