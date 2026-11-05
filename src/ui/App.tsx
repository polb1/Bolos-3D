import { useEffect, useRef } from 'react';
import { audio } from '../audio/AudioEngine';
import { gameRef } from '../game/instance';
import { initRapier } from '../physics/PhysicsWorld';
import { useGameStore } from '../store/useGameStore';
import { EndPanel } from './EndPanel';
import { Hud } from './Hud';
import { LoadingScreen } from './LoadingScreen';
import { MainMenu } from './MainMenu';
import { PausePanel } from './PausePanel';
import { SetupPanel } from './SetupPanel';

export function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const screen = useGameStore((s) => s.screen);

  useEffect(() => {
    let cancelled = false;
    const st = useGameStore.getState();
    (async () => {
      try {
        const [{ Game }] = await Promise.all([import('../game/Game'), initRapier()]);
        if (cancelled || !stageRef.current || gameRef.current) return;
        gameRef.current = new Game(stageRef.current);
        st.setScreen('menu');
      } catch (e) {
        console.error(e);
        st.setLoadError(
          e instanceof Error && /WebGL/i.test(e.message)
            ? 'Tu navegador no puede crear un contexto WebGL. Activa la aceleración por hardware o prueba otro navegador.'
            : 'No se pudo iniciar el simulador. Recarga la página.',
        );
      }
    })();
    const touch = matchMedia('(hover: none) and (pointer: coarse)').matches || 'ontouchstart' in window;
    document.body.classList.toggle('touch-active', touch);
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  return (
    <>
      <div id="stage" ref={stageRef} />
      {(screen === 'playing' || screen === 'paused') && <Hud />}
      {screen === 'loading' && <LoadingScreen />}
      {screen === 'menu' && <MainMenu />}
      {screen === 'setup' && <SetupPanel />}
      {screen === 'paused' && <PausePanel />}
      {screen === 'end' && <EndPanel />}
    </>
  );
}
