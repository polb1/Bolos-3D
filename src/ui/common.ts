import { useEffect } from 'react';
import { audio } from '../audio/AudioEngine';

/** Wraps a button handler: wakes the audio (browsers need a gesture) and plays the UI click. */
export const click = (fn: () => void) => () => {
  audio.unlock();
  audio.ui();
  fn();
};

/** Runs `fn` when Escape is pressed while the calling component is mounted. */
export function useEsc(fn: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.code === 'Escape' && fn();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fn]);
}
