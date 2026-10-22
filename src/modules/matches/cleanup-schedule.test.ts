import { describe, expect, test } from 'bun:test';
import { msUntilNextMoscowMidnight } from './cleanup-schedule';

describe('msUntilNextMoscowMidnight', () => {
  test('returns positive delay less than or equal to 24h', () => {
    const delay = msUntilNextMoscowMidnight(new Date());
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  test('near Moscow midnight returns a small delay', () => {
    // 2026-03-15 20:59:59 UTC = 2026-03-15 23:59:59 MSK
    const justBefore = new Date(Date.UTC(2026, 2, 15, 20, 59, 59, 0));
    const delay = msUntilNextMoscowMidnight(justBefore);
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(2000);
  });
});
