import { describe, expect, test } from 'bun:test';

import { START_PTS, computePtsChange } from './pts';

describe('computePtsChange', () => {
  test('equal ratings: winner +16, loser -16', () => {
    const result = computePtsChange({
      ptsA: START_PTS,
      ptsB: START_PTS,
      outcome: 'a_win',
    });
    expect(result.deltaA).toBe(16);
    expect(result.deltaB).toBe(-16);
    expect(result.ptsAfterA).toBe(1516);
    expect(result.ptsAfterB).toBe(1484);
  });

  test('equal ratings draw: both +0', () => {
    const result = computePtsChange({
      ptsA: START_PTS,
      ptsB: START_PTS,
      outcome: 'draw',
    });
    expect(result.deltaA).toBe(0);
    expect(result.deltaB).toBe(0);
  });

  test('upset: underdog gains more than favorite would', () => {
    const underdogWins = computePtsChange({
      ptsA: 1300,
      ptsB: 1700,
      outcome: 'a_win',
    });
    const favoriteWins = computePtsChange({
      ptsA: 1300,
      ptsB: 1700,
      outcome: 'b_win',
    });
    expect(underdogWins.deltaA).toBeGreaterThan(favoriteWins.deltaB);
    expect(underdogWins.deltaA).toBe(32);
    expect(underdogWins.deltaB).toBe(-32);
    expect(favoriteWins.deltaA).toBe(-1);
    expect(favoriteWins.deltaB).toBe(1);
  });

  test('draw with rating gap: weaker gains small, stronger loses small', () => {
    const result = computePtsChange({
      ptsA: 1300,
      ptsB: 1700,
      outcome: 'draw',
    });
    expect(result.deltaA).toBeGreaterThan(0);
    expect(result.deltaB).toBeLessThan(0);
    expect(result.deltaA).toBe(16);
    expect(result.deltaB).toBe(-15);
  });

  test('floor at 0: loser clamped, winner keeps full gain', () => {
    const result = computePtsChange({
      ptsA: 10,
      ptsB: 10,
      outcome: 'a_win',
    });
    // Equal → raw ±16; loser 10 − 16 → 0, winner still +16.
    expect(result.deltaA).toBe(16);
    expect(result.ptsAfterA).toBe(26);
    expect(result.ptsAfterB).toBe(0);
    expect(result.deltaB).toBe(-10);
  });

  test('b_win mirrors a_win', () => {
    const aWin = computePtsChange({ ptsA: 1400, ptsB: 1600, outcome: 'a_win' });
    const bWin = computePtsChange({ ptsA: 1600, ptsB: 1400, outcome: 'b_win' });
    expect(bWin.deltaB).toBe(aWin.deltaA);
    expect(bWin.deltaA).toBe(aWin.deltaB);
  });
});
