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
import { Fade, WorldUI } from './world/WorldUI';
import { worldRef } from '../world/instance';
import { useWorldStore } from '../world/worldStore';
import { hockeyRef } from '../games/airhockey/instance';
import { AirHockeyUI } from './airhockey/AirHockeyUI';
import { useHockeyStore } from '../games/airhockey/store';
import { dartsRef } from '../games/darts/instance';
import { DartsUI } from './darts/DartsUI';

export function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const worldStageRef = useRef<HTMLDivElement>(null);
  const hockeyStageRef = useRef<HTMLDivElement>(null);
  const dartsStageRef = useRef<HTMLDivElement>(null);
  const screen = useGameStore((s) => s.screen);
  const place = useWorldStore((s) => s.place);
  const worldScreen = useWorldStore((s) => s.screen);

  useEffect(() => {
    let cancelled = false;
    const st = useGameStore.getState();
    (async () => {
      try {
        const [{ Game }, { World }, { AirHockey }, { Darts }] = await Promise.all([
          import('../game/Game'),
          useWorldStore.getState().style === 'pixel' ? import('../world/World') : import('../world3d/World'),
          import('../games/airhockey/AirHockey'),
          import('../games/darts/Darts'),
          initRapier(),
        ]);
        if (cancelled || !stageRef.current || !worldStageRef.current || !hockeyStageRef.current || !dartsStageRef.current || gameRef.current) return;
        gameRef.current = new Game(stageRef.current);
        worldRef.current = new World(worldStageRef.current);
        hockeyRef.current = new AirHockey(hockeyStageRef.current);
        dartsRef.current = new Darts(dartsStageRef.current);
        if (import.meta.env.DEV) Object.assign(window, { __world: worldRef.current, __game: gameRef.current, __hockey: hockeyRef.current, __darts: dartsRef.current, __stores: { game: useGameStore, world: useWorldStore, hockey: useHockeyStore } }); // for browser testing
        st.setScreen('menu');
        useWorldStore.getState().setScreen('title');
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
      <div id="stage" ref={stageRef} className={place === 'bowling' ? '' : 'hidden'} />
      <div id="world-stage" ref={worldStageRef} className={place === 'world' ? '' : 'hidden'} />
      <div id="hockey-stage" ref={hockeyStageRef} className={place === 'airhockey' ? '' : 'hidden'} />
      <div id="darts-stage" ref={dartsStageRef} className={place === 'darts' ? '' : 'hidden'} />
      {(screen === 'loading' || worldScreen === 'loading') && <LoadingScreen />}
      {place === 'world' && worldScreen !== 'loading' && <WorldUI />}
      {place === 'bowling' && (
        <>
          {(screen === 'playing' || screen === 'paused') && <Hud />}
          {screen === 'menu' && <MainMenu />}
          {screen === 'setup' && <SetupPanel />}
          {screen === 'paused' && <PausePanel />}
          {screen === 'end' && <EndPanel />}
        </>
      )}
      {place === 'airhockey' && <AirHockeyUI />}
      {place === 'darts' && <DartsUI />}
      <Fade />
    </>
  );
}
