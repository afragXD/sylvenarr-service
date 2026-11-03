import { afterEach, describe, expect, test } from 'bun:test';

import { grantEffect, hasEffect } from '../../combat/effects';
import { applyAction, createBattleState } from '../../combat/engine';
import type { BattleUnit, HeroClassStats } from '../../combat/types';
import { addTeamGold, teamGold } from '../../economy';
import { getItem, ITEM_CATALOG } from '../catalog';
import { addItem, itemCount } from '../inventory';
import { clearItemUsagesForTests, getItemUsage } from './index';

const TALISMAN_CODES = [411, 431, 521, 601, 581, 321, 651, 701, 541, 741, 751] as const;
const TECH_CODES = [522, 762, 572, 322, 412, 562, 662, 402, 532, 932] as const;
const STAFF_CODES = [428, 448, 468, 478, 328, 458, 558] as const;
const MILITARY_CODES = [389, 479, 559, 509, 579, 619, 329, 999] as const;

const hero = (code: string, extra: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 200,
  damage: 20,
  armor: 10,
  initiative: 10,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 20,
  mana: 10,
  maxMana: 10,
  gold: 100,
  size: 1,
  ...extra,
});

const SUMMON_HEROES = [
  'Zombie',
  'SkeletonChampion',
  'GhostWarrior',
  'GoblinShaman',
  'Oracle',
  'Herbalist',
  'Specter',
  'Ectoplasm',
  'Mermaid',
  'Pyro',
  'GoblinTrapper',
  'EvilTree',
  'Assassin',
  'GoldGolem',
  'BeerElemental',
] as const;

function battle() {
  const heroes = new Map<string, HeroClassStats>([
    ['Knight', hero('Knight', { initiative: 20 })],
    ['Paladin', hero('Paladin', { initiative: 5 })],
    ['Assassin', hero('Assassin', { initiative: 8 })],
    ...SUMMON_HEROES.map((code) => [code, hero(code)] as const),
  ]);
  const state = createBattleState({
    matchId: 't9',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      { id: 'h1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
      { id: 'h2', playerId: 'h', heroClassCode: 'Paladin', row: 0, pickOrder: 2 },
      { id: 'g1', playerId: 'g', heroClassCode: 'Assassin', row: 0, pickOrder: 1 },
    ],
    heroes,
    rules: {
      maxTeamSize: 8,
      maxRowSize: 4,
      maxRounds: 20,
      healthBonus: 1,
      startingLevel: 1,
      fairEnabled: true,
      goldBonus: 1,
    },
  });
  const actor = state.units.find((u) => u.id === state.activeUnitId)!;
  const ally = state.units.find((u) => u.team === actor.team && u.id !== actor.id)!;
  const foe = state.units.find((u) => u.team !== actor.team)!;
  actor.perks = ['TALISMANS', 'TECHNO', 'STAFFS', 'MILITARY'];
  actor.maxSummons = 3;
  return { state, actor, ally, foe };
}

function runItem(
  state: ReturnType<typeof battle>['state'],
  actor: BattleUnit,
  code: number,
  targetId?: string
) {
  return applyAction(state, {
    playerId: actor.playerId,
    unitId: actor.id,
    action: 'item',
    itemCode: code,
    targetId,
  });
}

afterEach(() => {
  clearItemUsagesForTests();
});

