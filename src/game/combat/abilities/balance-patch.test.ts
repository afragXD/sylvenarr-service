import { describe, expect, test } from 'bun:test';

import { resolveAttackStyle } from '../attack-style';
import { DEFAULT_RESISTS } from '../defaultResists';
import { grantEffect, tickEffectsOnTurnStart } from '../effects';
import { applyAction, createBattleState, listAttackTargets } from '../engine';
import type { HeroClassStats } from '../types';
import { applyAbility } from './registry';

const hero = (code: string, over: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 200,
  damage: 20,
  armor: 0,
  initiative: 10,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 30,
  mana: 10,
  maxMana: 10,
  gold: 100,
  size: 1,
  ...over,
});

describe('balance patch 2026-10', () => {
  test('SANCTUM on only front unit still blocks melee to back row', () => {
    const heroes = new Map([
      ['Patriarch', hero('Patriarch', { initiative: 99, mana: 10 })],
      ['Ally', hero('Ally', { initiative: 1 })],
      ['Back', hero('Back', { initiative: 1 })],
      ['B', hero('B', { initiative: 50, accuracy: 100 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Patriarch', row: 1, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'p3', playerId: 'h', heroClassCode: 'Back', row: 1, pickOrder: 3 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
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
    const attacker = state.units.find((unit) => unit.id === 'e1')!;
    attacker.attackStyle = 'melee';
    const targets = listAttackTargets(state, attacker).map((unit) => unit.id);
    expect(targets).not.toContain('p2');
    expect(targets).not.toContain('p3');
    expect(targets).toEqual([]);
  });

  test('DoT does not re-tick after wasEffected until new round', () => {
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Knight', hero('Knight', { initiative: 99 })],
      ]),
    });
    const unit = state.units.find((u) => u.id === 'p1')!;
    grantEffect(unit, 'POISON', 5, 1);
    unit.wasEffected = false;
    const hp0 = unit.health;
    const log1 = tickEffectsOnTurnStart(unit);
    expect(log1.some((line) => line.includes('урона'))).toBe(true);
    expect(unit.wasEffected).toBe(true);
    const hp1 = unit.health;
    expect(hp1).toBeLessThan(hp0);
    const log2 = tickEffectsOnTurnStart(unit);
    expect(log2.some((line) => line.includes('урона'))).toBe(false);
    expect(unit.health).toBe(hp1);
  });

  test('attack styles: Pyro/EvilTree/Specter/BeerElemental magic; GoblinTrapper ranged', () => {
    expect(resolveAttackStyle('Pyro')).toBe('magic');
    expect(resolveAttackStyle('EvilTree')).toBe('magic');
    expect(resolveAttackStyle('Specter')).toBe('magic');
    expect(resolveAttackStyle('BeerElemental')).toBe('magic');
    expect(resolveAttackStyle('GoblinTrapper')).toBe('ranged');
  });

  test('Pyro and Archlich resists', () => {
    expect(DEFAULT_RESISTS.Pyro?.FIRE).toEqual({ value: 25, wardCharges: 1 });
    expect(DEFAULT_RESISTS.Archlich?.FIRE).toEqual({ value: -20, wardCharges: 1 });
  });

  test('BeerElemental slot 1 Homie De Flanders deals water magic', () => {
    const heroes = new Map([
      ['BeerElemental', hero('BeerElemental', { initiative: 99, power: 18, luck: 20, mana: 0 })],
      ['B', hero('B', { initiative: 1, health: 300 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'BeerElemental', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const actor = state.units.find((u) => u.id === 'p1')!;
    const foe = state.units.find((u) => u.id === 'e1')!;
    const hpBefore = foe.health;
    const outcome = applyAbility(state, actor, { slot: 1, targetId: 'e1' });
    expect(outcome.status).toBe('done');
    expect(foe.health).toBeLessThan(hpBefore);
  });

  test('units start with maxMana from hero stats', () => {
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'EvilTree', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['EvilTree', hero('EvilTree', { mana: 10, maxMana: 10, initiative: 99 })],
        ['Knight', hero('Knight', { mana: 0, maxMana: 0 })],
      ]),
    });
    const tree = state.units.find((u) => u.id === 'p1')!;
    expect(tree.mana).toBe(10);
    expect(tree.maxMana).toBe(10);
  });
});
