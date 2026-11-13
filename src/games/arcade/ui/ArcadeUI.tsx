import { useEffect, useRef, useState } from 'react';
import { click, useEsc } from '../../../ui/common';
import { MuteButton } from '../../../ui/MuteButton';
import { storage } from '../../../utils/storage';
import { worldRef } from '../../../world/instance';
import { BricksGame } from '../bricks';
import { MazeGame } from '../maze';
import { SnakeGame } from '../snake';
import type { ArcadeGame, ArcadeInput, Dir } from '../types';

const GAMES = [
  { id: 'maze', name: 'Ratón glotón', desc: 'Cómete todas las migas sin que te pillen los gatos. El queso los asusta.', make: () => new MazeGame() },
  { id: 'bricks', name: 'Ladrillos', desc: 'Rebota la bola con la pala y rompe todos los ladrillos.', make: () => new BricksGame() },
  { id: 'snake', name: 'Serpiente', desc: 'Come manzanas y crece sin chocar contigo ni con las paredes.', make: () => new SnakeGame() },
] as const;
type GameId = (typeof GAMES)[number]['id'];

const KEYS: Record<string, Dir> = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
const best = () => storage.getRaw<Record<string, number>>('arcade.best', {});

function Menu({ play }: { play: (id: GameId) => void }) {
  useEsc(() => worldRef.current?.leave());
  const rec = best();
  return (
    <div className="screen">
      <div className="menu-hero">
        <div className="menu-topbar">
          <span />
          <MuteButton />
        </div>
        <h1 className="game-title big">
          RECRE<span>ATIVAS</span>
        </h1>
        <p className="menu-tagline">Elige máquina · flechas o desliza el dedo</p>
        <div className="menu-buttons">
          {GAMES.map((g, i) => (
            <button key={g.id} className={'btn arcade-pick ' + (i === 0 ? 'primary' : 'menu')} onClick={click(() => play(g.id))} autoFocus={i === 0}>
              <b>{g.name}</b>
              <small>{g.desc}</small>
              {rec[g.id] ? <small>Récord: {rec[g.id]}</small> : null}
            </button>
          ))}
          <button className="btn ghost" onClick={click(() => worldRef.current?.leave())}>
            ← Volver al local (ESC)
          </button>
        </div>
      </div>
    </div>
  );
}

function Cabinet({ id, back }: { id: GameId; back: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<ArcadeGame>(() => GAMES.find((g) => g.id === id)!.make());
  const [hud, setHud] = useState({ score: 0, lives: 0, status: '', over: false, record: 0 });
  useEsc(back);

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    const input: ArcadeInput = { dir: null, steer: 0, pointer: null, fire: false };
    const held = new Set<string>();
    let saved = false;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (KEYS[e.code] !== undefined || e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      held.add(e.code);
      if (KEYS[e.code] !== undefined) input.dir = KEYS[e.code];
      if (e.code === 'Space') input.fire = true;
    };
    const onUp = (e: KeyboardEvent) => held.delete(e.code);
    // Swipe = direction, drag = paddle position, tap = fire.
    let down: { x: number; y: number; moved: boolean } | null = null;
    const pd = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, moved: false };
      c.setPointerCapture(e.pointerId);
    };
    const pm = (e: PointerEvent) => {
      if (!down) return;
      const r = c.getBoundingClientRect();
      input.pointer = (e.clientX - r.left) / r.width;
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
      input.pointer = null;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    c.addEventListener('pointerdown', pd);
    c.addEventListener('pointermove', pm);
    c.addEventListener('pointerup', pu);
    c.addEventListener('pointercancel', pu);

    let raf = 0;
    let last = performance.now();
    const tick = (dt: number, now: number) => {
      input.steer = (held.has('ArrowRight') || held.has('KeyD') ? 1 : 0) - (held.has('ArrowLeft') || held.has('KeyA') ? 1 : 0);
      game.step(dt, input);
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
      let record = best()[id] ?? 0;
      if (game.over && !saved) {
        saved = true;
        if (game.score > record) storage.set('arcade.best', { ...best(), [id]: (record = game.score) });
      }
      setHud((o) =>
        o.score === game.score && o.lives === game.lives && o.status === game.status && o.over === game.over && o.record === record
          ? o
          : { score: game.score, lives: game.lives, status: game.status, over: game.over, record },
      );
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      tick(Math.min((now - last) / 1000, 0.05), now);
      last = now;
    };
    raf = requestAnimationFrame(loop);
    if (import.meta.env.DEV) Object.assign(window, { __arcade: { game, input, frame: (dt: number) => tick(dt, performance.now()) } }); // for browser testing
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
    };
  }, [game, id]);

  const name = GAMES.find((g) => g.id === id)!.name;
  return (
    <div className="arcade-cabinet">
      <div className="arcade-hud">
        <span className="arcade-name">{name}</span>
        <span>Puntos <b>{hud.score}</b></span>
        {id !== 'snake' && <span>Vidas <b>{'♥'.repeat(Math.max(hud.lives, 0))}</b></span>}
        <span className="arcade-status">{hud.status}</span>
      </div>
      <div className="hud-corner right">
        <button className="icon-btn" aria-label="Menú" title="Menú (ESC)" onClick={click(back)}>☰</button>
      </div>
      <canvas ref={canvas} className="arcade-screen" aria-label={name} />
      {hud.over && (
        <div className="screen">
          <div className="panel hockey-panel">
            <h2>Fin de la partida</h2>
            <p className="tagline">
              {hud.score} puntos{hud.score >= hud.record && hud.score > 0 ? ' · ¡nuevo récord!' : ` · récord ${hud.record}`}
            </p>
            <button className="btn primary" onClick={click(() => setGame(GAMES.find((g) => g.id === id)!.make()))} autoFocus>
              Otra vez
            </button>
            <button className="btn ghost" onClick={click(back)}>
              Elegir otra máquina
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ArcadeUI() {
  const [playing, setPlaying] = useState<GameId | null>(null);
  return playing ? <Cabinet key={playing} id={playing} back={() => setPlaying(null)} /> : <Menu play={setPlaying} />;
}
