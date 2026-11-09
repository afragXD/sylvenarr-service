import { afterEach, describe, expect, spyOn, test } from 'bun:test';

import { buildFairShop } from '../../economy/fair';
import { getItem } from '../../items/catalog';
import { grantEffect, hasEffect } from '../effects';
import { setEffectState } from '../effects/context';
import { applyAction, createBattleState } from '../engine';
import { levelUpUnit } from '../level';
import { PERK_BY_ID } from '../../perks/catalog';
import type { BattleState, BattleUnit, HeroClassStats } from '../types';
import { abbessAbilities } from './abbess';
import { demonLordAbilities } from './demon-lord';
import { incubAbilities } from './incub';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 400,
  damage: 40,
  armor: 0,
  initiative: 10,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 40,
  mana: 30,
  maxMana: 30,
  gold: 400,
  size: 1,
  ...overrides,
});

const rules = {
  maxTeamSize: 20,
  maxRowSize: 20,
  maxRounds: 40,
  healthBonus: 1,
  startingLevel: 1,
  fairEnabled: true,
  shopSize: 8,
  goldBonus: 1,
};

function makeState(
  picks: Array<{ id: string; playerId: string; heroClassCode: string; row: 0 | 1; pickOrder: number }>,
  heroes: Map<string, HeroClassStats>,
  extraRules: Partial<typeof rules> = {},
): BattleState {
  return createBattleState({
    matchId: 'r3',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks,
    heroes,
    rules: { ...rules, ...extraRules },
  });
}

function unit(state: BattleState, id: string): BattleUnit {
  const found = state.units.find((item) => item.id === id);
  if (!found) {
    throw new Error(id);
  }
  return found;
}

