import { describe, expect, test } from 'bun:test';

import { applyAction, createBattleState, resolveOutcome } from './engine';
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
  mana: 0,
  ...overrides,
});

describe('combat engine', () => {
  test('creates units and picks first actor', () => {
    const heroes = new Map([
      ['A', hero('A', { initiative: 50 })],
      ['B', hero('B', { initiative: 10 })],
    ]);
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    expect(state.units).toHaveLength(2);
    expect(state.activeUnitId).toBeTruthy();
    expect(state.outcome).toBe('ongoing');
  });

  test('attack can finish the battle', () => {
    const heroes = new Map([
      ['A', hero('A', { damage: 200, initiative: 99, accuracy: 100, luck: 0 })],
      ['B', hero('B', { health: 10, initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    // Force host unit active.
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'attack',
      targetId: 'p2',
    });
    expect(result.ok).toBe(true);
    expect(
      state.outcome === 'host_win' || state.units.find((u) => u.id === 'p2')?.alive === false
    ).toBe(true);
  });

  test('Knight skill can pierce back row', () => {
    const heroes = new Map([
      ['Knight', hero('Knight', { damage: 30, initiative: 99, accuracy: 100, luck: 0 })],
      ['B', hero('B', { health: 80, initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 1, pickOrder: 1 },
        { id: 'p3', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 2 },
      ],
      heroes,
    });
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'skill',
      targetId: 'p2',
    });
    expect(result.ok).toBe(true);
    const back = state.units.find((unit) => unit.id === 'p2');
    expect(back && back.health < back.maxHp).toBe(true);
  });

  test('resolveOutcome draw when both dead', () => {
    const heroes = new Map([['A', hero('A')]]);
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'A', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    for (const unit of state.units) {
      unit.alive = false;
      unit.health = 0;
    }
    resolveOutcome(state);
    expect(state.outcome).toBe('draw');
  });
});
