import { useState, type ReactNode } from 'react';
import { audio } from '../audio/AudioEngine';
import { BALL_COLORS, type Settings } from '../config/settings';
import { gameRef } from '../game/instance';
import { useGameStore } from '../store/useGameStore';

type Tab = 'partida' | 'bola' | 'pista' | 'graficos';
const TABS: Array<[Tab, string]> = [
  ['partida', 'Partida'],
  ['bola', 'Bola'],
  ['pista', 'Pista'],
  ['graficos', 'Gráficos'],
];

function Options<T extends string | number | boolean>(props: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; color?: string }>;
  onChange(v: T): void;
}) {
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
            onClick={() => (audio.ui(), props.onChange(o.value))}
          >
            {o.color && <i className="dot" style={{ background: o.color }} />}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SetupPanel() {
  const [tab, setTab] = useState<Tab>('partida');
  const s = useGameStore((st) => st.settings);
  const update = useGameStore((st) => st.updateSettings);
  const setScreen = useGameStore((st) => st.setScreen);
  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => update({ [k]: v } as Partial<Settings>);

  let content: ReactNode;
  if (tab === 'partida') {
    content = (
      <>
        <Options label="Jugadores" value={s.players} onChange={set('players')} options={[{ value: 1, label: '1 jugador' }, { value: 2, label: '2 jugadores' }]} />
        {Array.from({ length: s.players }, (_, i) => (
          <div className="opt-group" key={i}>
            <label htmlFor={`name-${i}`}>Nombre {i + 1}</label>
            <input
              id={`name-${i}`}
              className="text-input"
              maxLength={12}
              value={s.names[i]}
              onChange={(e) => {
                const names = [...s.names] as Settings['names'];
                names[i] = e.target.value;
                update({ names });
              }}
            />
          </div>
        ))}
      </>
    );
  } else if (tab === 'bola') {
    content = (
      <>
        <Options
          label="Peso"
          value={s.ballWeight}
          onChange={set('ballWeight')}
          options={([12, 14, 15, 16] as const).map((w) => ({ value: w, label: `${w} lb · ${(w * 0.4536).toFixed(1)} kg` }))}
        />
        <Options
          label="Color"
          value={s.ballColor}
          onChange={set('ballColor')}
          options={Object.entries(BALL_COLORS).map(([id, c]) => ({ value: id, label: c.label, color: `radial-gradient(circle at 35% 30%, ${c.swirl}, ${c.base})` }))}
        />
      </>
    );
  } else if (tab === 'pista') {
    content = (
      <>
        <Options label="Madera" value={s.wood} onChange={set('wood')} options={[{ value: 'clara', label: 'Arce clara' }, { value: 'oscura', label: 'Nogal oscura' }]} />
        <Options label="Público" value={s.crowd} onChange={set('crowd')} options={[{ value: true, label: 'Con público' }, { value: false, label: 'Sin público' }]} />
      </>
    );
  } else {
    content = (
      <>
        <Options label="Calidad" value={s.quality} onChange={set('quality')} options={[{ value: 'baja', label: 'Baja' }, { value: 'media', label: 'Media' }, { value: 'alta', label: 'Alta' }]} />
        <Options label="Cámara" value={s.camera} onChange={set('camera')} options={[{ value: 'clasica', label: 'Tras la bola' }, { value: 'aerea', label: 'Aérea' }]} />
      </>
    );
  }

  return (
    <div className="screen">
      <div className="panel setup-panel">
        <div className="setup-head">
          <h2>Personalizar partida</h2>
        </div>
        <div className="setup-tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={'setup-tab' + (tab === id ? ' active' : '')} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="setup-grid" role="tabpanel">{content}</div>
        <p className="setup-note">Los cambios se ven en directo sobre la pista.</p>
        <div className="setup-actions">
          <button className="btn primary" onClick={() => (audio.unlock(), gameRef.current?.startMatch())}>
            ▶ Jugar
          </button>
          <button className="btn ghost" onClick={() => setScreen('menu')}>
            Volver
          </button>
        </div>
      </div>
    </div>
  );
}
