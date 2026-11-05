# Reverse engineering — Pádel 3D (https://padel-mto1.onrender.com/)

Fecha del análisis: 2026-11-05. Autor de la web original (meta `author`): David Duran.

## 0. Método y limitaciones

- Se cargó la página en el navegador integrado: el HTML, la red y la consola son accesibles, **pero ese navegador no dispone de WebGL** (`THREE.WebGLRenderer: Error creating WebGL context`), así que la escena 3D no llegó a renderizarse. Chrome (extensión) no respondió.
- Por tanto, **no se ha podido jugar visualmente**. Todo lo que sigue procede de:
  - HTML servido, hoja de estilos (`assets/index-BKxGCB7n.css`, 19 KB) y bundle JS (`assets/index-qs1ewuqP.js`, 1 MB, minificado).
  - Textos, clases CSS, ids, claves de `localStorage` y estructuras de datos extraídas del bundle.
- Lo marcado **(no verificado)** se infiere del código, no de la observación directa.
- No se ha copiado ningún recurso (modelos `.glb`, `sfx/*.mp3`) ni código de la web original.

## 1. Tecnología

| Aspecto | Hallazgo |
|---|---|
| Build | Vite (nombres `assets/index-<hash>.js/.css`, `type="module"`) |
| UI | React 19 (`version:"19.3.1"`, `createRoot`). React solo pinta el *shell* DOM con ids (`#scoreboard`, `#power-meter`, `#banner`, `#end-title`…); un controlador imperativo (`this.el(id).classList.toggle("hidden")`, `textContent = …`) actualiza la UI durante la partida. |
| 3D | Three.js en modo imperativo (no hay `useFrame` → **no** usa React Three Fiber). `ACESFilmic` tone mapping, `MeshPhysicalMaterial`, sombras (`shadowMap`). Modelos `.glb` (jugadores). |
| Física | **Propia** (constantes `GRAVITY`, `friction`, sin Rapier/Cannon/Ammo en el bundle). Física balística de pelota con rebotes en suelo/cristal. |
| Estado | Sin Zustand/Redux. Clases JS + `localStorage` con prefijo `game.` (`Mr.get/set` con JSON) y `game.muted`. Estadísticas: `wins, losses, pointsWon, torneos, mundiales`, monedas, objetos equipados. |
| Audio | Web Audio API: síntesis (`createOscillator`) + samples `sfx/golpe.mp3`, `bote.mp3`, `cristal.mp3`, `aplausos.mp3`, `grada.mp3`. Botón de silencio persistente. |
| Online | WebRTC (`RTCPeerConnection`) con señalización manual: el anfitrión genera un código de invitación, el invitado devuelve un código de respuesta (copiar/pegar). |
| Fuentes | Pila de sistema: `ui-sans-serif, system-ui, -apple-system, Segoe UI` (+ monoespaciada para códigos). Sin fuentes web. |
| PWA-ish | `theme-color #0a1020`, `apple-mobile-web-app-capable`, `viewport-fit=cover`, `user-scalable=no`. Favicon = cuadrado `#8df0c1` en SVG inline. |

## 2. Diseño visual

### Paleta
| Token | Valor | Uso |
|---|---|---|
| Fondo | `#0a1020` | body, theme-color |
| Texto | `#eaf2ff` | general |
| Acento lima | `#d8f24a` (hover `#e8ff70`, texto sobre él `#16200a`) | botón primario, opción seleccionada, pestaña activa, "span" del título |
| Azul suave | `#9fc3ee`, `#8fb3e2`, `#7ea4d4`, `#bcd8ff`, `#cfe4ff` | subtítulos, labels, notas |
| Oro | `#ffe27a`, `#ffd23f` | puntuación grande, juegos, super |
| Rojo vivo | `#ff3b3b` | punto "en directo" de la repetición |
| Bordes | `rgba(140,190,255,.2–.35)` | paneles, botones |
| Paneles | `#0a1224e0` + `backdrop-filter: blur(10px)`, radio 18–22 px, sombra `0 24px 80px #00000080` | |

