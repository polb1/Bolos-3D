import { useState } from 'react';
import { gameRef } from '../game/instance';
import { useGameStore } from '../store/useGameStore';

/** Press-and-hold wrist-spin button; throwing itself is done by dragging the ball. */
function SpinButton({ dir, label, aria }: { dir: number; label: string; aria: string }) {
  const [down, setDown] = useState(false);
  const set = (v: boolean) => {
    setDown(v);
    gameRef.current?.setTouchSpin(v ? dir : 0);
  };
  return (
    <button
      className={'touch-btn' + (down ? ' pressed' : '')}
      aria-label={aria}
      onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), set(true))}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

export function TouchControls() {
  const aiTurn = useGameStore((s) => s.players[s.current]?.ai !== undefined);
  if (aiTurn) return null;
  return (
    <div id="touch-controls">
      <div className="touch-pad">
        <SpinButton dir={-1} label="↩" aria="Efecto a la izquierda" />
        <span className="lbl">EFECTO</span>
        <SpinButton dir={1} label="↪" aria="Efecto a la derecha" />
      </div>
    </div>
  );
}
