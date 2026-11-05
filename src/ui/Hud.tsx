import { gameRef } from '../game/instance';
import { turnState } from '../scoring/scoring';
import { useGameStore } from '../store/useGameStore';
import { MuteButton } from './MuteButton';
import { ScoreSheet } from './ScoreSheet';
import { TouchControls } from './TouchControls';

function Scoreboard() {
  const players = useGameStore((s) => s.players);
  const current = useGameStore((s) => s.current);
  return (
    <div id="scoreboard">
      {players.map((p, i) => (
        <ScoreSheet key={i} player={p} active={i === current} />
      ))}
    </div>
  );
}

/** The throw is the drag itself, so this only coaches and reports. */
function ThrowCoach() {
  const phase = useGameStore((s) => s.phase);
  const last = useGameStore((s) => s.lastThrow);
  const rival = useGameStore((s) => s.players[s.current]);
  if (phase === 'aim' && rival?.ai !== undefined) return <div id="throw-coach">Turno de <b>{rival.name}</b> · preparando el tiro…</div>;
  if (phase === 'aim' || phase === 'grab') {
    return (
      <div id="throw-coach" className={phase === 'grab' ? 'holding' : ''}>
        {phase === 'grab' ? (
          <>Echa la bola atrás y lánzala hacia los bolos · <b>sale sola al llegar a la línea</b></>
        ) : (
          <>Agarra la bola y arrástrala para lanzar</>
        )}
      </div>
    );
  }
  if (!last || phase !== 'rolling') return null;
  const spin = Math.round(last.spin * 100);
  return (
    <div id="throw-coach" className="report">
      <b>{last.kmh.toFixed(0)} km/h</b> · {last.angleDeg >= 0 ? '+' : ''}
      {last.angleDeg.toFixed(1)}° · efecto {spin > 0 ? '↪' : spin < 0 ? '↩' : ''}
      {Math.abs(spin)}
    </div>
  );
}

function SpinPanel() {
  const aim = useGameStore((s) => s.aim);
  const phase = useGameStore((s) => s.phase);
  const aiTurn = useGameStore((s) => s.players[s.current]?.ai !== undefined);
  if ((phase !== 'aim' && phase !== 'grab') || aiTurn) return null;
  const spin = Math.round(aim.spin * 100);
  return (
    <div id="aim-panel">
      <div className="aim-row">
        <span className="lbl">MUÑECA</span>
        <div className="aim-track">
          <i className="aim-knob" style={{ left: `${50 + aim.spin * 50}%` }} />
        </div>
        <span className="val">{spin > 0 ? '↪' : spin < 0 ? '↩' : ''}{Math.abs(spin)}</span>
      </div>
      <div className="aim-hint">
        <b>Q/E</b> o rueda: efecto de muñeca · curvar el gesto al soltar también da efecto
      </div>
    </div>
  );
}

function Banner() {
  const banner = useGameStore((s) => s.banner);
  if (!banner) return null;
  return (
    <div id="banner" key={banner.id} className={banner.kind}>
      <div id="banner-text">{banner.title}</div>
      <div id="banner-sub">{banner.sub}</div>
    </div>
  );
}

function Cine() {
  const on = useGameStore((s) => s.cine);
  const players = useGameStore((s) => s.players);
  const current = useGameStore((s) => s.current);
  const p = players[current];
  const ts = p ? turnState(p.rolls) : null;
  return (
    <div id="cine" className={on ? 'on' : ''}>
      <div className="bar top" />
      <div className="bar bottom" />
      <div id="cine-tag">
        <i className="dot-live" /> EN PISTA{ts ? ` · FRAME ${ts.frame + 1} · BOLA ${ts.ball + 1}` : ''}
      </div>
    </div>
  );
}

function TvSkip() {
  const tv = useGameStore((s) => s.tv);
  if (!tv) return null;
  return (
    <div id="tv-skip">
      <i className="dot-live" /> EN PANTALLA · toca o pulsa ESPACIO para saltar
    </div>
  );
}

export function Hud() {
  const screen = useGameStore((s) => s.screen);
  return (
    <div id="hud">
      <Cine />
      <Scoreboard />
      <div className="hud-corner left">
        <button className="icon-btn" onClick={() => gameRef.current?.togglePause()} title="Pausa (ESC)" aria-label="Pausa">
          II
        </button>
        <button className="icon-btn" onClick={() => gameRef.current?.toggleCamera()} title="Cambiar cámara (C)" aria-label="Cambiar cámara">
          🎥
        </button>
      </div>
      <div className="hud-corner right">
        <MuteButton />
      </div>
      <Banner />
      <TvSkip />
      <SpinPanel />
      <ThrowCoach />
      {screen === 'playing' && <TouchControls />}
    </div>
  );
}
