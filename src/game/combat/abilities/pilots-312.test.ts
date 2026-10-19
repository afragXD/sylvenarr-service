import { describe, expect, test } from 'bun:test';

import { dealDamage } from '../damage';
import { applyAction, createBattleState } from '../engine';
import { healUnit } from '../effects';
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

describe('phase 3.12 pilots', () => {
  test('GoldGolem slot 1 can stun', () => {
    const heroes = new Map([
      ['GoldGolem', hero('GoldGolem', { initiative: 99, accuracy: 100, damage: 40 })],
      ['B', hero('B', { initiative: 1, armor: 0, health: 400, dodge: 0 })],
    ]);
    let stuns = 0;
    for (let i = 0; i < 40; i += 1) {
      const state = createBattleState({
        matchId: 'm',
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'GoldGolem', row: 0, pickOrder: 1 },
          { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes,
      });
      const golem = state.units.find((unit) => unit.id === 'p1')!;
      expect(golem.forbiddenResurrect).toBe(true);
      state.activeUnitId = 'p1';
      state.turnPlayerId = 'h';
      applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        slot: 1,
        targetId: 'p2',
      });
      // STUNNED снимается на старте хода цели — смотрим лог нокаута.
      if (state.log.some((line) => line.includes('нокауте'))) {
        stuns += 1;
      }
    }
    expect(stuns).toBeGreaterThan(0);
  });

  test('BeerElemental slot 4 spends ulta and grants POISON', () => {
    const heroes = new Map([
      ['BeerElemental', hero('BeerElemental', { initiative: 99 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'BeerElemental', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const beer = state.units.find((unit) => unit.id === 'p1')!;
    expect(beer.ultaCharges).toBe(3);
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
    expect(beer.ultaCharges).toBe(2);
    const foe = state.units.find((unit) => unit.id === 'p2')!;
    expect(foe.effects.some((effect) => effect.id === 'POISON')).toBe(true);
  });

  test('BeerElemental critBank forces crit', () => {
    const heroes = new Map([
      ['BeerElemental', hero('BeerElemental', { initiative: 99, luck: 0, damage: 30, accuracy: 100 })],
      ['B', hero('B', { initiative: 1, armor: 0, health: 500, dodge: 0 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'BeerElemental', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const beer = state.units.find((unit) => unit.id === 'p1')!;
    const foe = state.units.find((unit) => unit.id === 'p2')!;
    beer.critBank = 1;
    beer.luck = 0;
    // forceHit — исключаем флаки натурального промаха (кап попадания 95%).
    const withBank = dealDamage(beer, foe, { damageMult: 1, armorIgnore: 1, forceHit: true }, state);
    expect(beer.critBank).toBe(0);
    foe.health = 500;
    const without = dealDamage(beer, foe, { damageMult: 1, armorIgnore: 1, forceHit: true }, state);
    expect(withBank).toBeGreaterThan(without);
  });

  test('EvilTree INTERDICT blocks heal', () => {
    const heroes = new Map([
      ['EvilTree', hero('EvilTree', { initiative: 99 })],
      ['B', hero('B', { initiative: 1, health: 100 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'EvilTree', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const foe = state.units.find((unit) => unit.id === 'p2')!;
    foe.health = 50;
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
    expect(foe.effects.some((effect) => effect.id === 'INTERDICT')).toBe(true);
    expect(healUnit(foe, 40)).toBe(0);
    expect(foe.health).toBe(50);
  });
});
