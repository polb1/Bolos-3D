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

## Publicarlo en internet (p. ej. virtualarcade.polb.dev)
En producción `server/server.ts` sirve **el juego (dist/) y la sala en el mismo puerto y dominio**, así que basta un único servicio Node:

1. Sube el repo a un hosting con Node y WebSockets (Render «Web Service», Railway o Fly.io; no vale un hosting solo estático como Vercel/Netlify para la sala).
   - Build: `npm install && npm run build` (`npm install` debe incluir las dev-dependencies para compilar)
   - Start: `npm start` (usa la variable `PORT` que da el hosting; Node 23.6 o superior)
2. En el panel del hosting añade el dominio personalizado `virtualarcade.polb.dev`.
3. En el DNS de `polb.dev` crea un registro **CNAME** `virtualarcade` → el dominio que te dé el hosting (p. ej. `bolera.onrender.com`). El HTTPS lo pone el hosting; `.dev` lo exige y el cliente usa `wss://` solo.
4. Compartid `https://virtualarcade.polb.dev/?sala=amigos`.

Nota: en planes gratuitos el servicio se duerme tras un rato sin visitas y la primera carga tarda ~30-60 s.
