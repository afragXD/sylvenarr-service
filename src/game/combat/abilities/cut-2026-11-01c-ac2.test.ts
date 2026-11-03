import { describe, expect, test } from 'bun:test';

import { lastDealDamageResult } from '../damage';
import { applyAction, createBattleState } from '../engine';
import { levelUpUnit } from '../level';
import { applyClassLevelUp } from '../levelup';
import { setWard } from '../resists';
import type { HeroClassStats } from '../types';
import { eternalHungerVampCoef } from './marauder';
import { listPilotAbilities } from './registry';

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
  power: 20,
  mana: 10,
  maxMana: 10,
  gold: 100,
  size: 1,
  ...overrides,
});

describe('CUT-2026-11-01c AC-2', () => {
  test('fixture beer-phrase-once: Homie пишет фразу ровно один раз', () => {
    const heroes = new Map([
      ['BeerElemental', hero('BeerElemental', { initiative: 99 })],
      ['Ally', hero('Ally', { initiative: 1 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'ac2-beer-phrase',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'BeerElemental', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
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
      slot: 1,
      targetId: 'p2',
    });
    expect(result.ok).toBe(true);
    const hits = state.log.filter((line) => line.includes('Пиво течёт во мне'));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toBe('Пиво течёт во мне, я един с пивом');
    expect(hits[0]!.includes('!!!')).toBe(false);
  });

  test('fixture mind-beer-pyro: Помрачение — удар элементаля не FIRE', () => {
    const heroes = new Map([
      ['Demiurge', hero('Demiurge', { initiative: 99, mana: 15, power: 30 })],
      ['BeerElemental', hero('BeerElemental', { initiative: 1, damage: 40, accuracy: 100 })],
      ['Pyro', hero('Pyro', { initiative: 1, health: 200 })],
    ]);
    let sawHit = false;
    for (let attempt = 0; attempt < 40 && !sawHit; attempt += 1) {
      const state = createBattleState({
        matchId: 'ac2-mind-beer-pyro',
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Demiurge', row: 0, pickOrder: 1 },
          { id: 'e1', playerId: 'g', heroClassCode: 'BeerElemental', row: 0, pickOrder: 1 },
          { id: 'e2', playerId: 'g', heroClassCode: 'Pyro', row: 0, pickOrder: 2 },
        ],
        heroes,
      });
      const pyro = state.units.find((unit) => unit.id === 'e2')!;
      pyro.health = 30;
      pyro.lvl = 1;
      setWard(pyro, 'FIRE', 5);
      const beer = state.units.find((unit) => unit.id === 'e1')!;
      beer.health = 180;
      beer.lvl = 1;
      state.activeUnitId = 'p1';
      state.turnPlayerId = 'h';
      const result = applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        slot: 3,
        targetId: 'e1',
      });
      expect(result.ok).toBe(true);
      const line = state.log.find((entry) => entry.includes('подчиняет'));
      if (!line) {
        continue;
      }
      sawHit = true;
      const deal = lastDealDamageResult();
      expect(deal.source).not.toBe('FIRE');
      expect(deal.source).toBe('WEAPON');
      expect(line.includes('⟦FIRE⟧')).toBe(false);
      expect(line.includes('⟦WEAPON⟧')).toBe(true);
    }
    expect(sawHit).toBe(true);
  });

  test('fixture assassin-mimic-mana: мана до/после совпадает', () => {
    const heroes = new Map([
      ['Assassin', hero('Assassin', { initiative: 99, mana: 10, maxMana: 10 })],
      ['Paladin', hero('Paladin', { initiative: 1, mana: 10, maxMana: 10 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'ac2-assassin-mimic-mana',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Assassin', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Paladin', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const assassin = state.units.find((unit) => unit.id === 'p1')!;
    assassin.mana = 4;
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
    expect(assassin.heroClassCode).toBe('Paladin');
    expect(assassin.mana).toBe(4);
  });

  test('eternalHungerVampCoef растёт при падении ОЗ (L1 / L10)', () => {
    expect(eternalHungerVampCoef(1, 1)).toBeCloseTo(0.23, 5);
    expect(eternalHungerVampCoef(1, 0.5)).toBeCloseTo(0.63, 5);
    expect(eternalHungerVampCoef(1, 0.2)).toBeCloseTo(0.87, 5);
    expect(eternalHungerVampCoef(10, 1)).toBeCloseTo(0.5, 5);
    expect(eternalHungerVampCoef(10, 0.5)).toBeCloseTo(0.9, 5);
    expect(eternalHungerVampCoef(10, 0.1)).toBe(1);
    expect(eternalHungerVampCoef(1, 0.1)).toBeGreaterThan(eternalHungerVampCoef(1, 0.5));
    expect(eternalHungerVampCoef(1, 0.5)).toBeGreaterThan(eternalHungerVampCoef(1, 1));
  });

  test('fixture eternal-hunger: передний ряд, без armorIgnore, КД 2', () => {
    const heroes = new Map([
      ['Werewolf', hero('Werewolf', { initiative: 99, damage: 40, accuracy: 100, health: 200 })],
      ['B', hero('B', { initiative: 1, armor: 20, health: 500 })],
    ]);
    const state = createBattleState({
      matchId: 'ac2-eternal-hunger',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Werewolf', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const wolf = state.units.find((unit) => unit.id === 'p1')!;
    expect(wolf.row).toBe(0);
    const meta = listPilotAbilities(state, wolf).find((ability) => ability.slot === 2)!;
    expect(meta.disabledReason).toBeNull();
    expect(meta.legalTargetIds).toContain('e1');

    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const foe = state.units.find((unit) => unit.id === 'e1')!;
    const armorBefore = foe.armor;
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 2,
      targetId: 'e1',
    });
    expect(result.ok).toBe(true);
    // Без armorIgnore 0.35 броня цели остаётся (урон может её не ломать).
    expect(foe.armor).toBe(armorBefore);

    const after = listPilotAbilities(state, wolf).find((ability) => ability.slot === 2)!;
    expect(after.disabledReason).toMatch(/перезарядка 2|Кулдаун 2/);
  });

  test('fixture inquisitor-ind0: при ind=0 нет +брони/+силы на stage%5', () => {
    const heroes = new Map([
      ['Inquisitor', hero('Inquisitor', { initiative: 50, armor: 10, power: 20 })],
      ['B', hero('B', { initiative: 10 })],
    ]);
    const state = createBattleState({
      matchId: 'ac2-inquisitor-ind0',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Inquisitor', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    state.stage = 5;
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.armor = 10;
    unit.power = 20;
    // Прямой вызов хендлера с ind=0 (levelUpUnit(0) no-op).
    applyClassLevelUp(unit, 0, state);
    expect(unit.armor).toBe(10);
    expect(unit.power).toBe(20);

    levelUpUnit(unit, 1, state);
    // AC-3: +16 брони (не +20).
    expect(unit.armor).toBe(26);
    expect(unit.power).toBe(30);
  });
});
