import { describe, expect, test } from 'bun:test';

import { createBattleState } from '../engine';
import type { HeroClassStats } from '../types';
import { createSummon } from './summon';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 100,
  damage: 20,
  armor: 5,
  initiative: 30,
  dodge: 10,
  luck: 5,
  accuracy: 90,
  power: 15,
  mana: 10,
  gold: 200,
  size: 1,
  ...overrides,
});

describe('createSummon', () => {
  test('respects maxSummons of owner', () => {
    const heroes = new Map([
      ['OrcKing', hero('OrcKing')],
      ['B', hero('B')],
      ['GoblinShaman', hero('GoblinShaman', { health: 40 })],
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
    if (!orc) {
      throw new Error('missing orc');
    }
    orc.maxSummons = 1;
    const first = createSummon(state, {
      summoner: orc,
      heroCode: 'GoblinShaman',
      row: 1,
    });
    expect(first).toBeTruthy();
    const second = createSummon(state, {
      summoner: orc,
      heroCode: 'GoblinShaman',
      row: 1,
    });
    expect(second).toBeNull();
  });
});
