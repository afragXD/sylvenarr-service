import { describe, expect, test } from 'bun:test';

import { applyAction, createBattleState, toBattleSummary } from '../engine';
import type { HeroClassStats } from '../types';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 100,
  damage: 20,
  armor: 5,
  initiative: 40,
  dodge: 5,
  luck: 5,
  accuracy: 95,
  power: 15,
  mana: 10,
  gold: 100,
  size: 1,
  ...overrides,
});

describe('phase 3.7 pilots', () => {
  test('DemonLord slot 1 hits whole enemy row', () => {
    const heroes = new Map([
      ['DemonLord', hero('DemonLord', { initiative: 99, accuracy: 100, luck: 0 })],
      ['B', hero('B', { initiative: 1, health: 80 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'p3', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 2 },
      ],
      heroes,
    });
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const before = state.units
      .filter((unit) => unit.team === 1)
      .map((unit) => unit.health);
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 1,
      targetId: 'p2',
    });
    expect(result.ok).toBe(true);
    const after = state.units.filter((unit) => unit.team === 1);
    expect(after.some((unit, i) => unit.health < (before[i] ?? 0))).toBe(true);
  });

  test('Assassin dart applies poison', () => {
    const heroes = new Map([
      ['Assassin', hero('Assassin', { initiative: 99 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Assassin', row: 0, pickOrder: 1 },
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
      slot: 4,
      targetId: 'p2',
    });
    expect(result.ok).toBe(true);
    const foe = state.units.find((unit) => unit.id === 'p2');
    expect(foe?.effects.some((effect) => effect.id === 'POISON')).toBe(true);
  });

  test('Paladin summary exposes five abilities', () => {
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
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const summary = toBattleSummary(state);
    expect(summary.abilities).toHaveLength(5);
    expect(summary.units[0]?.effects).toBeDefined();
  });
});
