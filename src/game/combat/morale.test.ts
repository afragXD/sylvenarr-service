import { describe, expect, test } from 'bun:test';

import { applyAbility } from './abilities';
import { createSummon } from './abilities/summon';
import { dealDamage, markDeadIfNeeded } from './damage';
import { delEffect, grantEffect, hasEffect } from './effects';
import { applyAction, createBattleState, toBattleSummary } from './engine';
import {
  addMentalIllness,
  applyPsycho,
  maybeRewardHighMorale,
  normalizeUnit,
} from './morale';
import type { HeroClassStats } from './types';

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

const twoUnitState = (
  hostCode: string,
  guestCode: string,
  hostOverrides: Partial<HeroClassStats> = {},
  guestOverrides: Partial<HeroClassStats> = {},
  extraHeroes: Array<[string, HeroClassStats]> = []
) => {
  const heroes = new Map<string, HeroClassStats>([
    [hostCode, hero(hostCode, { initiative: 99, ...hostOverrides })],
    [guestCode, hero(guestCode, { initiative: 1, ...guestOverrides })],
    ...extraHeroes,
  ]);
  return createBattleState({
    matchId: 'm',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      { id: 'p1', playerId: 'h', heroClassCode: hostCode, row: 0, pickOrder: 1 },
      { id: 'p2', playerId: 'g', heroClassCode: guestCode, row: 0, pickOrder: 1 },
    ],
    heroes,
  });
};

describe('morale + battle summary', () => {
  test('toBattleSummary includes resists and morale', () => {
    const state = twoUnitState('Pyro', 'B', { morale: 12 });
    const pyro = state.units.find((unit) => unit.id === 'p1')!;
    const summary = toBattleSummary(state);
    const unit = summary.units.find((item) => item.id === 'p1')!;
    expect(unit.morale).toBe(12);
    expect(Array.isArray(unit.resists)).toBe(true);
    expect(unit.resists.some((resist) => resist.source === 'FIRE')).toBe(true);
    expect(pyro.illness).toBe(false);
  });

  test('normalizeUnit caps morale at 65', () => {
    const state = twoUnitState('Knight', 'B');
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.morale = 90;
    normalizeUnit(unit);
    expect(unit.morale).toBe(65);
  });

  test('psycho: undead skips', () => {
    const state = twoUnitState('Zombie', 'B', { morale: -200 });
    const zombie = state.units.find((u) => u.id === 'p1')!;
    applyPsycho(state, zombie);
    expect(zombie.alive).toBe(true);
    expect(zombie.illness).toBe(false);
  });

  test('psycho: artificial skips', () => {
    const state = twoUnitState('GoldGolem', 'B', { morale: -200 });
    const golem = state.units.find((u) => u.id === 'p1')!;
    applyPsycho(state, golem);
    expect(golem.alive).toBe(true);
    expect(golem.illness).toBe(false);
  });

  test('psycho: morale < -100 kills', () => {
    const state = twoUnitState('Knight', 'B', { morale: -101 });
    const knight = state.units.find((u) => u.id === 'p1')!;
    applyPsycho(state, knight);
    expect(knight.alive).toBe(false);
  });

  test('psycho: illness fires once in -70..-100 band', () => {
    const state = twoUnitState('Knight', 'B', { morale: -80, gold: 50 });
    const knight = state.units.find((u) => u.id === 'p1')!;
    addMentalIllness(state, knight, 4);
    knight.illness = true;
    expect(knight.gold).toBe(0);
    expect(knight.illness).toBe(true);
    const goldAfter = knight.gold;
    applyPsycho(state, knight);
    expect(knight.gold).toBe(goldAfter);
  });

  test('mental illness case 6: soul uplift', () => {
    const state = twoUnitState('Knight', 'B', { morale: -80 });
    const knight = state.units.find((u) => u.id === 'p1')!;
    const dmg = knight.damage;
    const power = knight.power;
    addMentalIllness(state, knight, 6);
    expect(knight.morale).toBe(0);
    expect(knight.damage).toBe(dmg + 15);
    expect(knight.power).toBe(power + 15);
  });

  test('HAPPY buffs morale not luck', () => {
    const state = twoUnitState('Knight', 'B');
    const unit = state.units.find((u) => u.id === 'p1')!;
    const luckBefore = unit.luck;
    const moraleBefore = unit.morale;
    grantEffect(unit, 'HAPPY', 2, 10);
    expect(unit.morale).toBe(moraleBefore + 10);
    expect(unit.luck).toBe(luckBefore);
    delEffect(unit, 'HAPPY');
    expect(unit.morale).toBe(moraleBefore);
  });

  test('maybeRewardHighMorale grants STRENGTH at morale 100', () => {
    const state = twoUnitState('Knight', 'B');
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.morale = 100;
    maybeRewardHighMorale(state, unit);
    expect(hasEffect(unit, 'STRENGTH')).toBe(true);
  });

  test('crit raises morale by 5', () => {
    const state = twoUnitState('Knight', 'B', { luck: 100, accuracy: 100 });
    const attacker = state.units.find((u) => u.id === 'p1')!;
    const defender = state.units.find((u) => u.id === 'p2')!;
    attacker.morale = 0;
    attacker.critBank = 0;
    // forceHit + luck 100 → почти всегда крит; повторяем пока не критнём
    let critHit = false;
    for (let i = 0; i < 50 && !critHit; i += 1) {
      attacker.morale = 0;
      defender.health = 500;
      dealDamage(
        attacker,
        defender,
        { kind: 'melee', damageMult: 1, armorIgnore: 0, forceHit: true },
        state
      );
      if (attacker.morale === 5) {
        critHit = true;
      }
    }
    expect(critHit).toBe(true);
  });
});

