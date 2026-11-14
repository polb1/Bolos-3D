import { click, useEsc } from '../../../ui/common';
import { MuteButton } from '../../../ui/MuteButton';
import { worldRef } from '../../../world/instance';
import { foosRef } from '../instance';
import { GOALS_TO_WIN } from '../physics';
import { useFoosStore } from '../store';

const LEVELS = ['Fácil', 'Media', 'Difícil'];
const start = click(() => foosRef.current?.start());
const toMenu = () => (foosRef.current ? foosRef.current.quit() : useFoosStore.getState().set({ screen: 'menu' }));

function Menu() {
  const level = useFoosStore((s) => s.level);
  useEsc(() => worldRef.current?.leave());
  return (
    <div className="screen">
      <div className="menu-hero">
        <div className="menu-topbar">
          <span />
          <MuteButton />
        </div>
        <h1 className="game-title big">
          FUTBO<span>LÍN</span>
        </h1>
        <p className="menu-tagline">Rojos contra azules · gana quien marque {GOALS_TO_WIN}</p>
        <div className="menu-buttons">
          <button className="btn primary xl" onClick={start} autoFocus>
            ▶ Contra la IA
          </button>
          <div className="opt-group" role="radiogroup" aria-label="Nivel de la IA">
            <div className="opt-row">
              {LEVELS.map((l, i) => (
                <button key={l} role="radio" aria-checked={i === level} className={'opt' + (i === level ? ' selected' : '')} onClick={click(() => useFoosStore.getState().set({ level: i }))}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <button className="btn menu" onClick={click(() => useFoosStore.getState().set({ screen: 'controls' }))}>
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

function Controls() {
  useEsc(toMenu);
  return (
    <div className="screen">
      <div className="panel hockey-panel">
        <h2>Cómo se juega</h2>
        <ul className="hockey-help">
          <li><b>Tu equipo</b>: los rojos, en tu lado de la mesa. Atacas hacia la portería del fondo.</li>
          <li><b>Mover</b>: desliza el ratón o el dedo de lado a lado (o ← → / A D). Todas tus barras se mueven a la vez.</li>
          <li><b>Chutar</b>: clic, toque o Espacio. Los muñecos giran y golpean la bola que tengan delante.</li>
          <li><b>Partida</b>: gana el primero que marque {GOALS_TO_WIN} goles. Tras cada gol la bola vuelve al centro.</li>
        </ul>
        <button className="btn primary" onClick={click(toMenu)}>
          Volver
        </button>
      </div>
    </div>
  );
}

function Hud() {
  const { score, banner } = useFoosStore();
  useEsc(toMenu);
  return (
    <>
      <div className="hockey-hud">
        <span className="hh-score">
          Tú <b className="p1">{score[0]}</b>
        </span>
        <span className="hh-time">a {GOALS_TO_WIN}</span>
        <span className="hh-score">
          <b className="p2">{score[1]}</b> IA
        </span>
      </div>
      <div className="hud-corner right">
        <button className="icon-btn" aria-label="Menú" title="Menú (ESC)" onClick={click(toMenu)}>☰</button>
      </div>
      {banner && (
        <div key={banner.n} className={'hockey-goal ' + (banner.mine ? 'p1' : 'p2')}>
          {banner.text}
        </div>
      )}
    </>
  );
}

function End() {
  const { result, level } = useFoosStore();
  useEsc(toMenu);
  return (
    <div className="screen">
      <div className="panel hockey-panel">
        <h2>{result}</h2>
        <p className="tagline">Nivel de la IA: {LEVELS[level]}</p>
        <button className="btn primary" onClick={start} autoFocus>
          Otra partida
        </button>
        <button className="btn ghost" onClick={click(toMenu)}>
          Menú
        </button>
      </div>
    </div>
  );
}

export function FoosballUI() {
  const screen = useFoosStore((s) => s.screen);
  return (
    <>
      {screen === 'playing' && <Hud />}
      {screen === 'menu' && <Menu />}
      {screen === 'controls' && <Controls />}
      {screen === 'end' && <End />}
    </>
  );
}
