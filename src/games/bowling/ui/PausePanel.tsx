import { gameRef } from '../game/instance';
import { useGameStore } from '../store/useGameStore';

export function PausePanel() {
  const setScreen = useGameStore((s) => s.setScreen);
  return (
    <div className="screen">
      <div className="panel">
        <h2>Partida pausada</h2>
        <p className="tagline">Los bolos te esperan.</p>
        <button className="btn primary" onClick={() => setScreen('playing')} autoFocus>
          Reanudar
        </button>
        <button className="btn" onClick={() => gameRef.current?.startMatch()}>
          Reiniciar partida
        </button>
        <button className="btn ghost" onClick={() => gameRef.current?.quitToMenu()}>
          Salir al menú
        </button>
      </div>
    </div>
  );
}
