import { useGameStore } from '../games/bowling/store/useGameStore';

export function MuteButton() {
  const muted = useGameStore((s) => s.muted);
  const toggle = useGameStore((s) => s.toggleMute);
  return (
    <button className="icon-btn" onClick={toggle} title="Sonido (M)" aria-label={muted ? 'Activar sonido' : 'Silenciar'}>
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
