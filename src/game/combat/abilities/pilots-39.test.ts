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

  test('Herbalist slot 3 clears POISON on target and self', () => {
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
    const herbalist = state.units.find((unit) => unit.id === 'p1')!;
    const ally = state.units.find((unit) => unit.id === 'p2')!;
    grantEffect(ally, 'POISON', 3, 3);
    grantEffect(herbalist, 'BURNING', 2, 2);
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
    expect(herbalist.effects.some((effect) => effect.id === 'BURNING')).toBe(false);
  });

  test('Herbalist slot 2 STRENGTH is 25% for 1 round', () => {
    const heroes = new Map([
      ['Herbalist', hero('Herbalist', { initiative: 99, mana: 5, damage: 20 })],
      ['Ally', hero('Ally', { initiative: 1, damage: 40 })],
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
    const before = ally.damage;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 2,
    });
    expect(result.ok).toBe(true);
    const strength = ally.effects.find((effect) => effect.id === 'STRENGTH');
    expect(strength?.rounds).toBe(1);
    expect(strength?.power).toBe(Math.max(1, Math.round(before * 0.25)));
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

  test('GUARDED: метка без брони, блокирует атаку, детектив пробивает', () => {
    const heroes = new Map([
      ['Knight', hero('Knight', { initiative: 99, gold: 200 })],
      ['Ally', hero('Ally', { initiative: 1, armor: 10 })],
      ['B', hero('B', { initiative: 50, damage: 25, accuracy: 100 })],
      ['Detective', hero('Detective', { initiative: 40, damage: 20, accuracy: 100 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'p3', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'p4', playerId: 'g', heroClassCode: 'Detective', row: 0, pickOrder: 2 },
      ],
      heroes,
    });
    const ally = state.units.find((unit) => unit.id === 'p2')!;
    const armorBefore = ally.armor;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const guard = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
      targetId: 'p2',
    });
    expect(guard.ok).toBe(true);
    expect(ally.effects.some((effect) => effect.id === 'GUARDED')).toBe(true);
    expect(ally.armor).toBe(armorBefore);

    const foe = state.units.find((unit) => unit.id === 'p3')!;
    expect(listAttackTargets(state, foe).map((unit) => unit.id)).not.toContain('p2');

    const detective = state.units.find((unit) => unit.id === 'p4')!;
    state.activeUnitId = 'p4';
    state.turnPlayerId = 'g';
    const hpBefore = ally.health;
    const stab = applyAction(state, {
      playerId: 'g',
      unitId: 'p4',
      action: 'ability',
      slot: 1,
      targetId: 'p2',
    });
    expect(stab.ok).toBe(true);
    expect(ally.health).toBeLessThan(hpBefore);
    expect(detective.alive).toBe(true);
  });
});
