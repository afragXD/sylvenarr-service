import { describe, expect, test } from 'bun:test';

import { applyAction, createBattleState } from '../engine';
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
  accuracy: 100,
  power: 20,
  mana: 10,
  gold: 100,
  size: 1,
  ...overrides,
});

describe('phase 3.11 pilots', () => {
  test('Specter slot 1 opens second-mind prompt', () => {
    const heroes = new Map([
      ['Specter', hero('Specter', { initiative: 99, accuracy: 100 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Specter', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'p3', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 2 },
      ],
      heroes,
    });
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const first = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 1,
      targetId: 'p2',
    });
    expect(first.ok).toBe(true);
    expect(state.pendingPrompt?.kind).toBe('specter_second_mind');
    const second = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      choice: 'p3',
    });
    expect(second.ok).toBe(true);
    expect(state.pendingPrompt).toBeNull();
  });

  test('Detective slot 3 spends ulta and grants INVISIBLE', () => {
    const heroes = new Map([
      ['Detective', hero('Detective', { initiative: 99 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Detective', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const det = state.units.find((unit) => unit.id === 'p1')!;
    expect(det.ultaCharges).toBe(2);
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 3,
    });
    expect(result.ok).toBe(true);
    expect(det.ultaCharges).toBe(1);
    expect(det.effects.some((effect) => effect.id === 'INVISIBLE')).toBe(true);
  });

  test('GhostWarrior slot 1 hits harder with team graveyard', () => {
    const heroes = new Map([
      ['GhostWarrior', hero('GhostWarrior', { initiative: 99, luck: 0, damage: 30, accuracy: 100 })],
      ['B', hero('B', { initiative: 1, armor: 0, health: 400 })],
    ]);
    const mk = (graves: number) => {
      const state = createBattleState({
        matchId: 'm',
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'GhostWarrior', row: 0, pickOrder: 1 },
          { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes,
      });
      for (let i = 0; i < graves; i += 1) {
        state.graveyard.push({
          unitId: `dead-${i}`,
          team: 0,
          heroClassCode: 'Ally',
          displayName: 'Ally',
          forbiddenResurrect: false,
        });
      }
      const foe = state.units.find((unit) => unit.id === 'p2')!;
      foe.health = 400;
      state.activeUnitId = 'p1';
      state.turnPlayerId = 'h';
      applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        slot: 1,
        targetId: 'p2',
      });
      return 400 - (state.units.find((unit) => unit.id === 'p2')?.health ?? 400);
    };
    let empty = 0;
    let full = 0;
    for (let i = 0; i < 25; i += 1) {
      empty += mk(0);
      full += mk(2);
    }
    expect(full).toBeGreaterThan(empty);
  });
});
