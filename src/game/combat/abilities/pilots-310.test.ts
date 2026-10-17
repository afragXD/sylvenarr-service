import { describe, expect, test } from 'bun:test';

import { applyAction, createBattleState } from '../engine';
import { grantEffect } from '../effects';
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
  mana: 15,
  gold: 100,
  size: 1,
  ...overrides,
});

describe('phase 3.10 pilots', () => {
  test('Oracle slot 2 clears ally from doneIds on success', () => {
    let cleared = false;
    for (let attempt = 0; attempt < 40 && !cleared; attempt += 1) {
      const heroes = new Map([
        ['Oracle', hero('Oracle', { initiative: 99, mana: 15 })],
        ['Ally', hero('Ally', { initiative: 1 })],
        ['B', hero('B', { initiative: 1 })],
      ]);
      const state = createBattleState({
        matchId: 'm',
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Oracle', row: 0, pickOrder: 1 },
          { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
          { id: 'p3', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes,
      });
      state.doneIds = ['p2'];
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
      if (!state.doneIds.includes('p2')) {
        cleared = true;
      }
    }
    expect(cleared).toBe(true);
  });

  test('Demiurge slot 1 chains to at least two enemies', () => {
    const heroes = new Map([
      ['Demiurge', hero('Demiurge', { initiative: 99, mana: 15, power: 40, luck: 0 })],
      ['B', hero('B', { initiative: 1, armor: 0, health: 200 })],
      ['Ectoplasm', hero('Ectoplasm', { health: 40 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Demiurge', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'p3', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 2 },
        { id: 'p4', playerId: 'g', heroClassCode: 'B', row: 1, pickOrder: 3 },
      ],
      heroes,
    });
    for (const unit of state.units.filter((u) => u.team === 1)) {
      unit.health = 200;
    }
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
    const hitCount = after.filter((unit, i) => unit.health < (before[i] ?? 0)).length;
    expect(hitCount).toBeGreaterThanOrEqual(2);
  });

  test('Pyro slot 2 deals more vs BURNING', () => {
    const heroes = new Map([
      ['Pyro', hero('Pyro', { initiative: 99, luck: 0, damage: 25, accuracy: 100 })],
      ['B', hero('B', { initiative: 1, armor: 0, health: 300 })],
    ]);
    const mk = (burning: boolean) => {
      const state = createBattleState({
        matchId: 'm',
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Pyro', row: 1, pickOrder: 1 },
          { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes,
      });
      const foe = state.units.find((unit) => unit.id === 'p2')!;
      foe.health = 300;
      if (burning) {
        grantEffect(foe, 'BURNING', 2, 3);
      }
      state.activeUnitId = 'p1';
      state.turnPlayerId = 'h';
      applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        slot: 2,
        targetId: 'p2',
      });
      return 300 - (state.units.find((unit) => unit.id === 'p2')?.health ?? 300);
    };
    let burnDmg = 0;
    let plainDmg = 0;
    for (let i = 0; i < 30; i += 1) {
      burnDmg += mk(true);
      plainDmg += mk(false);
    }
    expect(burnDmg).toBeGreaterThan(plainDmg);
  });
});
