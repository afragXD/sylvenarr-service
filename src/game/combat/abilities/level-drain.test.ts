import { afterEach, describe, expect, spyOn, test } from 'bun:test';

import { applyAction, createBattleState } from '../engine';
import { hasEffect } from '../effects';
import type { HeroClassStats } from '../types';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 100,
  damage: 20,
  armor: 5,
  initiative: 40,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 15,
  mana: 10,
  gold: 100,
  size: 1,
  ...overrides,
});

describe('petrify and level drain', () => {
  let randomSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = undefined;
  });

  test('DemonLord slot 2 applies STUNNED so target skips turn', () => {
    randomSpy = spyOn(Math, 'random').mockReturnValue(0);
    const heroes = new Map([
      ['DemonLord', hero('DemonLord', { initiative: 99, damage: 30 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 2,
      targetId: 'p2',
    });
    expect(result.ok).toBe(true);
    const foe = state.units.find((unit) => unit.id === 'p2');
    expect(foe?.alive).toBe(true);
    expect(hasEffect(foe!, 'PETRIFIED')).toBe(true);
    // STUNNED длительностью 1 снимается при пропуске хода в том же applyAction.
    expect(state.log.some((line) => line.includes('оглушён и пропускает ход'))).toBe(true);
    expect(state.log.some((line) => line.includes('обращается в камень'))).toBe(true);
  });

  test('Paladin slot 3 transfers levels via levelUpUnit', () => {
    randomSpy = spyOn(Math, 'random').mockReturnValue(0);
    const heroes = new Map([
      ['Paladin', hero('Paladin', { initiative: 99, mana: 10 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Paladin', row: 1, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const paladin = state.units.find((unit) => unit.id === 'p1')!;
    const foe = state.units.find((unit) => unit.id === 'p2')!;
    paladin.lvl = 5;
    paladin.hiddenLvl = 5;
    foe.lvl = 8;
    foe.hiddenLvl = 8;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 3,
      targetId: 'p2',
    });
    expect(result.ok).toBe(true);
    const n = 1 + Math.floor(5 / 5);
    expect(paladin.lvl).toBe(5 + n);
    expect(foe.lvl).toBe(8 - n);
  });

  test('Witch slot 4 lowers target level', () => {
    randomSpy = spyOn(Math, 'random').mockReturnValue(0);
    const heroes = new Map([
      ['Witch', hero('Witch', { initiative: 99, mana: 10 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Witch', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const witch = state.units.find((unit) => unit.id === 'p1')!;
    const foe = state.units.find((unit) => unit.id === 'p2')!;
    witch.lvl = 6;
    witch.hiddenLvl = 6;
    foe.lvl = 5;
    foe.hiddenLvl = 5;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
      targetId: 'p2',
    });
    expect(result.ok).toBe(true);
    const n = Math.floor(6 / 6) + 1;
    expect(foe.lvl).toBe(5 - n);
  });
});