describe('talismans/tech/staffs/military (T9)', () => {
  test('все коды cat 1/2/8/9 покрыты и зарегистрированы', () => {
    for (const code of TALISMAN_CODES) {
      expect(getItem(code)?.category).toBe(1);
    }
    for (const code of TECH_CODES) {
      expect(getItem(code)?.category).toBe(2);
    }
    for (const code of STAFF_CODES) {
      expect(getItem(code)?.category).toBe(8);
    }
    for (const code of MILITARY_CODES) {
      expect(getItem(code)?.category).toBe(9);
    }
    const all = [...TALISMAN_CODES, ...TECH_CODES, ...STAFF_CODES, ...MILITARY_CODES];
    expect(all.length).toBe(36);
    for (const code of all) {
      const outcome = getItemUsage(code)({
        state: battle().state,
        invoker: battle().actor,
        target: battle().actor,
        itemCode: code,
      });
      expect(outcome.status === 'reject' && outcome.message === 'не реализовано').toBe(false);
    }
    for (const item of ITEM_CATALOG) {
      const outcome = getItemUsage(item.code)({
        state: battle().state,
        invoker: battle().actor,
        target: battle().actor,
        itemCode: item.code,
      });
      expect(outcome.status === 'reject' && outcome.message === 'не реализовано').toBe(false);
    }
  });

  test('411 призыв по уровню', () => {
    const low = battle();
    low.actor.lvl = 3;
    addItem(low.state, low.actor.team, 411, 1);
    expect(runItem(low.state, low.actor, 411, low.actor.id).ok).toBe(true);
    expect(low.state.units.some((u) => u.isSummon && u.heroClassCode === 'Zombie')).toBe(true);

    const mid = battle();
    mid.actor.lvl = 8;
    mid.actor.hiddenLvl = 8;
    addItem(mid.state, mid.actor.team, 411, 1);
    expect(runItem(mid.state, mid.actor, 411, mid.actor.id).ok).toBe(true);
    expect(mid.state.units.some((u) => u.isSummon && u.heroClassCode === 'SkeletonChampion')).toBe(
      true
    );
  });

  test('751 Assassin deathNote=20', () => {
    const a = battle();
    addItem(a.state, a.actor.team, 751, 1);
    expect(runItem(a.state, a.actor, 751, a.actor.id).ok).toBe(true);
    const summon = a.state.units.find((u) => u.isSummon && u.heroClassCode === 'Assassin');
    expect(summon?.deathNote).toBe(20);
  });

  test('остальные талисманы-призывы', () => {
    const pairs: Array<[number, string]> = [
      [431, 'GoblinShaman'],
      [521, 'Oracle'],
      [601, 'Herbalist'],
      [581, 'Specter'],
      [321, 'Ectoplasm'],
      [651, 'Mermaid'],
      [701, 'Pyro'],
      [541, 'GoblinTrapper'],
      [741, 'EvilTree'],
    ];
    for (const [code, cls] of pairs) {
      const a = battle();
      addItem(a.state, a.actor.team, code, 1);
      expect(runItem(a.state, a.actor, code, a.actor.id).ok).toBe(true);
      expect(a.state.units.some((u) => u.isSummon && u.heroClassCode === cls)).toBe(true);
    }
  });

  test('322 урон по ряду', () => {
    const a = battle();
    const hp = a.foe.health;
    addItem(a.state, a.actor.team, 322, 1);
    expect(runItem(a.state, a.actor, 322, a.foe.id).ok).toBe(true);
    expect(a.foe.health).toBeLessThanOrEqual(hp - 40);
    expect(a.foe.health).toBeGreaterThanOrEqual(hp - 60);
  });

  test('762 artificial; 522 heal+cleanse; 562 healRate; 412/402/662', () => {
    const a = battle();
    addItem(a.state, a.actor.team, 762, 1);
    expect(runItem(a.state, a.actor, 762, a.ally.id).ok).toBe(true);
    expect(a.ally.artificial).toBe(true);

    const b = battle();
    grantEffect(b.ally, 'POISON', 2, 1);
    b.ally.health = 50;
    addItem(b.state, b.actor.team, 522, 1);
    expect(runItem(b.state, b.actor, 522, b.ally.id).ok).toBe(true);
    expect(hasEffect(b.ally, 'POISON')).toBe(false);
    expect(b.ally.health).toBeGreaterThan(50);

    const c = battle();
    addItem(c.state, c.actor.team, 562, 1);
    expect(runItem(c.state, c.actor, 562, c.foe.id).ok).toBe(true);
    expect(c.foe.healRate).toBe(0.75);

    const d = battle();
    addItem(d.state, d.actor.team, 412, 1);
    expect(runItem(d.state, d.actor, 412, d.ally.id).ok).toBe(true);
    expect(hasEffect(d.ally, 'FIREDWEAPON')).toBe(true);

    const e = battle();
    const stun = e.ally.resists.STUN?.value ?? 0;
    const acc = e.ally.accuracy;
    addItem(e.state, e.actor.team, 402, 1);
    addItem(e.state, e.actor.team, 662, 1);
    expect(runItem(e.state, e.actor, 402, e.ally.id).ok).toBe(true);
    // ход мог смениться — берём нового актора с перками
    const actor2 = e.state.units.find(
      (u) => u.id === e.state.activeUnitId && u.team === e.actor.team
    );
    if (actor2) {
      actor2.perks = e.actor.perks;
      expect(runItem(e.state, actor2, 662, e.ally.id).ok).toBe(true);
    } else {
      // если ход у врага — вызываем handler напрямую
      getItemUsage(662)({
        state: e.state,
        invoker: e.actor,
        target: e.ally,
        itemCode: 662,
      });
    }
    expect(e.ally.resists.STUN?.value).toBe(stun + 50);
    expect(e.ally.accuracy).toBe(acc + 40 + e.actor.lvl);
  });

  test('572/328 призывы; 932 не расходуется; 532 уклонение сохраняет', () => {
    const a = battle();
    addItem(a.state, a.actor.team, 572, 1);
    expect(runItem(a.state, a.actor, 572, a.actor.id).ok).toBe(true);
    expect(a.state.units.some((u) => u.isSummon && u.heroClassCode === 'GoldGolem')).toBe(true);

    const b = battle();
    addItem(b.state, b.actor.team, 328, 1);
    expect(runItem(b.state, b.actor, 328, b.actor.id).ok).toBe(true);
    expect(b.state.units.some((u) => u.isSummon && u.heroClassCode === 'BeerElemental')).toBe(true);

    const c = battle();
    addItem(c.state, c.actor.team, 932, 1);
    const hp = c.foe.health;
    expect(runItem(c.state, c.actor, 932, c.foe.id).ok).toBe(true);
    expect(itemCount(c.state, c.actor.team, 932)).toBe(1);
    expect(c.foe.health).toBe(hp - (75 + c.actor.lvl * 2));

    const d = battle();
    d.foe.dodgeBank = 1;
    addItem(d.state, d.actor.team, 532, 1);
    expect(runItem(d.state, d.actor, 532, d.foe.id).ok).toBe(true);
    expect(itemCount(d.state, d.actor.team, 532)).toBe(1);
  });

  test('448 кража золота; пусто — отказ', () => {
    const empty = battle();
    // обнулить кошелёк врага
    addTeamGold(empty.state, empty.foe.team, -teamGold(empty.state, empty.foe.team));
    addItem(empty.state, empty.actor.team, 448, 1);
    expect(runItem(empty.state, empty.actor, 448, empty.foe.id).ok).toBe(false);

    const ok = battle();
    const beforeInv = teamGold(ok.state, ok.actor.team);
    const beforeFoe = teamGold(ok.state, ok.foe.team);
    addItem(ok.state, ok.actor.team, 448, 1);
    expect(runItem(ok.state, ok.actor, 448, ok.foe.id).ok).toBe(true);
    expect(teamGold(ok.state, ok.actor.team)).toBeGreaterThan(beforeInv);
    expect(teamGold(ok.state, ok.foe.team)).toBeLessThan(beforeFoe);
  });

  test('458/478/468/558/428 посохи', () => {
    const a = battle();
    a.ally.health = 50;
    addItem(a.state, a.actor.team, 458, 1);
    const original = Math.random;
    Math.random = () => 0.99; // fail keep → consume
    try {
      expect(runItem(a.state, a.actor, 458, a.ally.id).ok).toBe(true);
      expect(a.ally.health).toBeGreaterThan(50);
      expect(itemCount(a.state, a.actor.team, 458)).toBe(0);
    } finally {
      Math.random = original;
    }

    const b = battle();
    const arm = b.ally.armor;
    addItem(b.state, b.actor.team, 478, 1);
    Math.random = () => 0; // keep charge
    try {
      expect(runItem(b.state, b.actor, 478, b.ally.id).ok).toBe(true);
      expect(b.ally.armor).toBe(arm + 12 + b.actor.lvl * 3);
      expect(itemCount(b.state, b.actor.team, 478)).toBe(1);
    } finally {
      Math.random = original;
    }

    const c = battle();
    c.foe.armor = 30;
    addItem(c.state, c.actor.team, 468, 1);
    Math.random = () => 0.99;
    try {
      expect(runItem(c.state, c.actor, 468, c.foe.id).ok).toBe(true);
      expect(c.foe.armor).toBeLessThan(30);
    } finally {
      Math.random = original;
    }

    const d = battle();
    const acc = d.ally.accuracy;
    const lvl = d.ally.lvl;
    addItem(d.state, d.actor.team, 558, 1);
    addItem(d.state, d.actor.team, 428, 1);
    Math.random = () => 0.99;
    try {
      expect(runItem(d.state, d.actor, 558, d.ally.id).ok).toBe(true);
      expect(d.ally.accuracy).toBe(acc + 18 + d.actor.lvl);
      const actor2 =
        d.state.units.find((u) => u.id === d.state.activeUnitId && u.team === d.actor.team) ??
        d.actor;
      actor2.perks = d.actor.perks;
      if (d.state.activeUnitId === actor2.id) {
        expect(runItem(d.state, actor2, 428, d.ally.id).ok).toBe(true);
        expect(d.ally.lvl).toBeGreaterThan(lvl);
      } else {
        getItemUsage(428)({
          state: d.state,
          invoker: d.actor,
          target: d.ally,
          itemCode: 428,
        });
        expect(d.ally.lvl).toBeGreaterThan(lvl);
      }
    } finally {
      Math.random = original;
    }
  });

  test('военное дело: ряд/отряд/619/329/999', () => {
    const a = battle();
    const hp = a.actor.health;
    const dmg = a.actor.damage;
    const ini = a.actor.initiative;
    const acc = a.ally.accuracy;
    addItem(a.state, a.actor.team, 389, 1);
    expect(runItem(a.state, a.actor, 389, a.actor.id).ok).toBe(true);
    expect(a.actor.health).toBe(Math.round(hp * 1.4));
    expect(a.actor.maxHp).toBeGreaterThanOrEqual(a.actor.health);

    const b = battle();
    addItem(b.state, b.actor.team, 479, 1);
    expect(runItem(b.state, b.actor, 479, b.actor.id).ok).toBe(true);
    expect(b.actor.damage).toBe(Math.round(dmg * 1.25));

    const c = battle();
    addItem(c.state, c.actor.team, 579, 1);
    expect(runItem(c.state, c.actor, 579, c.actor.id).ok).toBe(true);
    expect(c.actor.initiative).toBe(ini + Math.floor(ini / 2));

    const d = battle();
    addItem(d.state, d.actor.team, 509, 1);
    expect(runItem(d.state, d.actor, 509, d.ally.id).ok).toBe(true);
    expect(d.ally.accuracy).toBe(acc + 30 + d.actor.lvl * 2);

    const e = battle();
    e.actor.morale = 10;
    addItem(e.state, e.actor.team, 559, 1);
    expect(runItem(e.state, e.actor, 559, e.actor.id).ok).toBe(true);
    expect(e.actor.morale).toBe(10 + 15 + e.actor.lvl);

    const f = battle();
    addItem(f.state, f.actor.team, 999, 1);
    expect(runItem(f.state, f.actor, 999, f.actor.id).ok).toBe(true);
    expect(f.actor.morale).toBe(65);
    expect(f.actor.accuracy).toBeGreaterThanOrEqual(150);

    const g = battle();
    addItem(g.state, g.actor.team, 329, 1);
    expect(runItem(g.state, g.actor, 329, g.ally.id).ok).toBe(true);
    expect(hasEffect(g.ally, 'BREAKWEAPON')).toBe(true);

    const h = battle();
    addItem(h.state, h.actor.team, 541, 1);
    expect(runItem(h.state, h.actor, 541, h.actor.id).ok).toBe(true);
    const summon = h.state.units.find((u) => u.isSummon)!;
    const masterLvl = h.actor.lvl;
    summon.lvl = 1;
    // ход мог уйти — handler напрямую
    h.actor.perks = ['MILITARY', 'TALISMANS'];
    addItem(h.state, h.actor.team, 619, 1);
    const out = getItemUsage(619)({
      state: h.state,
      invoker: h.actor,
      target: summon,
      itemCode: 619,
    });
    expect(out.status).toBe('done');
    expect(summon.lvl).toBe(masterLvl);
  });
});
