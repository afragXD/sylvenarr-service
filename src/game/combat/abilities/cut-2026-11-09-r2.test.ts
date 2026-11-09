import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { grantEffect, hasEffect } from '../effects';
import { applyAction, createBattleState } from '../engine';
import { levelUpUnit } from '../level';
import type { BattleState, BattleUnit, HeroClassStats } from '../types';
import { abbessAbilities } from './abbess';
import { antipaladinAbilities } from './antipaladin';
import { chargeHintFor, stepsUntilCharge } from './charge-hints';
import { demonLordAbilities } from './demon-lord';
import { dracolichAbilities } from './dracolich';
import { incubAbilities } from './incub';
import { marauderAbilities } from './marauder';
import { mermaidAbilities } from './mermaid';
import { titanAbilities } from './titan';
import { zombieAbilities } from './zombie';
import type { AbilityHandler } from './types';

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
  fairEnabled: false,
  goldBonus: 1,
};

function makeState(
  picks: Array<{ id: string; playerId: string; heroClassCode: string; row: 0 | 1; pickOrder: number }>,
  heroes: Map<string, HeroClassStats>,
): BattleState {
  return createBattleState({
    matchId: 'r2',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks,
    heroes,
    rules,
  });
}

function unit(state: BattleState, id: string): BattleUnit {
  const found = state.units.find((item) => item.id === id);
  if (!found) {
    throw new Error(id);
  }
  return found;
}