### Componentes
- **Título**: `.game-title` 58 px peso 900, una palabra en lima (`PÁDEL <span>3D</span>`); versión `big` con `clamp(52px,9vw,84px)` y `text-shadow` lima.
- **Botones**: `.btn` (fondo azul translúcido, borde azul, radio 10, `translateY(-1px)` en hover), `.btn.primary` (lima), `.btn.ghost` (transparente), `.btn.xl`, `.btn.menu`, `.btn.small`.
- **Opciones**: `.opt` píldoras (radio 999); `.selected` → lima. Agrupadas en `.opt-group` con `label` en mayúsculas alineado a la derecha (92 px).
- **Pestañas**: `.setup-tab` con esquinas superiores redondeadas; activa en lima.
- **Chips**: `.summary-chip` (resumen de la configuración en el menú) y `.coins-chip` (monedas 🪙).
- **HUD**:
  - `#scoreboard` centrado arriba, cápsula oscura con blur, números tabulares: nombre / puntos / juegos en oro / separador central.
  - `#power-meter` abajo-centro, 300 px: etiqueta `POTENCIA`, pista con **zona dulce** (`.pm-sweet`, 70–95 %) y relleno degradado verde→lima→oro→naranja, más un consejo (`.pm-tip`).
  - `#super-meter` (barra dorada que pulsa cuando está llena).
  - `#banner` (texto grande central al 22 % de altura, p.ej. "¡Juego!", "Doble falta") con subtítulo.
  - `#cine`: barras de cine negras que entran desde arriba/abajo + etiqueta `● REPETICIÓN` y "Toca o pulsa ESPACIO para saltar".
- **Animaciones**: `super-pulse`, `cine-pulse`, `tip-fade`; transiciones cortas (.08–.45 s). Sin librerías de animación.

### Responsive
- `@media (hover:none) and (pointer:coarse), (max-width:900px)`: activa controles táctiles (`body.touch-active #touch-controls`), oculta `.desktop-help` y muestra `.mobile-help`.
- `@media (max-width:640px)` y `(max-height:540px)`: reduce tipografías, menú en fila con wrap, paneles con scroll.
- `@media (orientation:portrait) and (pointer:coarse)`: aviso/ajuste para girar el móvil **(no verificado el contenido exacto)**.
- Táctil: joystick izquierdo (`.joy-ring`) + grupo de botones circulares a la derecha (golpe principal lima 88 px y secundarios: globo, cortado, liftado, remate).

## 3. Funcionamiento (inferido de textos y lógica)

1. **Inicio**: fondo `#0a1020` mientras carga; la escena 3D de la pista sirve de fondo vivo detrás del menú **(no verificado visualmente)**.
2. **Menú principal** (`.menu-hero`): barra superior (monedas, silencio), título, tagline ("Cristal, pala y gradas llenas. Tu club, tus reglas."), botones grandes (Partido / Torneo / Mundial / Online / Personalizar / Tienda), chips de resumen de la configuración, estadísticas (`victorias · derrotas · 🏆 · 🌍`) y créditos.
3. **Modos**: Partido (6 juegos), Torneo (Semifinal, Final, 4 juegos, bonus 200), Mundial (Cuartos, Semifinal, Final, bonus 500), Online (WebRTC). Formatos: TÚ + CPU, J1 + J2, J1 + CPU…
4. **Personalizar partido**: panel con pestañas (Partido / Ambiente / …) y grupos de opciones: nivel (Principiante, Aficionado, Profesional; Fácil/Media/Difícil), pelota (Amarilla, Roja · Rebote alto, Negra Pro · Viva), pista (Azul · Estándar, Verde · Rápida…), público (Con/Sin), ayudas (sí/no), cámara, personaje, piel, camisetas. Nota: "Los cambios se ven en directo sobre la pista."
5. **Controles**: `WASD` mover · `ESPACIO` golpear (mantener = cargar potencia, soltar en la zona verde) · `W/S` potencia/dejada · `A/D` dirección · `Q/E` efecto · `C` cámara · `V` repetición · `M` silencio · `R` reiniciar · `ESC` pausa. Cámara libre: arrastrar y rueda.
6. **Durante el punto**: banners ("¡Saque perfecto!", "Doble falta", "Punto para tu equipo"…), marcador actualizado, supermedidor.
7. **Fin de acción**: banner + posibilidad de **repetición** cinematográfica del último punto.
8. **Pausa**: panel con Reanudar / Reiniciar partido / Salir al menú.
9. **Resultados** (`#end-title`, `.end-score`, `.end-coins`, `#end-stats`): "¡Victoria!"/"Derrota"/"¡CAMPEÓN…!", monedas ganadas, estadísticas; botones **Jugar otra vez** (primario) y **Menú principal** (ghost).
10. **Tienda**: tarjetas circulares (`.shop-swatch`) para palas, pelotas, gorras… compradas con monedas; estados Equipar/Equipado/no alcanza.
11. **Persistencia**: estadísticas, monedas, equipamiento y silencio en `localStorage`.

