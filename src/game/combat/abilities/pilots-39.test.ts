import { describe, expect, test } from 'bun:test';

import { applyAction, createBattleState, listAttackTargets } from '../engine';
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
  power: 15,
  mana: 10,
  gold: 100,
  size: 1,
  ...overrides,
});

describe('phase 3.9 pilots', () => {
  test('Marauder slot 1 deals more vs MARKED', () => {
    const heroes = new Map([
      ['Marauder', hero('Marauder', { initiative: 99, luck: 0, damage: 30 })],
      ['B', hero('B', { initiative: 1, armor: 0 })],
      ['Werewolf', hero('Werewolf', { initiative: 50, damage: 25 })],
    ]);
    const mk = (marked: boolean) => {
      const state = createBattleState({
        matchId: 'm',
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Marauder', row: 1, pickOrder: 1 },
          { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes,
      });
      const foe = state.units.find((unit) => unit.id === 'p2')!;
      if (marked) {
        grantEffect(foe, 'MARKED', 2, 0);
      }
      foe.health = 200;
      state.activeUnitId = 'p1';
      state.turnPlayerId = 'h';
      applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        slot: 1,
        targetId: 'p2',
      });
      return 200 - (state.units.find((unit) => unit.id === 'p2')?.health ?? 200);
    };
    let markedDmg = 0;
    let plainDmg = 0;
    for (let i = 0; i < 25; i += 1) {
      markedDmg += mk(true);
      plainDmg += mk(false);
    }
    expect(markedDmg).toBeGreaterThan(plainDmg);
  });

  test('Herbalist slot 3 clears POISON', () => {
    const heroes = new Map([
      ['Herbalist', hero('Herbalist', { initiative: 99 })],
      ['Ally', hero('Ally', { initiative: 1 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Herbalist', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'p3', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const ally = state.units.find((unit) => unit.id === 'p2')!;
    grantEffect(ally, 'POISON', 3, 3);
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
    expect(ally.effects.some((effect) => effect.id === 'POISON')).toBe(false);
  });

  test('Patriarch SANCTUM hides ally from attack targets', () => {
    const heroes = new Map([
      ['Patriarch', hero('Patriarch', { initiative: 99, mana: 10 })],
      ['Ally', hero('Ally', { initiative: 1 })],
      ['B', hero('B', { initiative: 50, accuracy: 100 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Patriarch', row: 1, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'p3', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
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
    const attacker = state.units.find((unit) => unit.id === 'p3')!;
    const targets = listAttackTargets(state, attacker).map((unit) => unit.id);
    expect(targets).not.toContain('p2');
  });
});
