import { useEffect } from 'react';
import { audio } from '../../audio/AudioEngine';
import { dartsRef } from '../../games/darts/instance';
import { DARTS_PER_TURN, LEGS_TO_WIN, type DartsMode } from '../../games/darts/physics';
import { useDartsStore, type Opponent } from '../../games/darts/store';
import { useNetStore } from '../../net/client';
import { worldRef } from '../../world/instance';
import { MuteButton } from '../MuteButton';

const click = (fn: () => void) => () => {
  audio.unlock();
  audio.ui();
  fn();
};

const start = (m: DartsMode, o: Opponent = 'solo') => click(() => dartsRef.current?.start(m, o));
const toMenu = () => (dartsRef.current ? dartsRef.current.quit() : useDartsStore.getState().set({ screen: 'menu', poster: false }));
const closePoster = () => dartsRef.current?.setPoster(false);
const LEVELS = ['Fácil', 'Media', 'Experta'];

function useEsc(fn: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.code === 'Escape' && fn();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fn]);
}

function Menu() {
  const level = useDartsStore((s) => s.level);
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
        <p className="menu-tagline">501 · al mejor de {LEGS_TO_WIN * 2 - 1} legs · cierre en doble</p>
        <div className="menu-buttons">
          <button className="btn primary xl" onClick={start('501', 'ai')} autoFocus>
            ▶ Contra la IA
          </button>
          <div className="opt-group" role="radiogroup" aria-label="Nivel de la IA">
            <div className="opt-row">
              {LEVELS.map((l, i) => (
                <button key={l} role="radio" aria-checked={i === level} className={'opt' + (i === level ? ' selected' : '')} onClick={click(() => useDartsStore.getState().set({ level: i }))}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <button className="btn menu" onClick={click(() => dartsRef.current?.seek())}>
            Online 1 contra 1
          </button>
          <button className="btn menu" onClick={start('501')}>
            501 en solitario
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

function Seek() {
  const status = useNetStore((s) => s.status);
  useEsc(toMenu);
  return (
    <div className="screen">
      <div className="panel hockey-panel">
        <h2>Buscando rival…</h2>
        <p className="tagline">
          {status === 'online'
            ? 'La partida empieza en cuanto otra persona de tu sala pulse «Online 1 contra 1» en los dardos.'
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
        <h2>Cómo se lanza</h2>
        <ul className="hockey-help">
          <li><b>Apunta</b>: pulsa sobre el punto de la diana al que quieres tirar.</li>
          <li><b>Lanza</b>: sin soltar, echa la mano atrás (abajo) y lánzala hacia arriba soltando al final.</li>
          <li><b>Fuerza</b>: un gesto más rápido que tu tiro normal sube el dardo; uno más lento lo deja caer. Un gesto torcido lo desvía.</li>
          <li><b>501</b>: empiezas en 501 y restas cada tirada de 3 dardos. Hay que cerrar en doble (o en la diana, 50). Si te pasas, te quedas en 1 o cierras sin doble, la tirada no cuenta.</li>
          <li><b>Partida</b>: contra la IA u online se juega al mejor de {LEGS_TO_WIN * 2 - 1} legs; cada leg lo abre el otro jugador.</li>
          <li><b>Rebotes</b>: un dardo que da de lleno en el alambre o en otro dardo cae al suelo y no puntúa, como en una diana de verdad.</li>
          <li><b>Reglas</b>: en la partida, toca el cartel de la pared y la cámara se acerca para leerlo.</li>
        </ul>
        <button className="btn primary" onClick={click(toMenu)}>
          Volver
        </button>
      </div>
    </div>
  );
}

function PosterClose() {
  useEsc(closePoster);
  return (
    <div className="hud-corner right">
      <button className="btn primary" onClick={closePoster}>✕ Cerrar reglas</button>
    </div>
  );
}

function Hud() {
  const { mode, opponent, points, round, hits, banner, turnStart, poster, names, scores, legs, who } = useDartsStore();
  useEsc(poster ? closePoster : toMenu);
  if (poster) return <PosterClose />;
  const match = opponent !== 'solo';
  return (
    <>
      <div className="hockey-hud">
        {match ? (
          ([0, 1] as const).map((i) => (
            <span key={i} className={'hh-score darts-player' + (i === who ? ' turn' : '')}>
              <span className="dp-name">{names[i]}</span>
              <b className={i ? 'p2' : 'p1'}>{i === who ? points : scores[i]}</b>
              <span className="hh-time" title="Legs ganados">{legs[i]}</span>
            </span>
          ))
        ) : (
          <>
            <span className="hh-score">
              {mode === '501' ? 'Quedan' : 'Total'} <b className="p1">{points}</b>
            </span>
            <span className="hh-time">Ronda {round}</span>
          </>
        )}
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
  const { darts, round, opponent, result, mode, level } = useDartsStore();
  const again = opponent === 'online' ? click(() => dartsRef.current?.seek()) : start(mode, opponent);
  return (
    <div className="screen">
      <div className="panel hockey-panel">
        <h2>{opponent === 'solo' ? '¡Partida cerrada!' : result}</h2>
        {opponent === 'solo' && (
          <p className="tagline">
            501 en {darts} dardos · {round} rondas · media {((501 / darts) * 3).toFixed(1)} por tirada
          </p>
        )}
        {opponent === 'ai' && <p className="tagline">Nivel de la IA: {LEVELS[level]}</p>}
        <button className="btn primary" onClick={again} autoFocus>
          {opponent === 'online' ? 'Buscar otra partida' : 'Otra partida'}
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
      {screen === 'seek' && <Seek />}
      {screen === 'end' && <End />}
    </>
  );
}
