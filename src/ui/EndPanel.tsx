import { gameRef } from '../game/instance';
import { currentScore, gameStats } from '../scoring/scoring';
import { useGameStore } from '../store/useGameStore';
import { ScoreSheet } from './ScoreSheet';

export function EndPanel() {
  const players = useGameStore((s) => s.players);
  const newRecord = useGameStore((s) => s.newRecord);
  const scores = players.map((p) => currentScore(p.rolls));
  const best = Math.max(...scores);
  const winner = scores.indexOf(best);

  let title = 'Partida terminada';
  if (best === 300) title = '¡PARTIDA PERFECTA!';
  else if (players.length > 1) title = scores.every((s) => s === best) ? '¡Empate!' : `¡Gana ${players[winner].name}!`;
  else if (best >= 200) title = '¡Partidón!';

  const stats = gameStats(players[winner].rolls);
  return (
    <div className="screen">
      <div className="panel end-panel">
        <h2>{title}</h2>
        {newRecord && <div className="end-record">★ NUEVO RÉCORD ★</div>}
        <div className="end-score">{best}</div>
        <p className="stats-line">
          {stats.strikes} strikes · {stats.spares} spares · {stats.opens} frames abiertos
          {stats.fouls ? ` · ${stats.fouls} faltas` : ''}
        </p>
        <div className="end-sheets">
          {players.map((p, i) => (
            <ScoreSheet key={i} player={p} active={false} />
          ))}
        </div>
        <button className="btn primary" onClick={() => gameRef.current?.startMatch()} autoFocus>
          Jugar otra vez
        </button>
        <button className="btn ghost" onClick={() => gameRef.current?.quitToMenu()}>
          Menú principal
        </button>
      </div>
    </div>
  );
}
