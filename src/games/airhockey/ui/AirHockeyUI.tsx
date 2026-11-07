import { click } from '../../../ui/common';
import { useEffect, type ReactNode } from 'react';
import { hockeyRef } from '../instance';
import { MATCH_TIME, type Mode } from '../rules';
import { useHockeyStore, type HockeySettings, type OnlineMatch } from '../store';
import { worldRef } from '../../../world/instance';
import { MuteButton } from '../../../ui/MuteButton';

const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

const MODE_NAMES: Record<Mode, string> = { ai: 'Contra la IA', versus: 'Dos jugadores', training: 'Entrenamiento', online: 'Online' };

/** Score labels [side 1, side -1] from this screen's point of view. */
function sideNames(mode: Mode, online: OnlineMatch | null, long = false): [string, string] {
  if (mode === 'online' && online) {
    const me = long ? 'Tú' : 'TÚ';
    return online.role === 'host' ? [me, online.rivalName] : [online.rivalName, me];
  }
  if (mode === 'versus') return long ? ['Jugador 1', 'Jugador 2'] : ['J1', 'J2'];
  return long ? ['Tú', 'IA'] : ['TÚ', 'IA'];
}

function leaveOnline() {
  hockeyRef.current?.quitOnline();
  worldRef.current?.leave();
}

