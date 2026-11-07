import { useEffect } from 'react';
import { audio } from '../../../audio/AudioEngine';
import { BALL_COLORS, WOODS } from '../../../config/settings';
import { gameRef } from '../game/instance';
import { worldRef } from '../../../world/instance';
import { useGameStore } from '../store/useGameStore';
import { MuteButton } from '../../../ui/MuteButton';

export function MainMenu() {
  const settings = useGameStore((s) => s.settings);
  const stats = useGameStore((s) => s.stats);
  const updateSettings = useGameStore((s) => s.updateSettings);
  const setScreen = useGameStore((s) => s.setScreen);

  // ESC on the bowling menu walks back out to the hall.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.code === 'Escape' && worldRef.current?.leave();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const play = (players: 1 | 2) => {
    audio.unlock();
    audio.ui();
    updateSettings({ players });
    useGameStore.getState().setLadder(null);
    gameRef.current?.startMatch();
  };

  const tournament = () => {
    audio.unlock();
    audio.ui();
    useGameStore.getState().setLadder(0);
    gameRef.current?.startMatch();
  };

  return (
    <div className="screen">
      <div className="menu-hero">
        <div className="menu-topbar">
          <span className="record-chip" title="Mejor puntuación">🏆 {stats.best}</span>
          <MuteButton />
        </div>
        <h1 className="game-title big">
          BOLERA <span>3D</span>
        </h1>
        <p className="menu-tagline">Madera encerada, diez bolos y física real. Tu pista, tu línea.</p>
        <div className="menu-buttons">
          <button className="btn primary xl" onClick={() => play(1)} autoFocus>
            ▶ Partida individual
          </button>
          <button className="btn menu" onClick={tournament}>
            🏆 Torneo vs IA · stepladder
          </button>
          <button className="btn menu" onClick={() => play(2)}>
            Duelo local · 2 jugadores
          </button>
          <button className="btn menu" onClick={() => (audio.ui(), setScreen('setup'))}>
            ⚙ Personalizar partida
          </button>
          <button className="btn ghost" onClick={() => (audio.ui(), worldRef.current?.leave())}>
            ← Volver al local <span className="desktop-only">(ESC)</span>
          </button>
        </div>
        <div className="menu-summary">
          <span className="summary-chip">
            Bola {settings.ballWeight} lb · {BALL_COLORS[settings.ballColor]?.label}
          </span>
          <span className="summary-chip">Pista {WOODS[settings.wood]?.label ?? settings.wood}</span>
          <span className="summary-chip">{settings.crowd ? 'Con público' : 'Sin público'}</span>
          <span className="summary-chip">Gráficos {settings.quality}</span>
        </div>
        <div className="controls-help desktop-help">
          <p>
            <b>Agarra la bola con el ratón</b>, échala atrás y lánzala: la velocidad y la dirección del gesto son las del tiro
          </p>
          <p>
            <b>Q/E</b> o rueda efecto · <b>C</b> cámara · <b>M</b> sonido · <b>ESC</b> pausa
          </p>
        </div>
        <div className="controls-help mobile-help">
          <p>
            <b>Arrastra la bola</b> con el dedo y suéltala lanzándola hacia los bolos · ↩ ↪ efecto
          </p>
        </div>
        <p className="stats-line">
          {stats.games} partidas · récord {stats.best} · {stats.strikes} strikes · {stats.spares} spares
        </p>
        <p className="credits-line">Simulador de bolos de diez · reglas oficiales · física Rapier</p>
      </div>
    </div>
  );
}
