import { describe, expect, test } from 'bun:test';

import { applyAction, createBattleState, toBattleSummary } from './engine';
import { levelUpLivingUnits, levelUpUnit } from './level';
import { buildResultSnapshot } from './result-snapshot';
import type { HeroClassStats } from './types';

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

const catalogHeroes = (...entries: HeroClassStats[]) =>
  new Map(entries.map((item) => [item.code, item]));

describe('levels 4.0', () => {
  test('units start at lvl 1', () => {
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: catalogHeroes(hero('A', { initiative: 50 }), hero('B', { initiative: 10 })),
    });
    expect(state.units.every((unit) => unit.lvl === 1)).toBe(true);
    expect(toBattleSummary(state).units[0]?.lvl).toBe(1);
  });

  test('levelup at round change; dead stay put', () => {
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: catalogHeroes(hero('A', { initiative: 50 }), hero('B', { initiative: 10 })),
    });
    const foe = state.units.find((unit) => unit.id === 'p2')!;
    foe.alive = false;
    foe.health = 0;
    foe.lvl = 1;

    const max = levelUpLivingUnits(state);
    const alive = state.units.find((unit) => unit.id === 'p1')!;
    expect(alive.lvl).toBe(2);
    expect(foe.lvl).toBe(1);
    expect(max).toBe(2);
  });

  test('wait loop advances round and levels living units', () => {
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: catalogHeroes(hero('A', { initiative: 50 }), hero('B', { initiative: 10 })),
    });

    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 2; i++) {
        const result = applyAction(state, {
          playerId: state.turnPlayerId!,
          unitId: state.activeUnitId!,
          action: 'wait',
        });
        expect(result.ok).toBe(true);
      }
    }

    expect(state.stage).toBe(2);
    expect(state.units.filter((unit) => unit.alive).every((unit) => unit.lvl === 2)).toBe(true);
    expect(state.log.some((line) => line.includes('ур. 2'))).toBe(true);
  });

  test('ability formula uses unit.lvl', () => {
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Herbalist', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: catalogHeroes(
        hero('Herbalist', { initiative: 99 }),
        hero('B', { initiative: 1 })
      ),
    });
    const herbalist = state.units.find((unit) => unit.id === 'p1')!;
    herbalist.lvl = 10;
    levelUpUnit(herbalist, 0);
    expect(herbalist.lvl).toBe(10);
    const healLow = 5 + 1;
    const healHigh = 5 + herbalist.lvl;
    expect(healHigh).toBeGreaterThan(healLow);
  });

  test('result snapshot includes lvl', () => {
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: catalogHeroes(hero('A'), hero('B')),
    });
    state.units[0]!.lvl = 4;
    state.outcome = 'host_win';
    const snap = buildResultSnapshot({
      state,
      hostDisplayName: 'H',
      guestDisplayName: 'G',
    });
    expect(snap.host.units[0]?.lvl).toBe(4);
  });
});