function Options<T extends string | number>(props: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange(v: T): void }) {
  return (
    <div className="opt-group" role="radiogroup" aria-label={props.label}>
      <span className="lbl">{props.label}</span>
      <div className="opt-row">
        {props.options.map((o) => (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={o.value === props.value}
            className={'opt' + (o.value === props.value ? ' selected' : '')}
            onClick={click(() => props.onChange(o.value))}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="screen">
      <div className="panel hockey-panel">
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Menu() {
  const setScreen = useHockeyStore((s) => s.setScreen);
  const settings = useHockeyStore((s) => s.settings);
  const start = (m: Mode) => click(() => hockeyRef.current?.start(m));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.code === 'Escape' && worldRef.current?.leave();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const diff = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil' }[settings.difficulty];
  return (
    <div className="screen">
      <div className="menu-hero">
        <div className="menu-topbar">
          <span />
          <MuteButton />
        </div>
        <h1 className="game-title big">
          AIR <span>HOCKEY</span>
        </h1>
        <p className="menu-tagline">
          A {settings.target} goles o {clock(MATCH_TIME)} · IA {diff}
        </p>
        <div className="menu-buttons">
          <button className="btn primary xl" onClick={start('ai')} autoFocus>
            ▶ Jugar
          </button>
          <button className="btn menu" onClick={start('training')}>
            Entrenamiento
          </button>
          <button className="btn menu" onClick={start('versus')}>
            Dos jugadores
          </button>
          <button className="btn menu" onClick={click(() => setScreen('settings'))}>
            Configuración
          </button>
          <button className="btn menu" onClick={click(() => setScreen('controls'))}>
            Controles
          </button>
          <button className="btn ghost" onClick={click(() => worldRef.current?.leave())}>
            ← Volver al local (ESC)
          </button>
        </div>
      </div>
    </div>
  );
}

function Settings() {
  const s = useHockeyStore((st) => st.settings);
  const update = useHockeyStore((st) => st.updateSettings);
  const setScreen = useHockeyStore((st) => st.setScreen);
  const set = <K extends keyof HockeySettings>(k: K) => (v: HockeySettings[K]) => update({ [k]: v } as Partial<HockeySettings>);
  return (
    <Panel title="Configuración">
      <div className="hockey-opts">
        <Options label="Goles" value={s.target} onChange={set('target')} options={[5, 7, 10, 15].map((n) => ({ value: n, label: String(n) }))} />
        <Options
          label="IA"
          value={s.difficulty}
          onChange={set('difficulty')}
          options={[
            { value: 'easy', label: 'Fácil' },
            { value: 'normal', label: 'Normal' },
            { value: 'hard', label: 'Difícil' },
          ]}
        />
        <Options
          label="Disco"
          value={s.puckSpeed}
          onChange={set('puckSpeed')}
          options={[
            { value: 'slow', label: 'Lento' },
            { value: 'normal', label: 'Normal' },
            { value: 'fast', label: 'Rápido' },
          ]}
        />
        <Options
          label="Sensibilidad"
          value={s.sensitivity}
          onChange={set('sensitivity')}
          options={[0.6, 0.8, 1, 1.25, 1.5].map((n) => ({ value: n, label: `×${n}` }))}
        />
      </div>
      <button className="btn primary" onClick={click(() => setScreen('menu'))}>
        Listo
      </button>
    </Panel>
  );
}

function Controls() {
  const setScreen = useHockeyStore((s) => s.setScreen);
  return (
    <Panel title="Controles">
      <ul className="hockey-help">
        <li><b>Ratón</b>: tu mazo sigue al cursor sobre la mesa.</li>
        <li><b>WASD / flechas</b>: alternativa con teclado.</li>
        <li><b>Móvil</b>: desliza el dedo por tu mitad.</li>
        <li><b>Dos jugadores</b>: J1 con WASD (izquierda), J2 con flechas (derecha). En pantalla táctil, cada uno con su dedo en su mitad.</li>
        <li><b>ESC</b>: pausa.</li>
        <li>Gana quien llegue antes a 10 goles o quien vaya por delante al acabar el 1:30. Empate al final: gol de oro.</li>
        <li>No puedes cruzar la línea central. Gol cuando el disco entra entero en la ranura; saca quien lo recibe.</li>
      </ul>
      <button className="btn primary" onClick={click(() => setScreen('menu'))}>
        Volver
      </button>
    </Panel>
  );
}

function Hud() {
  const score = useHockeyStore((s) => s.score);
  const mode = useHockeyStore((s) => s.mode);
  const time = useHockeyStore((s) => s.time);
  const lastGoal = useHockeyStore((s) => s.lastGoal);
  const online = useHockeyStore((s) => s.online);
  const names = sideNames(mode, online);
  const mySide = online?.role === 'guest' ? -1 : 1;
  return (
    <>
      <div className="hockey-hud">
        {mode === 'training' ? (
          <span className="hh-score">Goles <b className="p1">{score.p1}</b></span>
        ) : (
          <span className="hh-score">
            <span className="p1">{names[0]} {score.p1}</span>
            <span className="sep">–</span>
            <span className="p2">{score.p2} {names[1]}</span>
          </span>
        )}
        {mode === 'training' ? (
          <span className="hh-time">{clock(time)}</span>
        ) : score.golden ? (
          <span className="hh-time golden">GOL DE ORO</span>
        ) : (
          <span className={'hh-time' + (time > MATCH_TIME - 10 ? ' hurry' : '')}>{clock(Math.ceil(Math.max(0, MATCH_TIME - time)))}</span>
        )}
      </div>
      {mode === 'online' ? (
        <div className="hud-corner right">
          <button className="icon-btn" aria-label="Salir" title="Salir de la partida" onClick={click(leaveOnline)}>✕</button>
        </div>
      ) : (
      <div className="hud-corner right">
        <button className="icon-btn" aria-label="Reiniciar" title="Reiniciar" onClick={click(() => hockeyRef.current?.restart())}>↺</button>
        <button className="icon-btn" aria-label="Pausa" title="Pausa (ESC)" onClick={click(() => hockeyRef.current?.pause())}>❚❚</button>
      </div>
      )}
      {lastGoal && (
        <div key={lastGoal.n} className={'hockey-goal ' + (lastGoal.scorer === 1 ? 'p1' : 'p2')}>
          {mode === 'versus'
            ? `¡GOL DE J${lastGoal.scorer === 1 ? 1 : 2}!`
            : lastGoal.scorer === mySide
              ? '¡GOL!'
              : mode === 'online'
                ? `Gol de ${names[lastGoal.scorer === 1 ? 0 : 1]}`
                : 'Gol de la IA'}
        </div>
      )}
    </>
  );
}

function Paused() {
  const setScreen = useHockeyStore((s) => s.setScreen);
  return (
    <Panel title="Pausa">
      <button className="btn primary" onClick={click(() => hockeyRef.current?.resume())} autoFocus>
        Continuar
      </button>
      <button className="btn menu" onClick={click(() => hockeyRef.current?.restart())}>
        Reiniciar
      </button>
      <button className="btn ghost" onClick={click(() => setScreen('menu'))}>
        Salir al menú
      </button>
    </Panel>
  );
}

function End() {
  const { score, mode, time, setScreen, online } = useHockeyStore();
  const names = sideNames(mode, online, true);
  const mySide = online?.role === 'guest' ? -1 : 1;
  const title =
    mode === 'online' && online?.rivalLeft && !score.winner
      ? `${online.rivalName} ha salido`
      : mode === 'versus'
        ? `¡Gana el ${names[score.winner === 1 ? 0 : 1]}!`
        : score.winner === mySide
          ? '¡Has ganado!'
          : mode === 'online'
            ? `Gana ${online?.rivalName ?? 'tu rival'}`
            : 'Gana la IA';
  return (
    <Panel title={title}>
      <div className="hockey-final">
        <span className="p1">{names[0]} <b>{score.p1}</b></span>
        <span className="sep">–</span>
        <span className="p2"><b>{score.p2}</b> {names[1]}</span>
      </div>
      <p className="tagline">
        {MODE_NAMES[mode]} · {score.golden ? 'gol de oro' : time >= MATCH_TIME ? 'por tiempo' : `a ${score.target} goles`} · {clock(time)}
      </p>
      {mode === 'online' ? (
        <button className="btn primary" onClick={click(leaveOnline)} autoFocus>
          Volver al local
        </button>
      ) : (
        <>
          <button className="btn primary" onClick={click(() => hockeyRef.current?.restart())} autoFocus>
            Volver a jugar
          </button>
          <button className="btn ghost" onClick={click(() => setScreen('menu'))}>
            Menú
          </button>
        </>
      )}
    </Panel>
  );
}

export function AirHockeyUI() {
  const screen = useHockeyStore((s) => s.screen);
  return (
    <>
      {(screen === 'playing' || screen === 'paused') && <Hud />}
      {screen === 'menu' && <Menu />}
      {screen === 'settings' && <Settings />}
      {screen === 'controls' && <Controls />}
      {screen === 'paused' && <Paused />}
      {screen === 'end' && <End />}
    </>
  );
}
