import { useEffect, useRef, useState } from 'react';
import { audio } from '../../../audio/AudioEngine';
import { click, useEsc } from '../../../ui/common';
import { MuteButton } from '../../../ui/MuteButton';
import { storage } from '../../../utils/storage';
import { worldRef } from '../../../world/instance';
import { BricksGame } from '../bricks';
import { MazeGame } from '../maze';
import { PlanesGame } from '../planes';
import { PlanetGame } from '../planet';
import { SnakeGame } from '../snake';
import type { ArcadeGame, ArcadeInput, Dir } from '../types';
import './arcade.css';

/** Each machine: its marquee colour and how its stick and buttons are used. */
const GAMES = [
  { id: 'planes', name: 'Escuadrilla', hue: '#c4553a', desc: 'Pilota tu biplano sobre el mar y derriba la escuadrilla enemiga.', how: 'Mueve el avión · dispara solo · ★ = doble disparo', make: () => new PlanesGame() },
  { id: 'planet', name: 'Planeta en peligro', hue: '#7a5ab8', desc: 'Defiende tu planeta de la lluvia de rocas espaciales.', how: '← → gira el cañón (o apunta con el dedo) · dispara solo', make: () => new PlanetGame() },
  { id: 'maze', name: 'Ratón glotón', hue: '#e0a03a', desc: 'Cómete todas las migas sin que te pillen los gatos.', how: 'Flechas o desliza · el queso asusta a los gatos', make: () => new MazeGame() },
  { id: 'bricks', name: 'Ladrillos', hue: '#3f8a9a', desc: 'Rebota la bola y rompe todos los ladrillos.', how: '← → o arrastra la pala · Espacio saca', make: () => new BricksGame() },
  { id: 'snake', name: 'Serpiente', hue: '#5f9a4a', desc: 'Come manzanas y crece sin chocar.', how: 'Flechas o desliza el dedo', make: () => new SnakeGame() },
] as const;
type GameId = (typeof GAMES)[number]['id'];
const info = (id: GameId) => GAMES.find((g) => g.id === id)!;

const KEYS: Record<string, Dir> = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
const best = () => storage.getRaw<Record<string, number>>('arcade.best', {});
const COIN = [988, 1319];

/** The field rectangle inside a w×h screen (the games draw centred and as large as fits). */
const field = (w: number, h: number, aspect: number) => {
  const fw = Math.min(w, h * aspect);
  const fh = fw / aspect;
  return { x: (w - fw) / 2, y: (h - fh) / 2, w: fw, h: fh };
};

/** Still frame of a game for the machine's attract screen in the menu. */
function Preview({ id }: { id: GameId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = info(id).make();
    // A couple of seconds of play so the screen shows something going on.
    const idle: ArcadeInput = { dir: null, steer: 0, lift: 0, pointer: null, pointerY: null, fire: false };
    for (let i = 0; i < 150; i++) g.step(1 / 60, { ...idle, fire: i === 1, dir: i === 1 ? 3 : null });
    c.width = c.clientWidth * 2;
    c.height = c.clientHeight * 2;
    const ctx = c.getContext('2d')!;
    ctx.scale(2, 2);
    g.draw(ctx, c.clientWidth, c.clientHeight, 0.3);
  }, [id]);
  return <canvas ref={ref} className="arcade-preview" aria-hidden />;
}

