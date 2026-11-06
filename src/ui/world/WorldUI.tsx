import { useRef, type PointerEvent as RPointerEvent } from 'react';
import { audio } from '../../audio/AudioEngine';
import { useGameStore } from '../../store/useGameStore';
import { ACTIVITIES } from '../../world/activities';
import { worldRef } from '../../world/instance';
import { OUTFITS, useWorldStore, type WorldScreen } from '../../world/worldStore';
import { MuteButton } from '../MuteButton';
import { MAX_NAME } from '../../net/protocol';
import { useNetStore } from '../../net/client';

const click = (fn: () => void) => () => {
  audio.unlock();
  audio.ui();
  fn();
};

function Back({ to = 'title' }: { to?: WorldScreen }) {
  const setScreen = useWorldStore((s) => s.setScreen);
  return (
    <button className="btn ghost" onClick={click(() => setScreen(to))}>
      Volver
    </button>
  );
}

function Title() {
  const setScreen = useWorldStore((s) => s.setScreen);
  const coins = useGameStore((s) => s.coins);
  const name = useWorldStore((s) => s.name);
  const setName = useWorldStore((s) => s.setName);
  const style = useWorldStore((s) => s.style);
  return (
    <div className="screen world-title">
      <div className="menu-hero">
        <div className="menu-topbar">
          <span className="record-chip" title="Monedas">🪙 {coins}</span>
          <MuteButton />
        </div>
        <h1 className="game-title big">
          VIRTUAL <span>ARCADE</span>
        </h1>
        <p className="menu-tagline">Bolera, billar, futbolín, air hockey, dardos y recreativas. Entra y elige.</p>
        <label className="name-field">
          Tu nombre online
          <input
            value={name}
            maxLength={MAX_NAME}
            placeholder="Jugador"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label="Tu nombre online"
          />
        </label>
        <div className="menu-buttons">
          <button className="btn primary xl" onClick={click(() => worldRef.current?.enter())} autoFocus>
            ▶ Entrar al local
          </button>
          <button className="btn menu" onClick={click(() => setScreen('character'))}>
            Personaje
          </button>
          <button className="btn menu" onClick={click(() => setScreen('controls'))}>
            Controles
          </button>
          <button className="btn menu" onClick={click(() => setScreen('stats'))}>
            Estadísticas
          </button>
          <button className="btn ghost" onClick={click(() => useWorldStore.getState().setStyle(style === '3d' ? 'pixel' : '3d'))}>
            Cambiar a local {style === '3d' ? 'pixel art' : '3D'}
          </button>
        </div>
        <p className="credits-line">Local {style === '3d' ? 'en 3D' : 'en pixel art'} · juegos en 3D con física Rapier</p>
      </div>
    </div>
  );
}

function Character() {
  const outfit = useWorldStore((s) => s.outfit);
  const setOutfit = useWorldStore((s) => s.setOutfit);
  return (
    <div className="screen world-side">
      <div className="panel">
        <h2>Tu personaje</h2>
        <div className="opt-row" role="radiogroup" aria-label="Estilo">
          {OUTFITS.map((o, i) => (
            <button key={o.name} role="radio" aria-checked={i === outfit} className={'opt' + (i === outfit ? ' selected' : '')} onClick={click(() => setOutfit(i))}>
              <i className="dot" style={{ background: o.outfit.shirt }} />
              {o.name}
            </button>
          ))}
        </div>
        <Back />
      </div>
    </div>
  );
}

function ControlsList() {
  return (
    <div className="controls-table">
      <p><b>W A S D</b> o flechas moverse · <b>Shift</b> correr</p>
      <p><b>E</b> interactuar · <b>ESC</b> menú</p>
      <p>Local 3D: <b>ratón</b> o arrastrar para mirar · <b>rueda</b> acercar</p>
      <p>Dentro de cada juego, los controles son los suyos (3D)</p>
      <p className="mobile-only">Móvil: joystick para moverte y toca el aviso ▶ para jugar</p>
    </div>
  );
}

function Controls({ back }: { back: 'title' | 'paused' }) {
  return (
    <div className="screen">
      <div className="panel">
        <h2>Controles</h2>
        <ControlsList />
        <Back to={back} />
      </div>
    </div>
  );
}

function Stats() {
  const stats = useGameStore((s) => s.stats);
  const coins = useGameStore((s) => s.coins);
  const owned = useGameStore((s) => s.owned);
  return (
    <div className="screen">
      <div className="panel">
        <h2>Estadísticas</h2>
        <p className="stats-line">🎳 Bolera: {stats.games} partidas · récord {stats.best} · {stats.strikes} strikes · {stats.spares} spares</p>
        <p className="stats-line">🏆 Torneos vs IA ganados: {stats.titles ?? 0}</p>
        <p className="stats-line">🪙 {coins} monedas · {owned.length} objetos comprados</p>
        <p className="stats-line">Billar, air hockey, futbolín y dardos: llegarán con sus juegos.</p>
        <Back />
      </div>
    </div>
  );
}

