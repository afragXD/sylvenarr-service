import { describe, expect, test } from 'bun:test';

import { applyAction, createBattleState } from '../engine';
import { grantEffect } from '../effects';
import type { HeroClassStats } from '../types';
import { demiurgeAbilities } from './demiurge';

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
  test('Oracle slot 2 always grants extra turn and sets CD 2', () => {
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
    const oracle = state.units.find((unit) => unit.id === 'p1')!;
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
    expect(oracle.momentPowerCd).toBe(2);
    expect(state.doneIds.includes('p2')).toBe(false);
  });

  test('Oracle slot 3 grants AIRWEAPON on odd lvl and VAMPWEAPON on even', () => {
    const heroes = new Map([
      ['Oracle', hero('Oracle', { initiative: 99, mana: 10 })],
      ['Ally', hero('Ally', { initiative: 1 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const mk = (lvl: number) => {
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
      const oracle = state.units.find((unit) => unit.id === 'p1')!;
      const ally = state.units.find((unit) => unit.id === 'p2')!;
      oracle.lvl = lvl;
      state.activeUnitId = 'p1';
      state.turnPlayerId = 'h';
      applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        slot: 3,
        targetId: 'p2',
      });
      return ally;
    };
    const odd = mk(3);
    expect(odd.effects.some((effect) => effect.id === 'AIRWEAPON')).toBe(true);
    const even = mk(4);
    const vamp = even.effects.find((effect) => effect.id === 'VAMPWEAPON');
    expect(vamp?.power).toBeCloseTo(0.2 + 4 * 0.02);
  });

  test('Demiurge preChoice grants AIRSHIELD +33 ARROWS, not GUARDED', () => {
    const heroes = new Map([
      ['Demiurge', hero('Demiurge', { initiative: 99, mana: 15 })],
      ['Ally', hero('Ally', { initiative: 1 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Demiurge', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'p3', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const mage = state.units.find((unit) => unit.id === 'p1')!;
    const ally = state.units.find((unit) => unit.id === 'p2')!;
    // Сброс: createBattleState мог уже прогнать preChoice первого хода.
    ally.effects = ally.effects.filter((effect) => effect.id !== 'AIRSHIELD');
    ally.resists.ARROWS = { value: 0 };
    let applied = false;
    for (let attempt = 0; attempt < 200 && !applied; attempt += 1) {
      demiurgeAbilities.preChoice?.(state, mage);
      applied = ally.effects.some((effect) => effect.id === 'AIRSHIELD');
    }
    expect(applied).toBe(true);
    expect(ally.effects.some((effect) => effect.id === 'GUARDED')).toBe(false);
    expect(ally.resists.ARROWS?.value ?? 0).toBe(33);
  });

  test('Demiurge clone starts with one third of template maxMana', () => {
    const heroes = new Map([
      ['Demiurge', hero('Demiurge', { initiative: 99, mana: 15 })],
      ['Ally', hero('Ally', { initiative: 1, mana: 30 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Demiurge', row: 1, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'p3', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const ally = state.units.find((unit) => unit.id === 'p2')!;
    ally.maxMana = 30;
    ally.mana = 30;
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
    const phantom = state.units.find(
      (unit) => unit.isSummon && unit.summonerId === 'p1'
    )!;
    expect(phantom).toBeTruthy();
    expect(phantom.mana).toBe(Math.floor(ally.maxMana / 3));
    expect(phantom.maxMana).toBe(ally.maxMana);
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
    const mage = state.units.find((unit) => unit.id === 'p1')!;
    expect(mage.maxSummons).toBe(2);
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

  test('Demiurge slot 1 can cast from back row', () => {
    const heroes = new Map([
      ['Demiurge', hero('Demiurge', { initiative: 99, mana: 15, power: 40, luck: 0, accuracy: 100 })],
      ['B', hero('B', { initiative: 1, armor: 0, health: 200, dodge: 0 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Demiurge', row: 1, pickOrder: 1 },
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
      slot: 1,
      targetId: 'p2',
    });
    expect(result.ok).toBe(true);
    const foe = state.units.find((unit) => unit.id === 'p2')!;
    expect(foe.effects.some((effect) => effect.id === 'STUNNED')).toBe(false);
  });

  test('Demiurge slot 3 sets mindCloudCd and prefers fragile ally', () => {
    const heroes = new Map([
      ['Demiurge', hero('Demiurge', { initiative: 99, mana: 15 })],
      ['Victim', hero('Victim', { initiative: 1, damage: 30, accuracy: 100 })],
      ['Tank', hero('Tank', { initiative: 1, health: 200 })],
      ['Fragile', hero('Fragile', { initiative: 1, health: 40 })],
    ]);
    let pickedFragile = false;
    for (let attempt = 0; attempt < 40 && !pickedFragile; attempt += 1) {
      const state = createBattleState({
        matchId: 'm',
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Demiurge', row: 0, pickOrder: 1 },
          { id: 'p2', playerId: 'g', heroClassCode: 'Victim', row: 0, pickOrder: 1 },
          { id: 'p3', playerId: 'g', heroClassCode: 'Tank', row: 0, pickOrder: 2 },
          { id: 'p4', playerId: 'g', heroClassCode: 'Fragile', row: 1, pickOrder: 3 },
        ],
        heroes,
      });
      const mage = state.units.find((unit) => unit.id === 'p1')!;
      const fragile = state.units.find((unit) => unit.id === 'p4')!;
      fragile.health = 20;
      fragile.lvl = 1;
      const tank = state.units.find((unit) => unit.id === 'p3')!;
      tank.health = 180;
      tank.lvl = 1;
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
      expect(mage.mindCloudCd).toBe(2);
      if (fragile.health < 20) {
        pickedFragile = true;
      }
      const blocked = applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        slot: 3,
        targetId: 'p2',
      });
      expect(blocked.ok).toBe(false);
    }
    expect(pickedFragile).toBe(true);
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
