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
  test('matches summoner level and grown stats', () => {
    const heroes = new Map([
      ['Archlich', hero('Archlich')],
      ['B', hero('B')],
      ['Zombie', hero('Zombie', { health: 50, damage: 10 })],
    ]);
    const state = createBattleState({
      matchId: 'm-lvl',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Archlich', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const lich = state.units.find((unit) => unit.id === 'p1');
    if (!lich) {
      throw new Error('missing lich');
    }
    lich.lvl = 7;
    lich.hiddenLvl = 7;
    lich.maxSummons = 2;
    const zombie = createSummon(state, {
      summoner: lich,
      heroCode: 'Zombie',
      row: 0,
      isLichSummon: true,
    });
    expect(zombie).toBeTruthy();
    expect(zombie!.lvl).toBe(7);
    expect(zombie!.hiddenLvl).toBe(7);
    // Zombie growth: +4 dmg за каждый levelup × 6
    expect(zombie!.damage).toBe(10 + 4 * 6);
    expect(zombie!.health).toBe(zombie!.maxHp);
  });

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

  test('replaceUnitId removes old unit instead of leaving a corpse', () => {
    const heroes = new Map([
      ['Archlich', hero('Archlich')],
      ['B', hero('B')],
      ['Zombie', hero('Zombie', { health: 40 })],
      ['SkeletonChampion', hero('SkeletonChampion', { health: 80 })],
    ]);
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Archlich', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const lich = state.units.find((unit) => unit.id === 'p1');
    if (!lich) {
      throw new Error('missing lich');
    }
    lich.maxSummons = 2;
    const zombie = createSummon(state, {
      summoner: lich,
      heroCode: 'Zombie',
      row: 0,
      column: 1,
      isLichSummon: true,
    });
    expect(zombie).toBeTruthy();
    const zombieId = zombie!.id;
    state.doneIds.push(zombieId);

    const skeleton = createSummon(state, {
      summoner: lich,
      heroCode: 'SkeletonChampion',
      row: 0,
      column: 1,
      isLichSummon: true,
      replaceUnitId: zombieId,
    });
    expect(skeleton).toBeTruthy();
    expect(state.units.some((unit) => unit.id === zombieId)).toBe(false);
    expect(state.doneIds.includes(zombieId)).toBe(false);
    expect(skeleton!.alive).toBe(true);
    expect(skeleton!.heroClassCode).toBe('SkeletonChampion');
  });
});