function Menu({ play }: { play: (id: GameId) => void }) {
  useEsc(() => worldRef.current?.leave());
  const rec = best();
  return (
    <div className="arcade-room">
      <div className="menu-topbar arcade-top">
        <button className="btn ghost" onClick={click(() => worldRef.current?.leave())}>
          ← Volver al local
        </button>
        <MuteButton />
      </div>
      <h1 className="arcade-hall-title">RECREATIVAS</h1>
      <p className="arcade-hall-sub">Elige una máquina y echa una ficha</p>
      <div className="arcade-row">
        {GAMES.map((g, i) => (
          <button key={g.id} className="arcade-mini" style={{ '--hue': g.hue } as React.CSSProperties} onClick={click(() => play(g.id))} autoFocus={i === 0}>
            <span className="am-marquee">{g.name}</span>
            <span className="am-screen">
              <Preview id={g.id} />
              <span className="am-glass" />
            </span>
            <span className="am-panel">
              <span className="am-stick" />
              <span className="am-btn" />
              <span className="am-btn b2" />
            </span>
            <span className="am-desc">{g.desc}</span>
            <span className="am-rec">{rec[g.id] ? `Récord ${rec[g.id]}` : 'Sin récord'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Cabinet({ id, back }: { id: GameId; back: () => void }) {
  const g = info(id);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stick = useRef<HTMLDivElement>(null);
  const fireBtn = useRef<HTMLButtonElement>(null);
  const [game, setGame] = useState<ArcadeGame>(() => g.make());
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState({ score: 0, lives: 0, status: '', over: false, record: best()[id] ?? 0 });
  useEsc(back);

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    const input: ArcadeInput = { dir: null, steer: 0, lift: 0, pointer: null, pointerY: null, fire: false };
    const held = new Set<string>();
    let saved = false;
    let running = false;
    let lives = game.lives;
    // First input on the attract screen is the coin; it doesn't also move or shoot.
    const begin = () => {
      if (running) return false;
      running = true;
      setStarted(true);
      audio.unlock();
      audio.chip(COIN);
      return true;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (KEYS[e.code] !== undefined || e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      if ((KEYS[e.code] !== undefined || e.code === 'Space') && begin()) return;
      held.add(e.code);
      if (KEYS[e.code] !== undefined) input.dir = KEYS[e.code];
      if (e.code === 'Space') input.fire = true;
    };
    const onUp = (e: KeyboardEvent) => held.delete(e.code);
    // Swipe = direction, drag = position, tap = fire.
    let down: { x: number; y: number; moved: boolean } | null = null;
    const pd = (e: PointerEvent) => {
      if (begin()) return;
      down = { x: e.clientX, y: e.clientY, moved: false };
      c.setPointerCapture(e.pointerId);
      pm(e);
    };
    const pm = (e: PointerEvent) => {
      if (!down) return;
      const r = c.getBoundingClientRect();
      const f = field(r.width, r.height, game.aspect);
      input.pointer = (e.clientX - r.left - f.x) / f.w;
      input.pointerY = (e.clientY - r.top - f.y) / f.h;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (Math.hypot(dx, dy) > 24) {
        input.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
        down = { x: e.clientX, y: e.clientY, moved: true };
      }
    };
    const pu = () => {
      if (down && !down.moved) input.fire = true;
      down = null;
      input.pointer = input.pointerY = null;
    };
    const fb = fireBtn.current;
    const press = (e: Event) => {
      e.preventDefault();
      if (!begin()) input.fire = true;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    c.addEventListener('pointerdown', pd);
    c.addEventListener('pointermove', pm);
    c.addEventListener('pointerup', pu);
    c.addEventListener('pointercancel', pu);
    fb?.addEventListener('pointerdown', press);

    let flash = 0;
    const tick = (dt: number, now: number) => {
      input.steer = (held.has('ArrowRight') || held.has('KeyD') ? 1 : 0) - (held.has('ArrowLeft') || held.has('KeyA') ? 1 : 0);
      input.lift = (held.has('ArrowDown') || held.has('KeyS') ? 1 : 0) - (held.has('ArrowUp') || held.has('KeyW') ? 1 : 0);
      // The stick on the panel leans with the input and the button lights when firing.
      const dir = input.dir;
      const lx = input.steer || (dir === 1 ? 1 : dir === 3 ? -1 : 0);
      const ly = input.lift || (dir === 2 ? 1 : dir === 0 ? -1 : 0);
      if (lx || ly) flash = 0.15;
      if (stick.current && (flash > 0 || !(lx || ly))) stick.current.style.transform = `rotateX(${-ly * 22}deg) rotateY(${lx * 22}deg)`;
      flash -= dt;
      fireBtn.current?.classList.toggle('lit', input.fire || held.has('Space'));
      if (running) game.step(dt, input);
      input.dir = null;
      input.fire = false;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      game.draw(ctx, w, h, now / 1000);
      if (game.lives < lives && !game.over) audio.chip([392, 330, 262], 0.09);
      lives = game.lives;
      let record = best()[id] ?? 0;
      if (game.over && !saved) {
        saved = true;
        audio.chip([523, 392, 330, 262, 196], 0.12);
        if (game.score > record) storage.set('arcade.best', { ...best(), [id]: (record = game.score) });
      }
      setHud((o) =>
        o.score === game.score && o.lives === game.lives && o.status === game.status && o.over === game.over && o.record === record
          ? o
          : { score: game.score, lives: game.lives, status: game.status, over: game.over, record },
      );
    };
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      tick(Math.min((now - last) / 1000, 0.05), now);
      last = now;
    };
    raf = requestAnimationFrame(loop);
    if (import.meta.env.DEV) Object.assign(window, { __arcade: { game, input, begin, frame: (dt: number) => tick(dt, performance.now()) } }); // for browser testing
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
      fb?.removeEventListener('pointerdown', press);
    };
  }, [game, id]);

  const again = () => {
    setStarted(false);
    setGame(g.make());
  };
  const pad = (n: number) => String(n).padStart(6, '0');
  return (
    <div className="arcade-room playing">
      <div className="hud-corner right">
        <MuteButton />
        <button className="icon-btn" aria-label="Salir de la máquina" title="Salir (ESC)" onClick={click(back)}>✕</button>
      </div>
      <div className="arcade-cab" style={{ '--hue': g.hue } as React.CSSProperties}>
        <div className="cab-marquee">
          <span>{g.name}</span>
        </div>
        <div className="cab-bezel">
          <div className="cab-screen">
            <canvas ref={canvas} className="arcade-screen" aria-label={g.name} />
            <div className="crt-hud">
              <span>1UP <b>{pad(hud.score)}</b></span>
              <span>RÉCORD <b>{pad(Math.max(hud.record, hud.score))}</b></span>
              {id !== 'snake' && <span className="crt-lives">{'♥'.repeat(Math.max(hud.lives, 0))}</span>}
            </div>
            {started && !hud.over && <div className="crt-status">{hud.status}</div>}
            {!started && (
              <div className="crt-overlay">
                <b className="crt-title">{g.name.toUpperCase()}</b>
                <span>{g.how}</span>
                <span className="crt-blink">INSERTA FICHA</span>
                <small>Pulsa Espacio, una flecha o toca la pantalla</small>
              </div>
            )}
            {hud.over && (
              <div className="crt-overlay">
                <b className="crt-title">FIN DE LA PARTIDA</b>
                <span>{hud.score} PUNTOS{hud.score >= hud.record && hud.score > 0 ? ' · ¡NUEVO RÉCORD!' : ''}</span>
                <div className="crt-actions">
                  <button className="btn primary" onClick={click(again)} autoFocus>
                    Otra ficha
                  </button>
                  <button className="btn ghost" onClick={click(back)}>
                    Otra máquina
                  </button>
                </div>
              </div>
            )}
            <div className="crt-glass" />
          </div>
        </div>
        <div className="cab-panel">
          <div className="cab-stick-base">
            <div className="cab-stick" ref={stick} />
          </div>
          <div className="cab-coin">
            <i />
            <small>1 FICHA</small>
          </div>
          <div className="cab-buttons">
            <button className="cab-btn" ref={fireBtn} aria-label="Disparo" />
            <span className="cab-btn b2" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ArcadeUI() {
  const [playing, setPlaying] = useState<GameId | null>(null);
  return playing ? <Cabinet key={playing} id={playing} back={() => setPlaying(null)} /> : <Menu play={setPlaying} />;
}
