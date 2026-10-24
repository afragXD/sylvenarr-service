import { describe, expect, test } from 'bun:test';

import { applyAction, createBattleState, toBattleSummary } from '../engine';
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
  accuracy: 95,
  power: 15,
  mana: 10,
  gold: 100,
  size: 1,
  ...overrides,
});

describe('phase 3.8 pilots', () => {
  test('Abbess slot 4 clears effects on ally row', () => {
    const heroes = new Map([
      ['Abbess', hero('Abbess', { initiative: 99, mana: 10 })],
      ['Ally', hero('Ally', { initiative: 1 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Abbess', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'p3', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const abbess = state.units.find((unit) => unit.id === 'p1')!;
    const ally = state.units.find((unit) => unit.id === 'p2')!;
    grantEffect(abbess, 'POISON', 3, 3);
    grantEffect(ally, 'POISON', 3, 3);
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
    expect(abbess.effects.some((effect) => effect.id === 'POISON')).toBe(false);
    expect(ally.effects.some((effect) => effect.id === 'POISON')).toBe(false);
  });

  test('Witch slot 1 spends a gun round', () => {
    const heroes = new Map([
      ['Witch', hero('Witch', { initiative: 99, accuracy: 100, luck: 0 })],
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
    expect(witch.gun).toBe(4);
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const before = witch.gun;
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 1,
      targetId: 'p2',
    });
    expect(result.ok).toBe(true);
    expect(witch.gun).toBeLessThan(before);
    expect(witch.gun).toBeGreaterThanOrEqual(before - 2);
  });

  test('Inquisitor slot 3 can move enemy row', () => {
    let moved = false;
    for (let attempt = 0; attempt < 40 && !moved; attempt += 1) {
      const heroes = new Map([
        ['Inquisitor', hero('Inquisitor', { initiative: 99, mana: 10 })],
        ['B', hero('B', { initiative: 1 })],
      ]);
      const state = createBattleState({
        matchId: 'm',
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Inquisitor', row: 0, pickOrder: 1 },
          { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes,
      });
      state.activeUnitId = 'p1';
      state.turnPlayerId = 'h';
      const foe = state.units.find((unit) => unit.id === 'p2')!;
      const before = foe.row;
      const result = applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        slot: 3,
        targetId: 'p2',
      });
      expect(result.ok).toBe(true);
      if (foe.row !== before) {
        moved = true;
      }
    }
    expect(moved).toBe(true);
  });

  test('Inquisitor summary exposes five abilities', () => {
    const heroes = new Map([
      ['Inquisitor', hero('Inquisitor', { initiative: 99, mana: 10 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Inquisitor', row: 1, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const summary = toBattleSummary(state);
    expect(summary.abilities).toHaveLength(5);
  });

  test('Inquisitor slot 2 sets tortureLightningCd 2', () => {
    const heroes = new Map([
      ['Inquisitor', hero('Inquisitor', { initiative: 99, mana: 10, power: 30, luck: 0 })],
      ['B', hero('B', { initiative: 1, armor: 0, dodge: 0 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Inquisitor', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const mage = state.units.find((unit) => unit.id === 'p1')!;
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
    expect(mage.tortureLightningCd).toBe(2);
    const blocked = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 2,
      targetId: 'p2',
    });
    expect(blocked.ok).toBe(false);
  });
});
