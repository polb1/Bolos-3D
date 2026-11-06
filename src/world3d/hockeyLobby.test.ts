import { describe, expect, it } from 'vitest';
import { HOCKEY_TABLES, SPOTS, spotAt } from './activities';

describe('online air hockey circles', () => {
  it('has a blue and a red circle at the ends of every table', () => {
    expect(SPOTS).toHaveLength(HOCKEY_TABLES.length * 2);
    for (const [i, t] of HOCKEY_TABLES.entries()) {
      expect(spotAt(t.x - 1.65, t.z)).toMatchObject({ table: i, side: 'blue' });
      expect(spotAt(t.x + 1.65, t.z)).toMatchObject({ table: i, side: 'red' });
    }
    expect(spotAt(HOCKEY_TABLES[0].x, HOCKEY_TABLES[0].z)).toBeNull(); // on the table itself
  });

  it('keeps the circles inside the hall (wall at x = 16)', () => {
    for (const s of SPOTS) expect(s.x + 0.55).toBeLessThan(16 - 0.3);
  });
});
