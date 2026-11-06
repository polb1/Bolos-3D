# Air Hockey 3D — diseño

## 1. Cómo es una mesa real
- **Medidas:** la mesa de torneo de 7 pies (Dynamo, Gold Standard) tiene unos 2,13 × 1,07 m por fuera. La superficie de juego mide unos 2,0 × 1,0 m y está a unos 80 cm del suelo. Usamos 2,0 × 1,0 m.
- **Disco:** policarbonato de 3,25″ (82,5 mm) de diámetro, unos 6 mm de grosor y 15–25 g. En el juego, radio de 0,041 m.
- **Mazo:** de 3,75 a 4″ (95–101 mm), con pomo. En el juego, radio de 0,048 m.
- **Porterías:** ranuras en los dos extremos, de unos 25 cm. En el juego, 0,26 m. El disco cuenta como gol cuando entra entero en la ranura.
- **Materiales:**
  - Superficie de laminado brillante (formica) con miles de agujeros de 1 mm.
  - Bordes de aluminio o plástico con cara de goma.
  - Mueble de MDF y patas metálicas.
- **Sistema de aire:** un ventilador empuja aire bajo la superficie y crea un colchón de unas décimas de milímetro. El disco casi no roza: pierde poca velocidad y la mayor parte la pierde en los rebotes.
- **Comportamiento:**
  - **Disco:** rebota contra los bordes con un coeficiente de restitución de 0,8–0,9 y apenas pierde velocidad tangencial.
  - **Mazos:** el jugador los mueve con la mano. A efectos físicos tienen masa casi infinita frente al disco, así que el disco sale con la velocidad relativa reflejada.
  - **Velocidades:** un buen tiro ronda los 8–12 m/s y los profesionales pasan de 20.
- **Reglas habituales:** USAA y las reglas de salón.
  - **Partida:** gana el primero en llegar a 7 goles.
  - **Saque:** tras un gol, el disco va a quien lo ha recibido.
  - **Mitades:** no se puede cruzar la línea central con el mazo.
  - **No regulado:** no se toca el disco con la mano, y en torneo hay que sacarlo de tu mitad en 7 s.
- **Estética de referencia:** máquinas modernas de recreativo.
  - Mueble oscuro con LEDs laterales y marcador elevado en un extremo.
  - Superficie blanca con línea central roja, círculo central, áreas semicirculares ante cada portería y líneas azules.

## 2. Decisiones
| Tema | Decisión |
|---|---|
| Motor de física | **Propio en 2D**, en `physics.ts`. El juego ocurre en un plano y solo hay círculos y bordes rectos. Rapier no aporta nada y así se controla el CCD con subpasos de 1/600 s: a 14 m/s el disco avanza 2,3 cm, menos que su radio, y nunca atraviesa un borde. Funciona sin gráficos y tiene tests. |
| Colchón de aire | Arrastre exponencial de 0,06/s: el disco pierde menos de un 7 % por segundo. |
| Bordes | Restitución normal de 0,86 y conservación tangencial de 0,97. El ángulo de salida depende del de entrada, sin aleatoriedad. Los postes de las porterías son puntos redondos. |
| Mazo | Persigue el objetivo de la mano con un tope de velocidad y aceleración (movimiento "arrive"). Va limitado a su mitad y dentro de los bordes. Si el disco queda pillado contra un borde, el mazo cede y no lo atraviesa. |
| Choque mazo-disco | Impulso con la velocidad relativa y restitución de 0,78, contra un mazo de masa infinita. |
| Límite de velocidad | Configurable: lento 8, normal 11 y rápido 14 m/s. |
| Render | Three.js imperativo, igual que la bolera: `AirHockey.ts` copia el estado de la física en las mallas en cada fotograma. |

## 3. IA (`ai.ts`)
- **Percepción:** solo ve el disco con su tiempo de reacción de retraso y vuelve a decidir cada cierto intervalo.
- **Predicción:** prolonga la recta del disco y "pliega" los rebotes en los bordes. Solo sigue los rebotes que permite su nivel. Si hacen falta más, no sabe dónde llegará y se queda cubriendo el centro.
- **Estados:**
  - **Defensa:** va al punto de corte con su línea defensiva.
  - **Ataque:** con el disco lento en su mitad, se coloca detrás, alineado con la portería rival o con su imagen reflejada en un borde (tiro de banda), y golpea a través del disco. Si está delante, lo rodea para no meterse gol.
  - **Espera:** vuelve a casa siguiendo un poco la x del disco.

| Nivel | Reacción | Velocidad | Error | Rebotes que prevé | Ataca bajo | Banda | Profundidad |
|---|---|---|---|---|---|---|---|
| Fácil | 0,34 s | 2,2 m/s | 10 cm | 0 | 0,7 m/s | 0 % | 42 cm (deja hueco) |
| Normal | 0,20 s | 3,8 m/s | 5 cm | 1 | 1,6 m/s | 20 % | 26 cm |
| Difícil | 0,08 s | 6,5 m/s | 1,5 cm | 3 | 2,6 m/s | 40 % | 19 cm |

Ante tiros limpios a puerta de 4–9 m/s, la IA para un 70 % (fácil), un 85 % (normal) y un 100 % (difícil). Contra una portería vacía, la normal marca casi siempre en menos de 8 s.

## 4. Juego
- **Modos:**
  - **Contra la IA**
  - **Dos jugadores:** cámara cenital. J1 juega con WASD a la izquierda y J2 con las flechas a la derecha. En pantalla táctil, cada dedo se queda con la mitad donde empezó.
  - **Entrenamiento:** sin rival. Si el disco se queda parado en la mitad vacía, vuelve a ti.
- **Partida:** a 7 goles por defecto (configurable a 3, 5, 7 o 10). El primer saque se sortea y después saca quien recibe el gol. El reloj de partida se para al final.
- **Ajustes:** goles, dificultad, velocidad del disco y sensibilidad. La sensibilidad escala la velocidad y la aceleración del mazo y la velocidad con teclado. Se guardan en `localStorage`.
- **Sonido:** sintetizado en `AudioEngine`. Hay clac de mazo, clac de borde, caída en la ranura con aviso de gol, bocina de inicio, fanfarria o caída al final y zumbido del soplador.
- **Efectos:** un anillo en cada golpe, el parpadeo de los LEDs con el color de quien marca y el marcador elevado.

## 5. Archivos
```
src/games/airhockey/
  physics.ts   física pura (disco, mazos, bordes, postes, goles)
  ai.ts        rival por niveles; predictX con rebotes
  rules.ts     marcador, final y saque
  store.ts     estado para la interfaz y ajustes guardados
  table.ts     mesa 3D, marcador en canvas, mazos y disco
  AirHockey.ts escena, cámara, entrada (ratón, táctil, teclado), flujo de partida y audio
  airhockey.test.ts
src/ui/airhockey/AirHockeyUI.tsx  menú, ajustes, controles, HUD, pausa y final
```
Se entra desde las dos mesas de air hockey del local en pixel art, con `place: 'airhockey'`.

## 6. Pendiente
- Probar el tacto en un móvil real con dos dedos y en una GPU real.
- No implementado: la falta de los 7 s de posesión ni el "topping" (levantar el mazo sobre el disco).
