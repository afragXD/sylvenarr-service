import { describe, expect, test } from 'bun:test';

import { applyAction, createBattleState } from '../engine';
import { DEFAULT_RESISTS } from '../defaultResists';
import { levelUpUnit } from '../level';
import type { HeroClassStats } from '../types';
import { runPreChoice } from './registry';
import { specterAbilities } from './specter';

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

describe('halloween pumpkin update', () => {
  test('Specter resists: ARROWS 20, WEAPON 15, FIRE -15', () => {
    expect(DEFAULT_RESISTS.Specter?.FIRE).toEqual({ value: -15 });
    expect(DEFAULT_RESISTS.Specter?.ARROWS).toEqual({ value: 20 });
    expect(DEFAULT_RESISTS.Specter?.WEAPON).toEqual({ value: 15 });
  });

  test('Zombie and Pyro start with 1 ultaCharge', () => {
    const heroes = new Map([
      ['Zombie', hero('Zombie', { initiative: 99 })],
      ['Pyro', hero('Pyro', { initiative: 50 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Zombie', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Pyro', row: 1, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    expect(state.units.find((u) => u.id === 'p1')!.ultaCharges).toBe(1);
    expect(state.units.find((u) => u.id === 'p2')!.ultaCharges).toBe(1);
  });

  test('Zombie slot 2 spends ulta and applies accuracy/dodge debuffs', () => {
    const heroes = new Map([
      ['Zombie', hero('Zombie', { initiative: 99 })],
      ['B', hero('B', { initiative: 1, accuracy: 90, dodge: 40 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Zombie', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const zombie = state.units.find((u) => u.id === 'p1')!;
    const foe = state.units.find((u) => u.id === 'p2')!;
    const accBefore = foe.accuracy;
    const dodgeBefore = foe.dodge;
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
    expect(zombie.ultaCharges).toBe(0);
    expect(foe.effects.some((e) => e.id === 'FOCUSED' && e.power < 0)).toBe(true);
    expect(foe.effects.some((e) => e.id === 'FATMAN')).toBe(true);
    expect(foe.accuracy).toBe(accBefore - (10 + zombie.lvl));
    expect(foe.dodge).toBe(dodgeBefore - (10 + zombie.lvl * 2));
  });

  test('Zombie slot 4 kamikaze damages enemy row and dies', () => {
    const heroes = new Map([
      ['Zombie', hero('Zombie', { initiative: 99, health: 90 })],
      ['B', hero('B', { initiative: 1, health: 200 })],
      ['C', hero('C', { initiative: 1, health: 200 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Zombie', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'e2', playerId: 'g', heroClassCode: 'C', row: 0, pickOrder: 2 },
      ],
      heroes,
    });
    const zombie = state.units.find((u) => u.id === 'p1')!;
    const e1 = state.units.find((u) => u.id === 'e1')!;
    const e2 = state.units.find((u) => u.id === 'e2')!;
    const hp1 = e1.health;
    const hp2 = e2.health;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
      targetId: 'e1',
    });
    expect(result.ok).toBe(true);
    expect(zombie.alive).toBe(false);
    expect(e1.health).toBeLessThan(hp1);
    expect(e2.health).toBeLessThan(hp2);
  });

  test('Zombie ulta recharges every 4 stages', () => {
    const heroes = new Map([
      ['Zombie', hero('Zombie', { initiative: 99 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Zombie', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const zombie = state.units.find((u) => u.id === 'p1')!;
    zombie.ultaCharges = 0;
    state.stage = 4;
    levelUpUnit(zombie, 1, state);
    expect(zombie.ultaCharges).toBe(1);
  });

  test('Pyro slot 5 self-immolation buffs allies when HP >= half', () => {
    const heroes = new Map([
      ['Pyro', hero('Pyro', { initiative: 99, health: 100 })],
      ['Ally', hero('Ally', { initiative: 1 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Pyro', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const pyro = state.units.find((u) => u.id === 'p1')!;
    const ally = state.units.find((u) => u.id === 'p2')!;
    pyro.health = Math.ceil(pyro.maxHp / 2);
    const accBefore = ally.accuracy;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 5,
    });
    expect(result.ok).toBe(true);
    expect(pyro.alive).toBe(false);
    expect(ally.effects.some((e) => e.id === 'FOCUSED' && e.power === 15 + pyro.lvl)).toBe(true);
    expect(ally.accuracy).toBe(accBefore + 15 + pyro.lvl);
    expect(ally.critBank).toBe(1);
  });

  test('Pyro slot 3 spends bottle and burns enemy front', () => {
    const heroes = new Map([
      ['Pyro', hero('Pyro', { initiative: 99 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Pyro', row: 1, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const pyro = state.units.find((u) => u.id === 'p1')!;
    const foe = state.units.find((u) => u.id === 'e1')!;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 3,
    });
    expect(result.ok).toBe(true);
    expect(pyro.ultaCharges).toBe(0);
    const burn = foe.effects.find((e) => e.id === 'BURNING');
    expect(burn).toBeTruthy();
    expect(burn?.power).toBeCloseTo((80 + pyro.lvl) / 100);
  });

  test('Inquisitor slot 5 crystal charms: 3 MP, CD 2, any row', () => {
    const heroes = new Map([
      ['Inquisitor', hero('Inquisitor', { initiative: 99, mana: 10, luck: 0, accuracy: 100 })],
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
    const mage = state.units.find((u) => u.id === 'p1')!;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 5,
      targetId: 'p2',
    });
    expect(result.ok).toBe(true);
    expect(mage.mana).toBe(7);
    expect(mage.crystalCharmsCd).toBe(2);
  });

  test('Inquisitor telekinesis sets CD 2', () => {
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
    const mage = state.units.find((u) => u.id === 'p1')!;
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
    expect(mage.telekinesisCd).toBe(2);
  });

  test('Specter passive drains mage mana; ritual wards ally; veil grants CHAMELEON', () => {
    const heroes = new Map([
      ['Specter', hero('Specter', { initiative: 99, power: 30, damage: 0 })],
      ['Ally', hero('Ally', { initiative: 1, accuracy: 90 })],
      ['Mage', hero('Mage', { initiative: 1, power: 40, damage: 10, mana: 8 })],
      ['Melee', hero('Melee', { initiative: 1, power: 5, damage: 20, mana: 8 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Specter', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'Mage', row: 0, pickOrder: 1 },
        { id: 'e2', playerId: 'g', heroClassCode: 'Melee', row: 1, pickOrder: 2 },
      ],
      heroes,
    });
    const specter = state.units.find((u) => u.id === 'p1')!;
    const ally = state.units.find((u) => u.id === 'p2')!;
    const mage = state.units.find((u) => u.id === 'e1')!;
    const melee = state.units.find((u) => u.id === 'e2')!;
    specter.lvl = 7;
    const allyMorale = ally.morale;
    const mageMana = mage.mana;
    const meleeMana = melee.mana;
    const drain = 1 + Math.floor(specter.lvl / 7);
    runPreChoice(state, specter);
    expect(mage.mana).toBe(Math.max(0, mageMana - drain));
    expect(melee.mana).toBe(meleeMana);

    const ritual = specterAbilities.apply(state, specter, { slot: 2, targetId: 'p2' });
    expect(ritual.status).toBe('done');
    expect(ally.resists.WEAPON?.wardCharges).toBe(1);
    expect(ally.morale).toBe(allyMorale - 7);
    expect(ally.effects.some((e) => e.id === 'FOCUSED' && e.power === -17)).toBe(true);
    expect(specter.darkRitualCd).toBe(2);

    const veil = specterAbilities.apply(state, specter, { slot: 5, targetId: 'p2' });
    expect(veil.status).toBe('done');
    expect(ally.effects.some((e) => e.id === 'CHAMELEON')).toBe(true);
    expect(specter.darkVeilCd).toBe(2);
  });
});
