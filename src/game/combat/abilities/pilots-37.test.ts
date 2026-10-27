import { describe, expect, test } from 'bun:test';

import { grantEffect } from '../effects';
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
      ['B', hero('B', { initiative: 1, health: 200 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'p3', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 2 },
        { id: 'p4', playerId: 'g', heroClassCode: 'B', row: 1, pickOrder: 3 },
      ],
      heroes,
    });
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const frontA = state.units.find((unit) => unit.id === 'p2')!;
    const frontB = state.units.find((unit) => unit.id === 'p3')!;
    const back = state.units.find((unit) => unit.id === 'p4')!;
    grantEffect(frontB, 'GUARDED', 2, 0);
    const beforeA = frontA.health;
    const beforeB = frontB.health;
    const beforeBack = back.health;
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 1,
      targetId: 'p2',
    });
    expect(result.ok).toBe(true);
    expect(frontA.health).toBeLessThan(beforeA);
    expect(frontB.health).toBeLessThan(beforeB);
    expect(back.health).toBe(beforeBack);
  });

  test('DemonLord slot 1 hits all 3 Assassins on the back row', () => {
    const heroes = new Map([
      ['DemonLord', hero('DemonLord', { initiative: 99, accuracy: 100, luck: 0, damage: 40 })],
      ['Assassin', hero('Assassin', { initiative: 1, health: 200, dodge: 0 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 'a1', playerId: 'g', heroClassCode: 'Assassin', row: 1, pickOrder: 1 },
        { id: 'a2', playerId: 'g', heroClassCode: 'Assassin', row: 1, pickOrder: 2 },
        { id: 'a3', playerId: 'g', heroClassCode: 'Assassin', row: 1, pickOrder: 3 },
      ],
      heroes,
    });
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const assassins = ['a1', 'a2', 'a3'].map(
      (id) => state.units.find((unit) => unit.id === id)!
    );
    const before = assassins.map((unit) => unit.health);
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 1,
      targetId: 'a2',
    });
    expect(result.ok).toBe(true);
    for (let i = 0; i < assassins.length; i += 1) {
      expect(assassins[i]!.health).toBeLessThan(before[i]!);
    }
    const hitLines = state.log.filter((line) => line.includes('трёхглавый удар'));
    expect(hitLines.length).toBe(3);
  });

  test('DemonLord slot 4 grants FIRESHIELD, HASTE and burns attacker', () => {
    const heroes = new Map([
      ['DemonLord', hero('DemonLord', { initiative: 30, mana: 5 })],
      ['Ally', hero('Ally', { initiative: 1 })],
      ['B', hero('B', { initiative: 99, damage: 40, armor: 10, accuracy: 100, luck: 0 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'p3', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const demon = state.units.find((unit) => unit.id === 'p1')!;
    const ally = state.units.find((unit) => unit.id === 'p2')!;
    const foe = state.units.find((unit) => unit.id === 'p3')!;
    const initBefore = demon.initiative;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const cast = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
      targetId: 'p2',
    });
    expect(cast.ok).toBe(true);
    expect(demon.effects.some((effect) => effect.id === 'FIRESHIELD')).toBe(true);
    expect(demon.effects.some((effect) => effect.id === 'GUARDED')).toBe(false);
    expect(demon.effects.some((effect) => effect.id === 'HASTE')).toBe(true);
    expect(demon.initiative).toBe(initBefore + 15);
    expect(ally.effects.some((effect) => effect.id === 'REGENHP')).toBe(true);

    const armorBefore = foe.armor;
    const hpBefore = foe.health;
    state.activeUnitId = 'p3';
    state.turnPlayerId = 'g';
    const hit = applyAction(state, {
      playerId: 'g',
      unitId: 'p3',
      action: 'attack',
      targetId: 'p1',
    });
    expect(hit.ok).toBe(true);
    expect(foe.health).toBeLessThan(hpBefore);
    expect(foe.armor).toBe(armorBefore - demon.lvl);
    expect(state.log.some((line) => line.includes('Огненный щит'))).toBe(true);
  });

  test('Assassin slot 2 polymorphs into target and gains a level', () => {
    const heroes = new Map([
      ['Assassin', hero('Assassin', { initiative: 99, damage: 28 })],
      ['Paladin', hero('Paladin', { initiative: 1, health: 200, damage: 16, armor: 15 })],
      ['DemonLord', hero('DemonLord', { initiative: 1, health: 300, size: 2 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Assassin', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Paladin', row: 0, pickOrder: 2 },
        { id: 'p3', playerId: 'g', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const assassin = state.units.find((unit) => unit.id === 'p1')!;
    const beforeLvl = assassin.lvl;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';

    const giantBlocked = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 2,
      targetId: 'p3',
    });
    expect(giantBlocked.ok).toBe(false);

    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 2,
      targetId: 'p2',
    });
    expect(result.ok).toBe(true);
    expect(assassin.heroClassCode).toBe('Paladin');
    expect(assassin.displayName.startsWith('Мимик')).toBe(true);
    expect(assassin.transformParentCode).toBe('Assassin');
    expect(assassin.effects.some((effect) => effect.id === 'POLYMORPH')).toBe(true);
    expect(assassin.lvl).toBe(beforeLvl + 1);
    expect(assassin.ultaCharges).toBe(1);
    expect(state.log.some((line) => line.startsWith('Мимик принимает облик Paladin'))).toBe(
      true
    );
    expect(state.log.some((line) => line.includes('Мимик Paladin принимает облик'))).toBe(false);
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
