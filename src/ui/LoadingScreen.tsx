import { useGameStore } from '../games/bowling/store/useGameStore';

export function LoadingScreen() {
  const error = useGameStore((s) => s.loadError);
  return (
    <div className="screen">
      <div className="panel">
        <h1 className="game-title">
          VIRTUAL <span>ARCADE</span>
        </h1>
        <p className="tagline">{error ? 'Algo ha fallado' : 'Encendiendo las lámparas y colocando las mesas…'}</p>
        {error ? <p className="error-text">{error}</p> : <div className="loading-bar"><i /></div>}
      </div>
    </div>
  );
}