## 4. Traducción al simulador de bolos

| Pádel 3D | Bolera 3D |
|---|---|
| Título `PÁDEL 3D` (lima en "3D") | `BOLERA 3D` (lima en "3D") |
| Partido / Torneo / Mundial | Partida (10 frames) / Práctica (frame libre, sin acumular) — torneos descartados: no tienen equivalente directo en bolos individuales |
| Formatos J1+J2 | 1 o 2 jugadores locales por turnos (hot-seat) |
| Online WebRTC | **Descartado** en esta versión (prioridad: física y jugabilidad, según el briefing) |
| Marcador de juegos/puntos | Hoja de bolos oficial de 10 frames en la misma cápsula superior |
| Medidor de potencia con zona dulce | Medidor en la v1; **sustituido después** (a petición) por lanzar arrastrando la bola, sin barra ni línea guía |
| WASD mover / A-D dirección / Q-E efecto / ESPACIO | ←/→ o A/D posición, arrastrar o ↑/↓ para dirección (flecha 3D), Q/E efecto, ESPACIO mantener-soltar para lanzar. Táctil: arrastre + botón LANZAR lima |
| Banner "¡Juego!" | "¡STRIKE!", "¡SPARE!", "Falta", "Canal", "Split" |
| Repetición con barras de cine | Cámara que sigue a la bola hasta los bolos con barras de cine (`● EN PISTA`) |
| Personalizar partido (pestañas) | Configuración: Partida (jugadores, nombres, ayudas), Bola (peso/color), Pista (madera clara/oscura), Ambiente (público/sonido), Gráficos (calidad) |
| Tienda / monedas | Descartado (no aporta a la simulación; evitar botones decorativos) |
| Resultados | Puntuación final grande en oro, estadísticas (strikes, spares), "Jugar otra vez" / "Menú principal" |
| Estadísticas persistentes | Mejor puntuación, partidas, strikes en `localStorage` (`bowl.*`) |

## 5. Decisiones técnicas

- **Vite + TypeScript + React** para el shell UI (igual que la referencia), con **Zustand** como estado (más limpio que el controlador por ids).
- **Three.js imperativo** (igual que la referencia) encapsulado en una clase `Game`: control directo del bucle, sin coste de reconciliación.
- **Rapier (`@dimforge/rapier3d-compat`)**: a diferencia de la referencia (física propia de pelota), los bolos requieren colisiones de cuerpos rígidos entre múltiples objetos, caídas y vuelcos — Rapier (WASM) ofrece estabilidad y rendimiento muy superiores a Cannon-es con CCD para la bola rápida.
- **Audio sintetizado** con Web Audio (como la parte `createOscillator` de la referencia) — sin assets externos.
- **Vitest** para las reglas de puntuación.