describe('CUT-2026-11-09 r3 AC-1 re-cast invisibility + REFLECTION', () => {
  test('повторный каст Невидимости Детектива не снимает эффект и не теряет заряд зря', () => {
    const heroes = new Map([
      ['Detective', hero('Detective', { initiative: 99, accuracy: 200, damage: 30 })],
      ['B', hero('B', { initiative: 1, health: 500 })],
    ]);
    const state = makeState(
      [
        { id: 'p1', playerId: 'h', heroClassCode: 'Detective', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    );
    const det = unit(state, 'p1');
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    expect(
      applyAction(state, { playerId: 'h', unitId: 'p1', action: 'ability', slot: 3 }).ok,
    ).toBe(true);
    expect(hasEffect(det, 'INVISIBLE')).toBe(true);
    const chargesAfterFirst = det.ultaCharges;

    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    state.doneIds = state.doneIds.filter((id) => id !== 'p1');
    expect(
      applyAction(state, { playerId: 'h', unitId: 'p1', action: 'ability', slot: 3 }).ok,
    ).toBe(true);
    expect(hasEffect(det, 'INVISIBLE')).toBe(true);
    expect(det.ultaCharges).toBe(chargesAfterFirst - 1);
  });

  test('REFLECTION не выбирает невидимого врага', () => {
    const heroes = new Map([
      ['A', hero('A', { initiative: 99 })],
      ['Vis', hero('Vis', { initiative: 1 })],
      ['Hid', hero('Hid', { initiative: 1 })],
    ]);
    const state = makeState(
      [
        { id: 'a', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'vis', playerId: 'g', heroClassCode: 'Vis', row: 0, pickOrder: 1 },
        { id: 'hid', playerId: 'g', heroClassCode: 'Hid', row: 0, pickOrder: 2 },
      ],
      heroes,
    );
    setEffectState(state);
    const bearer = unit(state, 'a');
    const visible = unit(state, 'vis');
    const hidden = unit(state, 'hid');
    grantEffect(bearer, 'REFLECTION', 5);
    grantEffect(hidden, 'INVISIBLE', 3, 0);
    grantEffect(bearer, 'POISON', 2, 1);
    expect(hasEffect(bearer, 'POISON')).toBe(false);
    expect(hasEffect(visible, 'POISON')).toBe(true);
    expect(hasEffect(hidden, 'POISON')).toBe(false);
  });
});

describe('CUT-2026-11-09 r3 AC-14 psychic shock morale', () => {
  test('Бес −50 → ×1.5; нежить и голем ×1 при −50 и +50', () => {
    const cases: Array<{ code: string; morale: number; expectedMult: number }> = [
      { code: 'Imp', morale: -50, expectedMult: 1.5 },
      { code: 'Zombie', morale: -50, expectedMult: 1 },
      { code: 'Zombie', morale: 50, expectedMult: 1 },
      { code: 'GoldGolem', morale: -50, expectedMult: 1 },
      { code: 'GoldGolem', morale: 50, expectedMult: 1 },
    ];
    for (const entry of cases) {
      const heroes = new Map([
        ['Incub', hero('Incub', { initiative: 99, power: 100, mana: 20, maxMana: 20 })],
        [entry.code, hero(entry.code, { initiative: 1, health: 5000, armor: 0 })],
      ]);
      const state = makeState(
        [
          { id: 'a', playerId: 'h', heroClassCode: 'Incub', row: 0, pickOrder: 1 },
          { id: 't', playerId: 'g', heroClassCode: entry.code, row: 0, pickOrder: 1 },
        ],
        heroes,
      );
      const target = unit(state, 't');
      target.morale = entry.morale;
      target.resists = {};
      const hp = target.health;
      expect(incubAbilities.apply(state, unit(state, 'a'), { slot: 1, targetId: 't' }).status).toBe(
        'done',
      );
      expect(hp - target.health).toBe(Math.round(100 * entry.expectedMult));
    }
  });
});

describe('CUT-2026-11-09 r3 AC-17 fair shop quotas', () => {
  test('100 генераций buildFairShop соблюдают квоту варианта A', () => {
    const heroes = new Map([
      ['Abbess', hero('Abbess', { initiative: 30 })],
      ['Titan', hero('Titan', { initiative: 20 })],
      ['Witch', hero('Witch', { initiative: 25 })],
      ['Foe', hero('Knight', { initiative: 1 })],
    ]);
    const state = makeState(
      [
        { id: 'a', playerId: 'h', heroClassCode: 'Abbess', row: 0, pickOrder: 1 },
        { id: 't', playerId: 'h', heroClassCode: 'Titan', row: 0, pickOrder: 2 },
        { id: 'w', playerId: 'h', heroClassCode: 'Witch', row: 1, pickOrder: 3 },
        { id: 'f', playerId: 'g', heroClassCode: 'Foe', row: 0, pickOrder: 1 },
      ],
      heroes,
      { shopSize: 8 },
    );
    const categories = new Set<number>();
    for (const live of state.units) {
      if (!live.alive || live.isSummon) {
        continue;
      }
      for (const perkId of live.perks ?? []) {
        const perk = PERK_BY_ID.get(perkId);
        if (perk?.kind === 'item' && typeof perk.category === 'number') {
          categories.add(perk.category);
        }
      }
    }
    const k = categories.size;
    expect(k).toBeGreaterThan(0);
    const shopSize = 8;
    const cap = Math.ceil(shopSize / k);

    for (let i = 0; i < 100; i += 1) {
      const shop = buildFairShop(state, shopSize);
      expect(shop.length).toBeLessThanOrEqual(shopSize);
      expect(new Set(shop).size).toBe(shop.length);
      const counts = new Map<number, number>();
      for (const code of shop) {
        const item = getItem(code);
        expect(item).toBeTruthy();
        expect(item!.sellOnly).toBeFalsy();
        expect(categories.has(item!.category)).toBe(true);
        counts.set(item!.category, (counts.get(item!.category) ?? 0) + 1);
      }
      for (const count of counts.values()) {
        expect(count).toBeLessThanOrEqual(cap);
      }
    }
  });
});

describe('CUT-2026-11-09 r3 AC-23 Demiurge mana regen', () => {
  let randomSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = undefined;
  });

  test('100 повышений уровня Белого мага — прирост маны никогда не 0', () => {
    const heroes = new Map([
      ['Demiurge', hero('Demiurge', { initiative: 40, mana: 0, maxMana: 99 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = makeState(
      [
        { id: 'm', playerId: 'h', heroClassCode: 'Demiurge', row: 0, pickOrder: 1 },
        { id: 'f', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    );
    const mage = unit(state, 'm');
    const gains: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      mage.mana = 0;
      const before = mage.mana;
      levelUpUnit(mage, 1, state);
      const gained = mage.mana - before;
      gains.push(gained);
      expect(gained).toBeGreaterThan(0);
    }
    expect(Math.min(...gains)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...gains)).toBeLessThanOrEqual(3);
  });
});

describe('CUT-2026-11-09 r3 AC-22 weakness clamp list', () => {
  test('clamp-эффекты с полом: WEAKNESS не поднимает атаку; +2 атаки нет', () => {
    // Список clamp-пар наложение/снятие с полом (applyStatShift floor):
    // WEAKNESS damage floor 0, UNLUCKY luck 0, FATMAN dodge 0, SLOW initiative 1,
    // DEATHSENTENCE armor 0, INTERFERENCE power 0.
    const heroes = new Map([
      ['Demiurge', hero('Demiurge', { initiative: 40, damage: 0 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = makeState(
      [
        { id: 'm', playerId: 'h', heroClassCode: 'Demiurge', row: 0, pickOrder: 1 },
        { id: 'f', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    );
    const mage = unit(state, 'm');
    mage.damage = 0;
    for (let i = 0; i < 5; i += 1) {
      grantEffect(mage, 'WEAKNESS', 2, 5);
      expect(mage.damage).toBe(0);
      const weak = mage.effects.find((effect) => effect.id === 'WEAKNESS');
      expect(weak?.applied).toBe(0);
      mage.effects = mage.effects.filter((effect) => effect.id !== 'WEAKNESS');
    }
    expect(mage.damage).toBe(0);
    expect(mage.damage).not.toBe(2);
  });
});

describe('CUT-2026-11-09 r3 range extremes AC-4/5', () => {
  let randomSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = undefined;
  });

  test('AC-4 длань: min round(P×0.6) и max round(P×0.85)', () => {
    const heroes = new Map([
      ['Abbess', hero('Abbess', { initiative: 99, power: 40, mana: 20, maxMana: 20 })],
      ['Ally', hero('Ally', { initiative: 1, health: 500 })],
      ['Foe', hero('Foe', { initiative: 1 })],
    ]);
    const loState = makeState(
      [
        { id: 'a', playerId: 'h', heroClassCode: 'Abbess', row: 1, pickOrder: 1 },
        { id: 'ally', playerId: 'h', heroClassCode: 'Ally', row: 1, pickOrder: 2 },
        { id: 'f', playerId: 'g', heroClassCode: 'Foe', row: 0, pickOrder: 1 },
      ],
      heroes,
    );
    unit(loState, 'ally').health = 20;
    randomSpy = spyOn(Math, 'random').mockReturnValue(0);
    expect(abbessAbilities.apply(loState, unit(loState, 'a'), { slot: 2, targetId: 'ally' }).status).toBe(
      'done',
    );
    expect(unit(loState, 'ally').health).toBe(20 + 24); // pyRound(40×0.6)

    randomSpy.mockRestore();
    const hiState = makeState(
      [
        { id: 'a', playerId: 'h', heroClassCode: 'Abbess', row: 1, pickOrder: 1 },
        { id: 'ally', playerId: 'h', heroClassCode: 'Ally', row: 1, pickOrder: 2 },
        { id: 'f', playerId: 'g', heroClassCode: 'Foe', row: 0, pickOrder: 1 },
      ],
      heroes,
    );
    unit(hiState, 'ally').health = 20;
    // randInt(min,max) uses floor(random*(max-min+1)); 0.999… → max
    randomSpy = spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(abbessAbilities.apply(hiState, unit(hiState, 'a'), { slot: 2, targetId: 'ally' }).status).toBe(
      'done',
    );
    expect(unit(hiState, 'ally').health).toBe(20 + 34); // pyRound(40×0.85)
  });

  test('AC-5 рёв: потеря морали 8+L … 8+2L', () => {
    const heroes = new Map([
      ['DemonLord', hero('DemonLord', { initiative: 99, health: 400, mana: 10 })],
      ['B', hero('B', { initiative: 1, health: 800, morale: 40 })],
    ]);
    const mk = () =>
      makeState(
        [
          { id: 'a', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
          { id: 'open', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes,
      );

    const lo = mk();
    unit(lo, 'a').health = unit(lo, 'a').maxHp;
    unit(lo, 'a').lvl = 5;
    randomSpy = spyOn(Math, 'random').mockReturnValue(0);
    const moraleLo = unit(lo, 'open').morale;
    expect(demonLordAbilities.apply(lo, unit(lo, 'a'), { slot: 4 }).status).toBe('done');
    expect(moraleLo - unit(lo, 'open').morale).toBe(8 + 5);

    randomSpy.mockRestore();
    const hi = mk();
    unit(hi, 'a').health = unit(hi, 'a').maxHp;
    unit(hi, 'a').lvl = 5;
    randomSpy = spyOn(Math, 'random').mockReturnValue(0.999999);
    const moraleHi = unit(hi, 'open').morale;
    expect(demonLordAbilities.apply(hi, unit(hi, 'a'), { slot: 4 }).status).toBe('done');
    expect(moraleHi - unit(hi, 'open').morale).toBe(8 + 10);
  });
});
