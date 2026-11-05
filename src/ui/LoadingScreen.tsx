import { useGameStore } from '../store/useGameStore';

export function LoadingScreen() {
  const error = useGameStore((s) => s.loadError);
  return (
    <div className="screen">
      <div className="panel">
        <h1 className="game-title">
          BOLERA <span>3D</span>
        </h1>
        <p className="tagline">{error ? 'Algo ha fallado' : 'Encerando la pista y colocando los bolos…'}</p>
        {error ? <p className="error-text">{error}</p> : <div className="loading-bar"><i /></div>}
      </div>
    </div>
  );
}