describe('summon death cascade', () => {
  test('summons die when summoner dies', () => {
    const heroes = new Map([
      ['Archlich', hero('Archlich', { initiative: 99, mana: 10 })],
      ['Zombie', hero('Zombie', { health: 50, damage: 10 })],
      ['B', hero('B', { initiative: 1, health: 300 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Archlich', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const lich = state.units.find((u) => u.id === 'p1')!;
    lich.maxSummons = 3;
    const zombie = createSummon(state, {
      summoner: lich,
      heroCode: 'Zombie',
      row: 0,
    });
    expect(zombie).not.toBeNull();
    expect(zombie!.alive).toBe(true);
    lich.health = 0;
    markDeadIfNeeded(state, lich);
    expect(lich.alive).toBe(false);
    expect(zombie!.alive).toBe(false);
    expect(state.graveyard.some((entry) => entry.unitId === zombie!.id)).toBe(false);
  });
});

describe('golem resonance + beer Homie', () => {
  test('GoldGolem slot 4 grants ABSOLUTEPOWER', () => {
    const heroes = new Map([
      ['GoldGolem', hero('GoldGolem', { initiative: 99 })],
      ['Ally', hero('Ally', { initiative: 50, power: 40 })],
      ['Foe', hero('Foe', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'GoldGolem', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'Foe', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const golem = state.units.find((u) => u.id === 'p1')!;
    const ally = state.units.find((u) => u.id === 'p2')!;
    const powerBefore = ally.power;
    const outcome = applyAbility(state, golem, { slot: 4 });
    expect(outcome.status).toBe('done');
    expect(hasEffect(ally, 'ABSOLUTEPOWER')).toBe(true);
    expect(ally.power).toBeGreaterThan(powerBefore);
  });

  test('BeerElemental Сливняк deals numeric water damage', () => {
    const state = twoUnitState(
      'BeerElemental',
      'GoldGolem',
      { power: 18, luck: 0, mana: 0 },
      { health: 300, armor: 20 }
    );
    const actor = state.units.find((u) => u.id === 'p1')!;
    const foe = state.units.find((u) => u.id === 'p2')!;
    const hpBefore = foe.health;
    const outcome = applyAbility(state, actor, { slot: 5, targetId: 'p2' });
    expect(outcome.status).toBe('done');
    expect(Number.isFinite(foe.health)).toBe(true);
    expect(foe.health).toBeLessThan(hpBefore);
    expect(state.log.some((line) => line.includes('NaN'))).toBe(false);
  });

  test('BeerElemental Homie raises ally morale', () => {
    const state = twoUnitState('BeerElemental', 'GoldGolem', {}, {});
    const actor = state.units.find((u) => u.id === 'p1')!;
    actor.lvl = 2;
    const before = actor.morale;
    const outcome = applyAbility(state, actor, { slot: 1, targetId: 'p1' });
    expect(outcome.status).toBe('done');
    expect(actor.morale).toBe(before + 7 + actor.lvl * 2);
  });
});

describe('class morale deltas', () => {
  test('Assassin slot 5 reduces morale', () => {
    const state = twoUnitState('Assassin', 'B', { morale: 20 });
    const assassin = state.units.find((u) => u.id === 'p1')!;
    const before = assassin.morale;
    const outcome = applyAbility(state, assassin, { slot: 5 });
    expect(outcome.status).toBe('done');
    expect(assassin.morale).toBeLessThan(before);
  });

  test('Inquisitor slot 2 lowers foe morale on hit', () => {
    let lowered = false;
    for (let attempt = 0; attempt < 30 && !lowered; attempt += 1) {
      const state = twoUnitState(
        'Inquisitor',
        'Knight',
        { mana: 20, accuracy: 100, luck: 0 },
        { morale: 20, dodge: 0 }
      );
      const inquisitor = state.units.find((u) => u.id === 'p1')!;
      const foe = state.units.find((u) => u.id === 'p2')!;
      const before = foe.morale;
      applyAbility(state, inquisitor, { slot: 2, targetId: 'p2' });
      if (foe.morale < before) {
        lowered = true;
      }
    }
    expect(lowered).toBe(true);
  });

  test('Specter slot 3 does not lower morale (FATMAN instead)', () => {
    const state = twoUnitState('Specter', 'Knight', {}, { morale: 20 });
    const specter = state.units.find((u) => u.id === 'p1')!;
    const foe = state.units.find((u) => u.id === 'p2')!;
    const before = foe.morale;
    const outcome = applyAbility(state, specter, { slot: 3, targetId: 'p2' });
    expect(outcome.status).toBe('done');
    expect(foe.morale).toBe(before);
    expect(foe.effects.some((e) => e.id === 'FATMAN')).toBe(true);
  });

  test('Specter dark ritual lowers ally morale by 7', () => {
    const state = twoUnitState('Specter', 'Knight', {}, {});
    const specter = state.units.find((u) => u.id === 'p1')!;
    // Добавим союзника на ту же команду
    const ally = state.units.find((u) => u.id === 'p1')!;
    ally.morale = 20;
    const before = ally.morale;
    const outcome = applyAbility(state, specter, { slot: 2, targetId: 'p1' });
    expect(outcome.status).toBe('done');
    expect(ally.morale).toBe(before - 7);
  });
});
