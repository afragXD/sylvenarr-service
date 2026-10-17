import { describe, expect, test } from 'bun:test';

import { createBattleState } from '../engine';
import type { HeroClassStats } from '../types';
import { runPreChoice } from './registry';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 100,
  damage: 20,
  armor: 5,
  initiative: 30,
  dodge: 10,
  luck: -20,
  accuracy: 90,
  power: 15,
  mana: 0,
  gold: 100,
  size: 1,
  ...overrides,
});

describe('OrcKing preChoice', () => {
  test('cursed aura drains enemy luck when orc luck is low', () => {
    const heroes = new Map([
      ['OrcKing', hero('OrcKing', { luck: -20 })],
      ['B', hero('B', { luck: 20 })],
    ]);
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'OrcKing', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const orc = state.units.find((unit) => unit.id === 'p1');
    const foe = state.units.find((unit) => unit.id === 'p2');
    if (!orc || !foe) {
      throw new Error('missing units');
    }
    const before = foe.luck;
    runPreChoice(state, orc);
    expect(foe.luck).toBeLessThan(before);
  });
});
