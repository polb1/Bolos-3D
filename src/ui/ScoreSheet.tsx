import { FRAMES, currentScore, scoreFrames, turnState } from '../scoring/scoring';
import type { PlayerGame } from '../game/match';

const cls = (m: string) => (m === 'X' ? 'x' : m === '/' ? 's' : m === 'F' ? 'f' : '');

/** Classic ten-frame bowling sheet for one player. */
export function ScoreSheet({ player, active }: { player: PlayerGame; active: boolean }) {
  const frames = scoreFrames(player.rolls);
  const state = turnState(player.rolls);
  return (
    <div className="sheet" aria-label={`Marcador de ${player.name}`}>
      <div className="sheet-name">
        <i className={'turn' + (active ? '' : ' off')} />
        {player.name}
      </div>
      {frames.map((f, i) => {
        const tenth = i === FRAMES - 1;
        const boxes = tenth ? 3 : 2;
        // A strike in frames 1–9 is shown in the right-hand box, as on a real sheet.
        const marks = !tenth && f.marks[0] === 'X' ? ['', 'X'] : f.marks;
        return (
          <div key={i} className={'frame' + (tenth ? ' tenth' : '') + (active && !state.gameOver && state.frame === i ? ' current' : '')}>
            <div className="frame-no">{i + 1}</div>
            <div className="frame-marks">
              {Array.from({ length: boxes }, (_, b) => (
                <span key={b} className={cls(marks[b] ?? '')}>{marks[b] ?? ''}</span>
              ))}
            </div>
            <div className="frame-total">{f.total ?? ''}</div>
          </div>
        );
      })}
      <div className="sheet-total">
        <b>{currentScore(player.rolls)}</b>
        <small>TOTAL</small>
      </div>
    </div>
  );
}
