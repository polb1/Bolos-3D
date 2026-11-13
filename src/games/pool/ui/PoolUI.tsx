import { useRef } from 'react';
import { click, useEsc } from '../../../ui/common';
import { MuteButton } from '../../../ui/MuteButton';
import { useNetStore } from '../../../net/client';
import { worldRef } from '../../../world/instance';
import { poolRef } from '../instance';
import { groupOf } from '../physics';
import type { Group } from '../rules';
import { usePoolStore, type PoolOpponent } from '../store';

const LEVELS = ['Fácil', 'Media', 'Experta'];
const start = (o: PoolOpponent) => click(() => poolRef.current?.start(o));
const toMenu = () => (poolRef.current ? poolRef.current.quit() : usePoolStore.getState().set({ screen: 'menu' }));
const GROUP_NAME: Record<Group, string> = { solid: 'Lisas', stripe: 'Rayadas' };

function Menu() {
  const level = usePoolStore((s) => s.level);
  useEsc(() => worldRef.current?.leave());
  return (
    <div className="screen">
      <div className="menu-hero">
        <div className="menu-topbar">
          <span />
          <MuteButton />
        </div>
        <h1 className="game-title big">
          BIL<span>LAR</span>
        </h1>
        <p className="menu-tagline">Bola 8 · mesa de 8 pies · vista 3D o desde arriba</p>
        <div className="menu-buttons">
          <button className="btn primary xl" onClick={start('ai')} autoFocus>
            ▶ Contra la IA
          </button>
          <div className="opt-group" role="radiogroup" aria-label="Nivel de la IA">
            <div className="opt-row">
              {LEVELS.map((l, i) => (
                <button key={l} role="radio" aria-checked={i === level} className={'opt' + (i === level ? ' selected' : '')} onClick={click(() => usePoolStore.getState().set({ level: i }))}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <button className="btn menu" onClick={click(() => poolRef.current?.seek())}>
            Online 1 contra 1
          </button>
          <button className="btn menu" onClick={start('local')}>
            2 jugadores en este dispositivo
          </button>
          <button className="btn menu" onClick={start('solo')}>
            Práctica libre
          </button>
          <button className="btn menu" onClick={click(() => usePoolStore.getState().set({ screen: 'controls' }))}>
            Cómo se juega
          </button>
          <button className="btn ghost" onClick={click(() => worldRef.current?.leave())}>
            ← Volver al local (ESC)
          </button>
        </div>
      </div>
    </div>
  );
}

function Seek() {
  const status = useNetStore((s) => s.status);
  useEsc(toMenu);
  return (
    <div className="screen">
      <div className="panel hockey-panel">
        <h2>Buscando rival…</h2>
        <p className="tagline">
          {status === 'online'
            ? 'La partida empieza en cuanto otra persona de tu sala pulse «Online 1 contra 1» en el billar.'
            : 'Sin conexión con la sala online. Prueba contra la IA mientras tanto.'}
        </p>
        <button className="btn ghost" onClick={click(toMenu)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Controls() {
  return (
    <div className="screen">
      <div className="panel hockey-panel">
        <h2>Cómo se juega</h2>
        <ul className="hockey-help">
          <li><b>Apunta</b>: arrastra por la pantalla (o ← →, con Mayús para afinar). En la vista desde arriba, pulsa donde quieras tirar.</li>
          <li><b>Tira</b>: arrastra hacia abajo la barra de fuerza de la derecha y suéltala (o mantén Espacio y suelta). Cuanto más atrás, más fuerte.</li>
          <li><b>Cámara</b>: botón 🎥 o tecla C para cambiar entre 3D y vista desde arriba.</li>
          <li><b>Bola en mano</b>: tras una falta del rival (y en el saque) arrastra la bola blanca para colocarla.</li>
          <li><b>Bola 8</b>: tras el saque, la primera bola que metas decide tu grupo (lisas 1-7 o rayadas 9-15). Mete las tuyas y luego la 8 para ganar.</li>
          <li><b>Faltas</b>: meter la blanca, no tocar ninguna bola, tocar primero una que no es tuya o que ninguna bola toque banda. El rival tiene bola en mano.</li>
          <li><b>Pierdes</b> si metes la 8 antes de tiempo o cometes falta al meterla.</li>
        </ul>
        <button className="btn primary" onClick={click(toMenu)}>
          Volver
        </button>
      </div>
    </div>
  );
}

/** Vertical strip: drag down to pull the cue back, let go to strike. */
function PowerStrip() {
  const power = usePoolStore((s) => s.power);
  const drag = useRef<{ id: number; y: number } | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    const h = el.current?.clientHeight || 300;
    poolRef.current?.setPull((e.clientY - drag.current.y) / (h * 0.9));
  };
  const up = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    poolRef.current?.strike();
  };
  return (
    <div
      ref={el}
      className="pool-power"
      role="slider"
      aria-label="Fuerza del tiro: arrastra hacia abajo y suelta"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(power * 100)}
      onPointerDown={(e) => {
        drag.current = { id: e.pointerId, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        drag.current = null;
        poolRef.current?.setPull(0);
      }}
    >
      <div className="pool-power-fill" style={{ height: `${power * 100}%` }} />
      <span>FUERZA</span>
    </div>
  );
}

/** A player's balls still on the table (their group), or "mesa abierta". */
function Rack({ group }: { group: Group | null }) {
  const balls = usePoolStore((s) => s.game?.balls);
  if (!group || !balls) return <span className="pool-rack open">mesa abierta</span>;
  const ids = balls.map((_, i) => i).filter((i) => groupOf(i) === group);
  return (
    <span className="pool-rack" title={GROUP_NAME[group]}>
      {ids.map((i) => (
        <i key={i} className={'pb b' + (i > 8 ? i - 8 : i) + (i > 8 ? ' stripe' : '') + (balls[i].in ? ' in' : '')}>{i}</i>
      ))}
    </span>
  );
}

function Hud() {
  const { game, names, opponent, me, banner, rolling, cam } = usePoolStore();
  useEsc(toMenu);
  if (!game) return null;
  const myTurn = !rolling && game.winner === null && (opponent === 'local' || opponent === 'solo' || (opponent === 'ai' ? game.turn === 0 : game.turn === me));
  return (
    <>
      <div className="hockey-hud">
        {opponent === 'solo' ? (
          <span className="hh-score">Práctica</span>
        ) : (
          ([0, 1] as const).map((i) => (
            <span key={i} className={'hh-score darts-player' + (i === game.turn ? ' turn' : '')}>
              <span className="dp-name">{names[i]}</span>
              <Rack group={game.groups[i]} />
            </span>
          ))
        )}
      </div>
      <div className="hud-corner right">
        <button className="icon-btn" aria-label="Cambiar cámara" title="Cámara 3D / desde arriba (C)" onClick={click(() => poolRef.current?.toggleCam())}>
          {cam === '3d' ? '🎥' : '⬇'}
        </button>
        <button className="icon-btn" aria-label="Menú" title="Menú (ESC)" onClick={click(toMenu)}>☰</button>
      </div>
      {myTurn && <PowerStrip />}
      {myTurn && game.inHand !== 'none' && <div className="darts-checkout">Bola en mano: arrastra la blanca para colocarla{game.inHand === 'kitchen' ? ' (detrás de la línea de saque)' : ''}</div>}
      {banner && (
        <div key={banner.n} className={'hockey-goal darts-banner ' + (banner.text.startsWith('Falta') || banner.text.includes('antes') ? 'p2' : 'p1')}>
          {banner.text}
        </div>
      )}
    </>
  );
}

function End() {
  const { opponent, result, level } = usePoolStore();
  const again = opponent === 'online' ? click(() => poolRef.current?.seek()) : click(() => poolRef.current?.rematch());
  return (
    <div className="screen">
      <div className="panel hockey-panel">
        <h2>{result}</h2>
        {opponent === 'ai' && <p className="tagline">Nivel de la IA: {LEVELS[level]}</p>}
        <button className="btn primary" onClick={again} autoFocus>
          {opponent === 'online' ? 'Buscar otra partida' : 'Revancha'}
        </button>
        <button className="btn ghost" onClick={click(toMenu)}>
          Menú
        </button>
      </div>
    </div>
  );
}

export function PoolUI() {
  const screen = usePoolStore((s) => s.screen);
  return (
    <>
      {screen === 'playing' && <Hud />}
      {screen === 'menu' && <Menu />}
      {screen === 'controls' && <Controls />}
      {screen === 'seek' && <Seek />}
      {screen === 'end' && <End />}
    </>
  );
}
