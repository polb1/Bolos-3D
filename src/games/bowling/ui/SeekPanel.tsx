import { useNetStore } from '../../../net/client';
import { click, useEsc } from '../../../ui/common';
import { useGameStore } from '../store/useGameStore';

const back = () => useGameStore.getState().setScreen('menu');

/** Waiting for another bowler in the same online room. */
export function SeekPanel() {
  const status = useNetStore((s) => s.status);
  useEsc(back);
  return (
    <div className="screen">
      <div className="panel">
        <h2>Buscando rival…</h2>
        <p className="tagline">
          {status === 'online'
            ? 'La partida empieza en cuanto otra persona de tu sala pulse «Online · 1 contra 1» en la bolera. Tiráis por turnos, frame a frame.'
            : 'Sin conexión con la sala online. Prueba el torneo contra la IA mientras tanto.'}
        </p>
        <button className="btn ghost" onClick={click(back)} autoFocus>
          Cancelar
        </button>
      </div>
    </div>
  );
}
