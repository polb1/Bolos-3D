import * as THREE from 'three';

/** Procedural rules poster for the darts room. */

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Rules poster for the wall: drawn big enough to read when the camera zooms onto it. */
export function rulesPoster() {
  const [c, g] = canvas(1000, 1400);
  g.fillStyle = '#f3ead2';
  g.fillRect(0, 0, 1000, 1400);
  g.strokeStyle = '#1b2a5c';
  g.lineWidth = 14;
  g.strokeRect(24, 24, 952, 1352);
  g.fillStyle = '#b5172b';
  g.fillRect(24, 24, 952, 150);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.font = 'bold 76px Georgia, serif';
  g.fillText('REGLAS · DARDOS', 500, 128);
  const sections: [string, string[]][] = [
    ['Cómo se lanza', ['Pulsa sobre el punto de la diana al que apuntas.', 'Sin soltar, echa la mano atrás (abajo) y lánzala hacia arriba soltando al final.', 'Gesto rápido: el dardo sube. Lento: cae. Torcido: se desvía.']],
    ['Puntuación', ['Cada sector vale su número (1 a 20).', 'Anillo exterior estrecho: DOBLE (x2).', 'Anillo interior estrecho: TRIPLE (x3).', 'Anillo verde del centro: 25 · Punto rojo: 50.', 'Fuera del aro de dobles: 0.']],
    ['Partida 501', ['Empiezas con 501 y restas cada tirada de 3 dardos.', 'Para cerrar hay que acabar en un DOBLE o en el 50.', 'Si te pasas, te quedas en 1 o no cierras en doble: la tirada no cuenta (bust).']],
    ['Partida (IA u online)', ['Al mejor de 5 legs de 501: gana quien cierre 3.', 'Cada leg lo abre el otro jugador.']],
    ['Práctica libre', ['Sin límite: suma todo lo que marques.']],
  ];
  let y = 250;
  g.textAlign = 'left';
  const wrap = (text: string, x: number, max: number, lh: number) => {
    let line = '';
    for (const w of text.split(' ')) {
      if (g.measureText(line + w).width > max && line) {
        g.fillText(line, x, y);
        y += lh;
        line = '';
      }
      line += w + ' ';
    }
    g.fillText(line, x, y);
    y += lh;
  };
  for (const [title, lines] of sections) {
    g.fillStyle = '#1b2a5c';
    g.font = 'bold 50px Georgia, serif';
    g.fillText(title.toUpperCase(), 70, y);
    y += 62;
    g.fillStyle = '#2a2018';
    g.font = '36px Georgia, serif';
    for (const l of lines) {
      g.fillText('•', 76, y);
      wrap(l, 110, 820, 42);
    }
    y += 14;
  }
  return tex(c);
}

