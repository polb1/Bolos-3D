import { LADDER } from '../game/ai';
import { gameRef } from '../game/instance';
import { currentScore, gameStats } from '../scoring/scoring';
import { useGameStore } from '../store/useGameStore';
import { ScoreSheet } from './ScoreSheet';

export function EndPanel() {
  const players = useGameStore((s) => s.players);
  const newRecord = useGameStore((s) => s.newRecord);
  const earned = useGameStore((s) => s.earned);
  const coins = useGameStore((s) => s.coins);
  const ladder = useGameStore((s) => s.ladder);
  const ladderResult = useGameStore((s) => s.ladderResult);
  const next = (round: number) => (useGameStore.getState().setLadder(round), gameRef.current?.startMatch());
  const scores = players.map((p) => currentScore(p.rolls));
  const best = Math.max(...scores);
  const winner = scores.indexOf(best);

  let title = 'Partida terminada';
  if (best === 300) title = '¡PARTIDA PERFECTA!';
  else if (players.length > 1) title = scores.every((s) => s === best) ? '¡Empate!' : `¡Gana ${players[winner].name}!`;
  else if (best >= 200) title = '¡Partidón!';

  if (ladderResult === 'champion') title = '🏆 ¡CAMPEÓN DEL TORNEO!';
  else if (ladderResult === 'win') title = `¡Eliminas a ${players[1].name}!`;
  else if (ladderResult === 'lose') title = `Eliminado por ${players[1].name}`;

  // In a match against the AI, the line under the score is always about you.
  const stats = gameStats(players[ladder !== null ? 0 : winner].rolls);
  return (
    <div className="screen">
      <div className="panel end-panel">
        <h2>{title}</h2>
        {newRecord && <div className="end-record">★ NUEVO RÉCORD ★</div>}
        <div className="end-score">{best}</div>
        <p className="stats-line">
          {earned ? `+${earned} 🪙 ganadas` : 'Supera 100 puntos para ganar monedas'} · tienes {coins} 🪙
        </p>
        <p className="stats-line">
          {stats.strikes} strikes · {stats.spares} spares · {stats.opens} frames abiertos
          {stats.fouls ? ` · ${stats.fouls} faltas` : ''}
        </p>
        <div className="end-sheets">
          {players.map((p, i) => (
            <ScoreSheet key={i} player={p} active={false} />
          ))}
        </div>
        {ladder !== null && (
          <p className="stats-line">
            {LADDER.map((r, i) => (
              <span key={i} className="summary-chip" style={{ opacity: i < ladder || (i === ladder && ladderResult !== 'lose') ? 0.5 : 1 }}>
                #{3 - i} {r.name} · media {r.average}
                {i < ladder || (i === ladder && ladderResult !== 'lose') ? ' ✓' : ''}
              </span>
            ))}
          </p>
        )}
        {ladderResult === 'win' ? (
          <button className="btn primary" onClick={() => next(ladder! + 1)} autoFocus>
            Siguiente ronda: vs {LADDER[ladder! + 1].name}
          </button>
        ) : ladder !== null ? (
          <button className="btn primary" onClick={() => next(0)} autoFocus>
            Nuevo torneo
          </button>
        ) : (
          <button className="btn primary" onClick={() => gameRef.current?.startMatch()} autoFocus>
            Jugar otra vez
          </button>
        )}
        <button className="btn ghost" onClick={() => gameRef.current?.quitToMenu()}>
          Menú principal
        </button>
      </div>
    </div>
  );
}
