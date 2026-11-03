import { afterEach, describe, expect, test } from 'bun:test';
import { grantEffect, hasEffect } from '../../combat/effects';
import { applyAction, createBattleState, toBattleSummary } from '../../combat/engine';
import type { HeroClassStats } from '../../combat/types';
import { getItem } from '../catalog';
import { addItem, itemCount, teamInventory } from '../inventory';
import { clearItemUsagesForTests } from './index';

const MISC_CODES = [
  107, 117, 137, 147, 167, 187, 197, 207, 217, 227, 237, 247, 257, 267, 287, 297, 307, 317, 337,
  347, 357, 367, 387, 397, 407, 447, 547, 567, 587, 597, 647, 747, 797, 2137, 2187,
] as const;

const hero = (code: string, mana = 10): HeroClassStats => ({
  code,
  displayName: code,
  health: 200,
  damage: 20,
  armor: 10,
  initiative: 10,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 10,
  mana,
  maxMana: mana,
  gold: 100,
  size: 1,
});

function battle() {
  const state = createBattleState({
    matchId: 'misc-t6',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      { id: 'h1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
      { id: 'g1', playerId: 'g', heroClassCode: 'Assassin', row: 0, pickOrder: 1 },
    ],
    heroes: new Map([
      ['Knight', hero('Knight')],
      ['Assassin', hero('Assassin')],
    ]),
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
  // Тесты сами кладут предметы; стартовый инвентарь классов сбрасываем.
  state.teams![0]!.inventory = [];
  state.teams![1]!.inventory = [];
  const actor = state.units.find((u) => u.id === state.activeUnitId)!;
  const foe = state.units.find((u) => u.team !== actor.team)!;
  actor.perks = ['MISC'];
  return { state, actor, foe };
}

function runItem(
  state: ReturnType<typeof battle>['state'],
  actor: ReturnType<typeof battle>['actor'],
  code: number,
  targetId?: string,
  choice?: string
) {
  return applyAction(state, {
    playerId: actor.playerId,
    unitId: actor.id,
    action: 'item',
    itemCode: code,
    targetId,
    choice,
  });
}

afterEach(() => {
  clearItemUsagesForTests();
});

describe('misc item usages (T6)', () => {
  test('все коды категории 7 зарегистрированы в каталоге', () => {
    for (const code of MISC_CODES) {
      expect(getItem(code)?.category).toBe(7);
    }
    expect(MISC_CODES.length).toBe(35);
  });

  test('107 кинжал: прямой урон, ×1.5 по отравленным', () => {
    const { state, actor, foe } = battle();
    addItem(state, actor.team, 107, 1);
    grantEffect(foe, 'POISON', 2, 1);
    const expected = Math.round(1.5 * (20 + actor.lvl));
    expect(runItem(state, actor, 107, foe.id).ok).toBe(true);
    expect(itemCount(state, actor.team, 107)).toBe(0);
    expect(state.log.some((l) => l === `Метательный нож убийцы нанес ${expected} урона.`)).toBe(
      true
    );
    // После хода кинжала очередь может перейти к цели — DoT яда тикает отдельно.
    expect(foe.health).toBeLessThan(200);
  });

  test('217/137 sellOnly', () => {
    for (const code of [217, 137] as const) {
      const { state, actor } = battle();
      addItem(state, actor.team, code, 1);
      const result = runItem(state, actor, code);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('продаж');
      }
      expect(itemCount(state, actor.team, code)).toBe(1);
    }
  });

  test('317 мёд: броня → атака', () => {
    const { state, actor } = battle();
    actor.armor = 10;
    actor.damage = 20;
    addItem(state, actor.team, 317, 1);
    expect(runItem(state, actor, 317, actor.id).ok).toBe(true);
    expect(actor.armor).toBe(0);
    expect(actor.damage).toBe(25);
  });

  test('367 фиктивные ОЗ', () => {
    const { state, actor } = battle();
    const before = actor.health;
    addItem(state, actor.team, 367, 1);
    expect(runItem(state, actor, 367, actor.id).ok).toBe(true);
    expect(hasEffect(actor, 'IMAGINARY_HEALTH')).toBe(true);
    expect(actor.health).toBe(before + 120);
  });

  test('297 вард DESTROYARMOR ×3', () => {
    const { state, actor } = battle();
    addItem(state, actor.team, 297, 1);
    expect(runItem(state, actor, 297, actor.id).ok).toBe(true);
    expect(actor.resists.DESTROYARMOR?.wardCharges).toBe(3);
  });

  test('357 develop −3 и −1 уровень', () => {
    const { state, actor } = battle();
    actor.lvl = 3;
    actor.hiddenLvl = 3;
    actor.develop = 6;
    addItem(state, actor.team, 357, 1);
    expect(runItem(state, actor, 357, actor.id).ok).toBe(true);
    expect(actor.develop).toBe(3);
    expect(actor.lvl).toBe(2);
  });

  test('197 стресс врагу', () => {
    const { state, actor, foe } = battle();
    foe.morale = 0;
    addItem(state, actor.team, 197, 1);
    expect(runItem(state, actor, 197, foe.id).ok).toBe(true);
    expect(foe.morale).toBe(-(20 + actor.lvl));
  });

  test('337 merchant +0.25', () => {
    const { state, actor } = battle();
    addItem(state, actor.team, 337, 1);
    expect(runItem(state, actor, 337, actor.id).ok).toBe(true);
    expect(actor.merchant).toBe(0.25);
  });

  test('207 лунный сахар: luck, 2% смерть применяющего', () => {
    const { state, actor } = battle();
    addItem(state, actor.team, 207, 1);
    const original = Math.random;
    Math.random = () => 0.99; // randInt(1,100)=100 > 2 — без смерти
    try {
      expect(runItem(state, actor, 207, actor.id).ok).toBe(true);
      expect(actor.luck).toBe(12 + 1);
      expect(actor.alive).toBe(true);
    } finally {
      Math.random = original;
    }

    const again = battle();
    addItem(again.state, again.actor.team, 207, 1);
    Math.random = () => 0; // randInt → 1 ≤ 2 — смерть
    try {
      expect(runItem(again.state, again.actor, 207, again.actor.id).ok).toBe(true);
      expect(again.actor.alive).toBe(false);
      expect(again.state.log.some((l) => l.includes('сердечного'))).toBe(true);
    } finally {
      Math.random = original;
    }
  });

  test('407 скуума: critBank + initiative', () => {
    const { state, actor } = battle();
    addItem(state, actor.team, 407, 1);
    const original = Math.random;
    Math.random = () => 0.99;
    try {
      const ini = actor.initiative;
      expect(runItem(state, actor, 407, actor.id).ok).toBe(true);
      expect(actor.critBank).toBe(2);
      expect(actor.initiative).toBe(ini + 10);
    } finally {
      Math.random = original;
    }
  });

  test('187 броня', () => {
    const { state, actor } = battle();
    const arm = actor.armor;
    addItem(state, actor.team, 187, 1);
    expect(runItem(state, actor, 187, actor.id).ok).toBe(true);
    expect(actor.armor).toBe(arm + 16 + actor.lvl * 2);
  });

  test('397 STRENGTH = 50% урона', () => {
    const { state, actor } = battle();
    actor.damage = 40;
    addItem(state, actor.team, 397, 1);
    expect(runItem(state, actor, 397, actor.id).ok).toBe(true);
    const strength = actor.effects.find((e) => e.id === 'STRENGTH');
    expect(strength?.power).toBe(20);
    expect(strength?.rounds).toBe(3);
  });

  test('237/387 лечение', () => {
    const a = battle();
    a.actor.health = 50;
    addItem(a.state, a.actor.team, 237, 1);
    expect(runItem(a.state, a.actor, 237, a.actor.id).ok).toBe(true);
    expect(a.actor.health).toBe(125);

    const b = battle();
    b.actor.health = 10;
    addItem(b.state, b.actor.team, 387, 1);
    expect(runItem(b.state, b.actor, 387, b.actor.id).ok).toBe(true);
    expect(b.actor.health).toBe(160);
  });

  test('2137 яблоко: STONEFLESH + REGENHP', () => {
    const { state, actor } = battle();
    addItem(state, actor.team, 2137, 1);
    expect(runItem(state, actor, 2137, actor.id).ok).toBe(true);
    expect(hasEffect(actor, 'STONEFLESH')).toBe(true);
    expect(hasEffect(actor, 'REGENHP')).toBe(true);
  });

  test('2187 сливняк: атака + DRUNK', () => {
    const { state, actor } = battle();
    const dmg = actor.damage;
    addItem(state, actor.team, 2187, 1);
    expect(runItem(state, actor, 2187, actor.id).ok).toBe(true);
    expect(actor.damage).toBe(dmg + 12 + actor.lvl + Math.floor(actor.lvl / 2));
    expect(hasEffect(actor, 'DRUNK')).toBe(true);
  });

  test('267/287 снятие эффекта + вард', () => {
    const a = battle();
    grantEffect(a.actor, 'FEAR', 2, 1);
    addItem(a.state, a.actor.team, 267, 1);
    expect(runItem(a.state, a.actor, 267, a.actor.id).ok).toBe(true);
    expect(hasEffect(a.actor, 'FEAR')).toBe(false);
    expect(a.actor.resists.MIND?.wardCharges).toBe(1);

    const b = battle();
    grantEffect(b.actor, 'POISON', 2, 1);
    addItem(b.state, b.actor.team, 287, 1);
    expect(runItem(b.state, b.actor, 287, b.actor.id).ok).toBe(true);
    expect(hasEffect(b.actor, 'POISON')).toBe(false);
    expect(b.actor.resists.DEATH?.wardCharges).toBe(1);
  });

  test('147/307 мана', () => {
    const a = battle();
    a.actor.mana = 0;
    a.actor.maxMana = 10;
    addItem(a.state, a.actor.team, 147, 1);
    const original = Math.random;
    Math.random = () => 0; // randInt(3,4)=3
    try {
      expect(runItem(a.state, a.actor, 147, a.actor.id).ok).toBe(true);
      expect(a.actor.mana).toBe(3);
    } finally {
      Math.random = original;
    }

    const b = battle();
    b.actor.mana = 0;
    b.actor.maxMana = 20;
    addItem(b.state, b.actor.team, 307, 1);
    Math.random = () => 0; // randInt(6,9)=6
    try {
      expect(runItem(b.state, b.actor, 307, b.actor.id).ok).toBe(true);
      expect(b.actor.mana).toBe(6);
    } finally {
      Math.random = original;
    }
  });

  test('227 уклонение', () => {
    const { state, actor } = battle();
    addItem(state, actor.team, 227, 1);
    expect(runItem(state, actor, 227, actor.id).ok).toBe(true);
    expect(actor.dodge).toBe(10 + actor.lvl);
  });

  test('117 пиво: мораль', () => {
    const low = battle();
    low.actor.morale = -5;
    addItem(low.state, low.actor.team, 117, 1);
    expect(runItem(low.state, low.actor, 117, low.actor.id).ok).toBe(true);
    expect(low.actor.morale).toBe(-5 + 18 + low.actor.lvl);

    const ok = battle();
    ok.actor.morale = 0;
    addItem(ok.state, ok.actor.team, 117, 1);
    expect(runItem(ok.state, ok.actor, 117, ok.actor.id).ok).toBe(true);
    expect(ok.actor.morale).toBe(12);
  });

  test('247 яд врагу', () => {
    const { state, actor, foe } = battle();
    addItem(state, actor.team, 247, 1);
    expect(runItem(state, actor, 247, foe.id).ok).toBe(true);
    expect(hasEffect(foe, 'POISON')).toBe(true);
  });

  test('257 яд на оружие', () => {
    const { state, actor } = battle();
    addItem(state, actor.team, 257, 1);
    expect(runItem(state, actor, 257, actor.id).ok).toBe(true);
    expect(hasEffect(actor, 'POISONEDWEAPON')).toBe(true);
  });

  test('кейсы 167/447/647/747/547/587/597/567 добавляют предметы', () => {
    const cases: Array<{ code: number; check: (inv: number[]) => void }> = [
      {
        code: 167,
        check: (inv) => expect(inv.some((c) => [3, 4].includes(getItem(c)!.tier))).toBe(true),
      },
      {
        code: 447,
        check: (inv) => expect(inv.some((c) => [5, 6].includes(getItem(c)!.tier))).toBe(true),
      },
      {
        code: 647,
        check: (inv) => expect(inv.some((c) => [7, 8].includes(getItem(c)!.tier))).toBe(true),
      },
      { code: 747, check: (inv) => expect(inv.some((c) => getItem(c)!.tier === 9)).toBe(true) },
      {
        code: 547,
        check: (inv) => expect(inv.some((c) => [2, 6].includes(getItem(c)!.category))).toBe(true),
      },
      {
        code: 587,
        check: (inv) =>
          expect(inv.some((c) => [3, 4, 8].includes(getItem(c)!.category))).toBe(true),
      },
      {
        code: 597,
        check: (inv) => expect(inv.some((c) => [1, 5].includes(getItem(c)!.category))).toBe(true),
      },
      { code: 567, check: (inv) => expect(inv.length).toBe(3) },
    ];
    for (const { code, check } of cases) {
      const { state, actor } = battle();
      addItem(state, actor.team, code, 1);
      expect(runItem(state, actor, code, actor.id).ok).toBe(true);
      // кейс расходуется; среди выпавших может снова оказаться тот же код
      check(teamInventory(state, actor.team));
      expect(toBattleSummary(state).teams[actor.team].inventory.length).toBeGreaterThan(0);
    }
  });

  test('347 мимик: prompt и копирование', () => {
    const { state, actor } = battle();
    addItem(state, actor.team, 347, 1);
    addItem(state, actor.team, 237, 1);
    const open = runItem(state, actor, 347, actor.id);
    expect(open.ok).toBe(true);
    expect(state.pendingPrompt?.kind).toBe('mimic-copy');
    expect(itemCount(state, actor.team, 347)).toBe(1);

    const finish = applyAction(state, {
      playerId: actor.playerId,
      unitId: actor.id,
      action: 'item',
      choice: '237',
    });
    expect(finish.ok).toBe(true);
    expect(itemCount(state, actor.team, 347)).toBe(0);
    expect(itemCount(state, actor.team, 237)).toBe(2);
  });

  test('347 пустой инвентарь — отказ', () => {
    const { state, actor } = battle();
    addItem(state, actor.team, 347, 1);
    const result = runItem(state, actor, 347, actor.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Нечего копировать.');
    }
  });

  test('797 конверт: отказ при низком ОЗ; убийство при полном', () => {
    const low = battle();
    low.actor.health = Math.floor(low.actor.maxHp / 2) - 1;
    addItem(low.state, low.actor.team, 797, 1);
    const reject = runItem(low.state, low.actor, 797, low.foe.id);
    expect(reject.ok).toBe(false);
    expect(itemCount(low.state, low.actor.team, 797)).toBe(1);

    const ok = battle();
    ok.actor.health = ok.actor.maxHp;
    ok.actor.lives = 0;
    ok.foe.lives = 0;
    addItem(ok.state, ok.actor.team, 797, 1);
    expect(runItem(ok.state, ok.actor, 797, ok.foe.id).ok).toBe(true);
    expect(ok.actor.alive).toBe(false);
    expect(ok.foe.alive).toBe(false);
  });
});
