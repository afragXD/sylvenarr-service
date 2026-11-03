import { describe, expect, test } from 'bun:test';

import { markDeadIfNeeded } from '../damage';
import { delEffect, grantEffect, hasEffect } from '../effects';
import { applyAction, createBattleState } from '../engine';
import type { HeroClassStats } from '../types';
import { listPilotAbilities } from './registry';
import { createSummon } from './summon';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 200,
  damage: 40,
  armor: 0,
  initiative: 40,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 40,
  mana: 20,
  maxMana: 20,
  gold: 100,
  size: 1,
  ...overrides,
});

describe('CUT-2026-11-01c AC-10 Incub / Oracle', () => {
  test('fixture mentor: саммон без повышения уровня', () => {
    const state = createBattleState({
      matchId: 'ac10-mentor',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Incub', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Incub', hero('Incub', { mana: 20 })],
        ['B', hero('B')],
        ['Ectoplasm', hero('Ectoplasm')],
      ]),
    });
    const incub = state.units.find((u) => u.id === 'p1')!;
    incub.lvl = 10;
    incub.maxSummons = 2;
    const summon = createSummon(state, {
      summoner: incub,
      heroCode: 'Ectoplasm',
      row: 0,
      level: 4,
    })!;
    expect(summon.lvl).toBe(4);
    state.doneIds.push(summon.id);
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
      targetId: summon.id,
    });
    expect(result.ok).toBe(true);
    expect(summon.lvl).toBe(4);
    expect(hasEffect(summon, 'LUCKY')).toBe(true);
  });

  test('fixture doctor: у Инкуба нет, у Оракула slot 5', () => {
    const state = createBattleState({
      matchId: 'ac10-doc',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'inc', playerId: 'h', heroClassCode: 'Incub', row: 0, pickOrder: 1 },
        { id: 'orc', playerId: 'h', heroClassCode: 'Oracle', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Incub', hero('Incub')],
        ['Oracle', hero('Oracle', { mana: 20 })],
        ['B', hero('B')],
      ]),
    });
    const incub = state.units.find((u) => u.id === 'inc')!;
    const oracle = state.units.find((u) => u.id === 'orc')!;
    const incubLabels = listPilotAbilities(state, incub).map((a) => a.label);
    expect(incubLabels.some((l) => l.includes('Чудесный доктор'))).toBe(false);
    expect(incubLabels.some((l) => l.includes('Огненный хлыст'))).toBe(true);
    const doc = listPilotAbilities(state, oracle).find((a) => a.slot === 5)!;
    expect(doc.label).toBe('Чудесный доктор');

    state.activeUnitId = 'orc';
    state.turnPlayerId = 'h';
    const allyHp = incub.health;
    incub.health = incub.maxHp;
    applyAction(state, {
      playerId: 'h',
      unitId: 'orc',
      action: 'ability',
      slot: 5,
      targetId: 'inc',
    });
    expect(oracle.mana).toBe(17);
    expect(hasEffect(incub, 'IMAGINARY_HEALTH')).toBe(true);
    expect(incub.health).toBeGreaterThan(allyHp);
  });

  test('fixture whip: 3 МР, КД 2, ERUPTION 3р на L8, FIRE −5 навсегда, смерть → splash', () => {
    const state = createBattleState({
      matchId: 'ac10-whip',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Incub', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'e2', playerId: 'g', heroClassCode: 'C', row: 0, pickOrder: 2 },
        { id: 'e3', playerId: 'g', heroClassCode: 'D', row: 1, pickOrder: 3 },
      ],
      heroes: new Map([
        ['Incub', hero('Incub', { mana: 20, power: 30, accuracy: 100, luck: 0 })],
        ['B', hero('B', { health: 200 })],
        ['C', hero('C', { health: 200 })],
        ['D', hero('D', { health: 200 })],
      ]),
    });
    const incub = state.units.find((u) => u.id === 'p1')!;
    const foe = state.units.find((u) => u.id === 'e1')!;
    const sameRow = state.units.find((u) => u.id === 'e2')!;
    const otherRow = state.units.find((u) => u.id === 'e3')!;
    incub.lvl = 8;
    foe.maxHp = 200;
    foe.health = 200;
    sameRow.maxHp = 200;
    sameRow.health = 200;
    otherRow.maxHp = 200;
    otherRow.health = 200;
    const fireBefore = foe.resists.FIRE?.value ?? 0;

    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 2,
      targetId: 'e1',
    });
    expect(incub.mana).toBe(17);
    expect(incub.abilityCds?.[2]).toBe(2);
    expect(hasEffect(foe, 'ERUPTION')).toBe(true);
    const eruption = foe.effects.find((e) => e.id === 'ERUPTION')!;
    expect(eruption.rounds).toBe(2 + Math.floor(8 / 8)); // 3
    expect((foe.resists.FIRE?.value ?? 0) - fireBefore).toBe(-5);

    // После спадения эффекта −5 остаётся.
    delEffect(foe, 'ERUPTION', state);
    expect(hasEffect(foe, 'ERUPTION')).toBe(false);
    expect((foe.resists.FIRE?.value ?? 0) - fireBefore).toBe(-5);

    // Снова наложим и убьём — splash FIRE 50 / 25.
    grantEffect(foe, 'ERUPTION', 3);
    const sameBefore = sameRow.health;
    const otherBefore = otherRow.health;
    foe.health = 0;
    markDeadIfNeeded(state, foe);
    expect(sameBefore - sameRow.health).toBe(50);
    expect(otherBefore - otherRow.health).toBe(25);
  });
});
