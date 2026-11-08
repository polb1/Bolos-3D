import { gameRef } from '../game/instance';
import { useGameStore } from '../store/useGameStore';

export function PausePanel() {
  const setScreen = useGameStore((s) => s.setScreen);
  const online = useGameStore((s) => !!s.online);
  return (
    <div className="screen">
      <div className="panel">
        <h2>Partida pausada</h2>
        <p className="tagline">{online ? 'Tu rival sigue en la pista: no tardes.' : 'Los bolos te esperan.'}</p>
        <button className="btn primary" onClick={() => setScreen('playing')} autoFocus>
          Reanudar
        </button>
        {!online && (
          <button className="btn" onClick={() => gameRef.current?.startMatch()}>
            Reiniciar partida
          </button>
        )}
        <button className="btn ghost" onClick={() => gameRef.current?.quitToMenu()}>
          {online ? 'Abandonar la partida' : 'Salir al menú'}
        </button>
      </div>
    </div>
  );
}
