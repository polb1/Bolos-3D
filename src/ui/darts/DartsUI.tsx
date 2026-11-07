import { useEffect } from 'react';
import { audio } from '../../audio/AudioEngine';
import { dartsRef } from '../../games/darts/instance';
import { DARTS_PER_TURN, type DartsMode } from '../../games/darts/physics';
import { useDartsStore } from '../../games/darts/store';
import { worldRef } from '../../world/instance';
import { MuteButton } from '../MuteButton';

const click = (fn: () => void) => () => {
  audio.unlock();
  audio.ui();
  fn();
};

const start = (m: DartsMode) => click(() => dartsRef.current?.start(m));
const toMenu = () => useDartsStore.getState().set({ screen: 'menu' });

function useEsc(fn: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.code === 'Escape' && fn();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fn]);
}

function Menu() {
  useEsc(() => worldRef.current?.leave());
  return (
    <div className="screen">
      <div className="menu-hero">
        <div className="menu-topbar">
          <span />
          <MuteButton />
        </div>
        <h1 className="game-title big">
          DAR<span>DOS</span>
        </h1>
        <p className="menu-tagline">Máquina electrónica de bar · 2,44 m · física real</p>
        <div className="menu-buttons">
          <button className="btn primary xl" onClick={start('501')} autoFocus>
            ▶ 501
          </button>
          <button className="btn menu" onClick={start('practice')}>
            Práctica libre
          </button>
          <button className="btn menu" onClick={click(() => useDartsStore.getState().set({ screen: 'controls' }))}>
            Cómo se lanza
          </button>
          <button className="btn ghost" onClick={click(() => worldRef.current?.leave())}>
            ← Volver al local (ESC)
          </button>
        </div>
      </div>
    </div>
  );
}

function Controls() {
  return (
    <div className="screen">
      <div className="panel hockey-panel">
        <h2>Cómo se lanza</h2>
        <ul className="hockey-help">
          <li><b>Apunta</b>: pulsa sobre el punto de la diana al que quieres tirar.</li>
          <li><b>Lanza</b>: sin soltar, echa la mano atrás (abajo) y lánzala hacia arriba soltando al final.</li>
          <li><b>Fuerza</b>: un gesto más rápido que tu tiro normal sube el dardo; uno más lento lo deja caer. Un gesto torcido lo desvía.</li>
          <li><b>501</b>: empiezas en 501 y restas cada tirada de 3 dardos. Hay que cerrar en doble (o en la diana, 50). Si te pasas, te quedas en 1 o cierras sin doble, la tirada no cuenta.</li>
        </ul>
        <button className="btn primary" onClick={click(toMenu)}>
          Volver
        </button>
      </div>
    </div>
  );
}

function Hud() {
  const { mode, points, round, hits, banner, turnStart } = useDartsStore();
  useEsc(toMenu);
  return (
    <>
      <div className="hockey-hud">
        <span className="hh-score">
          {mode === '501' ? 'Quedan' : 'Total'} <b className="p1">{points}</b>
        </span>
        <span className="hh-time">Ronda {round}</span>
      </div>
      <div className="darts-turn" aria-label="Dardos de esta tirada">
        {Array.from({ length: DARTS_PER_TURN }, (_, i) => (
          <span key={i} className={'dt' + (hits[i] ? ' done' : '')}>{hits[i]?.label ?? '·'}</span>
        ))}
        {mode === '501' && hits.length > 0 && <span className="dt sum">{turnStart - points || hits.reduce((s, h) => s + h.score, 0)}</span>}
      </div>
      <div className="hud-corner right">
        <button className="icon-btn" aria-label="Menú" title="Menú (ESC)" onClick={click(toMenu)}>☰</button>
      </div>
      {banner && (
        <div key={banner.n} className={'hockey-goal darts-banner ' + (banner.kind === 'bust' || banner.kind === 'miss' ? 'p2' : 'p1')}>
          {banner.text}
        </div>
      )}
    </>
  );
}

function End() {
  const { darts, round } = useDartsStore();
  return (
    <div className="screen">
      <div className="panel hockey-panel">
        <h2>¡Partida cerrada!</h2>
        <p className="tagline">
          501 en {darts} dardos · {round} rondas · media {((501 / darts) * 3).toFixed(1)} por tirada
        </p>
        <button className="btn primary" onClick={start('501')} autoFocus>
          Otra partida
        </button>
        <button className="btn ghost" onClick={click(toMenu)}>
          Menú
        </button>
      </div>
    </div>
  );
}

export function DartsUI() {
  const screen = useDartsStore((s) => s.screen);
  return (
    <>
      {screen === 'playing' && <Hud />}
      {screen === 'menu' && <Menu />}
      {screen === 'controls' && <Controls />}
      {screen === 'end' && <End />}
    </>
  );
}