describe('CUT-2026-11-09 r2 invisibility', () => {
  let randomSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = undefined;
  });

  test('каст Детектива оставляет невидимость, ожидание не снимает, атака снимает', () => {
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

    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    state.doneIds = state.doneIds.filter((id) => id !== 'p1');
    expect(applyAction(state, { playerId: 'h', unitId: 'p1', action: 'wait' }).ok).toBe(true);
    expect(hasEffect(det, 'INVISIBLE')).toBe(true);

    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    state.doneIds = state.doneIds.filter((id) => id !== 'p1');
    expect(
      applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'attack',
        targetId: 'p2',
      }).ok,
    ).toBe(true);
    expect(hasEffect(det, 'INVISIBLE')).toBe(false);
  });

  test('массовый вражеский удар пропускает невидимого, союзная длань его лечит', () => {
    randomSpy = spyOn(Math, 'random').mockReturnValue(0);
    const cases: Array<{ code: string; row?: 0 | 1; run: AbilityHandler['apply'] }> = [
      { code: 'Mermaid', run: (state, actor, input) => mermaidAbilities.apply(state, actor, input) },
      { code: 'Marauder', run: (state, actor, input) => marauderAbilities.apply(state, actor, input) },
      { code: 'Zombie', run: (state, actor, input) => zombieAbilities.apply(state, actor, input) },
      { code: 'Abbess', run: (state, actor, input) => abbessAbilities.apply(state, actor, input) },
      { code: 'Incub', run: (state, actor, input) => incubAbilities.apply(state, actor, input) },
      { code: 'Antipaladin', run: (state, actor, input) => antipaladinAbilities.apply(state, actor, input) },
      { code: 'Dracolich', run: (state, actor, input) => dracolichAbilities.apply(state, actor, input) },
      { code: 'DemonLord', run: (state, actor, input) => demonLordAbilities.apply(state, actor, input) },
    ];
    const slots: Record<string, number> = {
      Mermaid: 2,
      Marauder: 2,
      Zombie: 4,
      Abbess: 4,
      Incub: 1,
      Antipaladin: 3,
      Dracolich: 2,
      DemonLord: 1,
    };
    for (const entry of cases) {
      const heroes = new Map([
        [entry.code, hero(entry.code, { initiative: 99, accuracy: 400, damage: 50, power: 40, mana: 40, maxMana: 40, health: 500 })],
        ['B', hero('B', { initiative: 1, health: 900, armor: 0, dodge: 0, morale: 10 })],
      ]);
      const state = makeState(
        [
          { id: 'a', playerId: 'h', heroClassCode: entry.code, row: 0, pickOrder: 1 },
          { id: 'v', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
          { id: 'hid', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 2 },
        ],
        heroes,
      );
      const actor = unit(state, 'a');
      const hidden = unit(state, 'hid');
      grantEffect(hidden, 'INVISIBLE', 4, 0);
      if (entry.code === 'Abbess') {
        grantEffect(hidden, 'POISON', 3, 1);
        grantEffect(unit(state, 'v'), 'POISON', 3, 1);
      }
      const hp = hidden.health;
      const morale = hidden.morale;
      const result = entry.run(state, actor, { slot: slots[entry.code] as 1, targetId: 'v' });
      expect(result.status).toBe('done');
      expect(hidden.health).toBe(hp);
      expect(hidden.morale).toBe(morale);
      expect(hasEffect(hidden, 'INVISIBLE')).toBe(true);
      if (entry.code === 'Abbess') {
        expect(hasEffect(hidden, 'POISON')).toBe(true);
        expect(hasEffect(unit(state, 'v'), 'POISON')).toBe(false);
      }
    }

    const heroes = new Map([
      ['Abbess', hero('Abbess', { initiative: 99, mana: 20, maxMana: 20, power: 40 })],
      ['B', hero('B', { initiative: 1, health: 80 })],
    ]);
    const state = makeState(
      [
        { id: 'a', playerId: 'h', heroClassCode: 'Abbess', row: 1, pickOrder: 1 },
        { id: 'ally', playerId: 'h', heroClassCode: 'B', row: 1, pickOrder: 2 },
        { id: 'v', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    );
    const ally = unit(state, 'ally');
    ally.health = 20;
    grantEffect(ally, 'INVISIBLE', 3, 0);
    expect(abbessAbilities.apply(state, unit(state, 'a'), { slot: 2, targetId: 'a' }).status).toBe('done');
    expect(ally.health).toBeGreaterThan(20);
    expect(hasEffect(ally, 'INVISIBLE')).toBe(true);
  });

  test('Дрожь земли и рёв не задевают GUARDED, SANCTUM и невидимого', () => {
    randomSpy = spyOn(Math, 'random').mockReturnValue(0);
    const heroes = new Map([
      ['Titan', hero('Titan', { initiative: 99, mana: 20, maxMana: 20, power: 30, damage: 40 })],
      ['DemonLord', hero('DemonLord', { initiative: 99, health: 400, mana: 10 })],
      ['B', hero('B', { initiative: 1, health: 800, armor: 0, dodge: 0, morale: 20, damage: 30 })],
    ]);
    const titan = makeState(
      [
        { id: 'a', playerId: 'h', heroClassCode: 'Titan', row: 0, pickOrder: 1 },
        { id: 'open', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'guard', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 2 },
        { id: 'sanct', playerId: 'g', heroClassCode: 'B', row: 1, pickOrder: 3 },
        { id: 'hid', playerId: 'g', heroClassCode: 'B', row: 1, pickOrder: 4 },
      ],
      heroes,
    );
    grantEffect(unit(titan, 'guard'), 'GUARDED', 2, 0);
    grantEffect(unit(titan, 'sanct'), 'SANCTUM', 2, 0);
    grantEffect(unit(titan, 'hid'), 'INVISIBLE', 2, 0);
    const openHp = unit(titan, 'open').health;
    const guardHp = unit(titan, 'guard').health;
    const sanctHp = unit(titan, 'sanct').health;
    const hidHp = unit(titan, 'hid').health;
    expect(titanAbilities.apply(titan, unit(titan, 'a'), { slot: 5 }).status).toBe('done');
    expect(unit(titan, 'open').health).toBeLessThan(openHp);
    expect(unit(titan, 'guard').health).toBe(guardHp);
    expect(unit(titan, 'sanct').health).toBe(sanctHp);
    expect(unit(titan, 'hid').health).toBe(hidHp);

    const demon = makeState(
      [
        { id: 'a', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 'open', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'guard', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 2 },
        { id: 'hid', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 3 },
      ],
      heroes,
    );
    unit(demon, 'a').health = unit(demon, 'a').maxHp;
    grantEffect(unit(demon, 'guard'), 'GUARDED', 2, 0);
    grantEffect(unit(demon, 'hid'), 'INVISIBLE', 2, 0);
    const openMorale = unit(demon, 'open').morale;
    const guardMorale = unit(demon, 'guard').morale;
    const hidMorale = unit(demon, 'hid').morale;
    expect(demonLordAbilities.apply(demon, unit(demon, 'a'), { slot: 4 }).status).toBe('done');
    expect(unit(demon, 'open').morale).toBeLessThan(openMorale);
    expect(unit(demon, 'guard').morale).toBe(guardMorale);
    expect(unit(demon, 'hid').morale).toBe(hidMorale);
  });

  test('Психический шок: Бес с моралью −200 бьётся с фактором 1', () => {
    const heroes = new Map([
      ['Incub', hero('Incub', { initiative: 99, power: 100, mana: 20, maxMana: 20 })],
      ['Imp', hero('Imp', { initiative: 1, health: 5000, armor: 0 })],
    ]);
    const state = makeState(
      [
        { id: 'a', playerId: 'h', heroClassCode: 'Incub', row: 0, pickOrder: 1 },
        { id: 'imp', playerId: 'g', heroClassCode: 'Imp', row: 0, pickOrder: 1 },
      ],
      heroes,
    );
    const imp = unit(state, 'imp');
    imp.morale = -200;
    imp.resists = {};
    const hp = imp.health;
    expect(incubAbilities.apply(state, unit(state, 'a'), { slot: 1, targetId: 'imp' }).status).toBe('done');
    expect(hp - imp.health).toBe(100);
  });
});

describe('CUT-2026-11-09 AC-21 charge hint matches grant', () => {
  const clocked = [
    'Paladin',
    'DemonLord',
    'Marauder',
    'Werewolf',
    'GhostWarrior',
    'Oracle',
    'BeerElemental',
    'Mermaid',
    'Patriarch',
    'Pyro',
    'Zombie',
    'Assassin',
    'Witch',
    'Titan',
    'Detective',
  ] as const;

  test('«через K» совпадает с начислением на 20 раундах', () => {
    const heroes = new Map(clocked.map((code) => [code, hero(code)]));
    heroes.set('B', hero('B', { initiative: 1 }));
    const picks = clocked.map((code, index) => ({
      id: `u${index}`,
      playerId: 'h',
      heroClassCode: code,
      row: (index < 10 ? 0 : 1) as 0 | 1,
      pickOrder: index + 1,
    }));
    picks.push({ id: 'foe', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 });
    const state = makeState(picks, heroes);
    const units = clocked.map((_, index) => unit(state, `u${index}`));
    const slotOf: Record<string, 1 | 2 | 3 | 4 | 5> = {
      Paladin: 2,
      DemonLord: 5,
      Marauder: 4,
      Werewolf: 4,
      GhostWarrior: 3,
      Oracle: 4,
      BeerElemental: 4,
      Mermaid: 3,
      Patriarch: 4,
      Pyro: 3,
      Zombie: 2,
      Titan: 5,
      Detective: 3,
      Assassin: 4,
      Witch: 1,
    };
    const amount = (item: BattleUnit): number => {
      if (item.heroClassCode === 'Assassin') {
        return item.darts;
      }
      if (item.heroClassCode === 'Witch') {
        return item.gun;
      }
      return item.ultaCharges;
    };
    for (let round = 0; round < 20; round += 1) {
      const before = units.map((item) => ({
        item,
        charges: amount(item),
        k: stepsUntilCharge(item.heroClassCode, item.hiddenLvl, state.stage),
      }));
      for (const row of before) {
        const hint = chargeHintFor(row.item, state, slotOf[row.item.heroClassCode] ?? 1);
        if (row.k == null) {
          expect(hint ?? '').not.toContain('через');
        } else {
          expect(hint).toContain(`через ${row.k}`);
        }
      }
      state.stage += 1;
      for (const item of units) {
        levelUpUnit(item, 1, state);
      }
      for (const row of before) {
        const gained = amount(row.item) - row.charges;
        if (row.k == null) {
          expect(gained).toBe(0);
        } else if (row.k === 1) {
          expect(gained).toBeGreaterThan(0);
        } else {
          expect(gained).toBe(0);
        }
      }
    }
  });
});