function Pause() {
  const setScreen = useWorldStore((s) => s.setScreen);
  const crowd = useGameStore((s) => s.settings.crowd);
  const quality = useGameStore((s) => s.settings.quality);
  const update = useGameStore((s) => s.updateSettings);
  return (
    <div className="screen">
      <div className="panel">
        <h2>Pausa</h2>
        <button className="btn primary" onClick={click(() => worldRef.current?.resume())} autoFocus>
          Continuar
        </button>
        <div className="opt-row">
          {(['baja', 'media', 'alta'] as const).map((q) => (
            <button key={q} className={'opt' + (q === quality ? ' selected' : '')} onClick={click(() => update({ quality: q }))}>
              Gráficos 3D {q}
            </button>
          ))}
          <button className={'opt' + (crowd ? ' selected' : '')} onClick={click(() => (update({ crowd: !crowd }), audio.setAmbience(!crowd)))}>
            Ambiente {crowd ? 'sí' : 'no'}
          </button>
        </div>
        <button className="btn menu" onClick={click(() => setScreen('controls'))}>
          Controles
        </button>
        <button className="btn ghost" onClick={click(() => worldRef.current?.toTitle())}>
          Menú principal
        </button>
      </div>
    </div>
  );
}

/** Left-thumb joystick and action buttons for touch screens. */
function TouchPad() {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const id = useRef<number | null>(null);
  const set = (e: RPointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    const R = r.width / 2;
    let x = (e.clientX - r.left - R) / R;
    let y = (e.clientY - r.top - R) / R;
    const m = Math.hypot(x, y);
    if (m > 1) (x /= m), (y /= m);
    const w = worldRef.current;
    if (w) {
      w.stick.x = x;
      w.stick.y = -y;
      w.stick.run = m > 0.95;
    }
    knob.current!.style.transform = `translate(${x * R * 0.6}px, ${y * R * 0.6}px)`;
  };
  const end = () => {
    id.current = null;
    const w = worldRef.current;
    if (w) Object.assign(w.stick, { x: 0, y: 0, run: false });
    knob.current!.style.transform = '';
  };
  return (
    <div className="world-pad">
      <div
        ref={base}
        className="joy"
        onPointerDown={(e) => {
          id.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          set(e);
        }}
        onPointerMove={(e) => id.current === e.pointerId && set(e)}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div ref={knob} className="knob" />
      </div>
    </div>
  );
}

/** Who else is in the room; the game is fully playable offline too. */
function OnlineChip() {
  const { status, room, names } = useNetStore();
  const text =
    status === 'online'
      ? `🟢 Sala ${room} · ${names.length + 1} ${names.length ? 'jugadores' : 'jugador'}`
      : status === 'connecting'
        ? '🟡 Conectando…'
        : status === 'full'
          ? '🔴 Sala llena'
          : '⚪ Sin conexión · modo local';
  return (
    <span className="record-chip online-chip" title={names.length ? `En la sala: ${names.join(', ')}` : undefined}>
      {text}
    </span>
  );
}

function Hud() {
  const nearby = useWorldStore((s) => s.nearby);
  const toast = useWorldStore((s) => s.toast);
  const a = ACTIVITIES.find((x) => x.id === nearby);
  return (
    <>
      <div className="world-brand">
        VIRTUAL <span>ARCADE</span>
      </div>
      <div className="world-top">
        <OnlineChip />
        <MuteButton />
        <button className="icon-btn" onClick={click(() => worldRef.current?.pause())} title="Menú (ESC)" aria-label="Menú">
          ☰
        </button>
      </div>
      {a && (
        <button className="world-prompt" style={{ borderColor: a.color }} onClick={click(() => worldRef.current?.interact())}>
          <b style={{ color: a.color }}>{a.name}</b> ·{' '}
          {a.place ? (
            <>
              <span className="desktop-only">Pulsa E para jugar</span>
              <span className="mobile-only">Toca para jugar ▶</span>
            </>
          ) : (
            'Próximamente'
          )}
        </button>
      )}
      {toast && <div className="world-toast">{toast}</div>}
      <div className="world-help desktop-help">
        <b>WASD</b> moverse · <b>Shift</b> correr · <b>E</b> interactuar · <b>ESC</b> menú
      </div>
      <TouchPad />
    </>
  );
}

/** Everything drawn over the hall while it is the live place. */
export function WorldUI() {
  const screen = useWorldStore((s) => s.screen);
  const prev = useRef<'title' | 'paused'>('title');
  if (screen === 'title' || screen === 'paused') prev.current = screen;
  return (
    <>
      {screen === 'title' && <Title />}
      {screen === 'character' && <Character />}
      {screen === 'controls' && <Controls back={prev.current} />}
      {screen === 'stats' && <Stats />}
      {screen === 'explore' && <Hud />}
      {screen === 'paused' && <Pause />}
    </>
  );
}

export function Fade() {
  const fade = useWorldStore((s) => s.fade);
  return <div className={'world-fade' + (fade ? ' on' : '')} />;
}
