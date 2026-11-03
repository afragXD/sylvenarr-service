import { afterEach, describe, expect, test } from 'bun:test';

import { markDeadIfNeeded } from '../../combat/damage';
import { hasEffect, healUnit } from '../../combat/effects';
import { applyAction, createBattleState } from '../../combat/engine';
import type { BattleUnit, HeroClassStats } from '../../combat/types';
import { addItem, itemCount } from '../inventory';
import { clearItemUsagesForTests } from './index';

const RELIC_CODES = [315, 325, 355, 465, 475, 555, 655, 665, 715, 935] as const;
const ARTIFACT_CODES = [
  216, 246, 276, 346, 356, 406, 456, 466, 476, 516, 566, 576, 616, 636, 646, 736, 906,
] as const;

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

function battle() {
  const state = createBattleState({
    matchId: 't7',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      { id: 'h1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
      { id: 'h2', playerId: 'h', heroClassCode: 'Paladin', row: 1, pickOrder: 2 },
      { id: 'g1', playerId: 'g', heroClassCode: 'Assassin', row: 0, pickOrder: 1 },
    ],
    heroes: new Map([
      ['Knight', hero('Knight', { initiative: 20 })],
      ['Paladin', hero('Paladin', { initiative: 5 })],
      ['Assassin', hero('Assassin', { initiative: 8 })],
      ['Zombie', hero('Zombie', { health: 120 })],
      ['Ectoplasm', hero('Ectoplasm')],
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
  const actor = state.units.find((u) => u.id === state.activeUnitId)!;
  const ally = state.units.find((u) => u.team === actor.team && u.id !== actor.id)!;
  const foe = state.units.find((u) => u.team !== actor.team)!;
  actor.perks = ['RELICS', 'ARTIFACTS'];
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

function makeSummon(
  state: ReturnType<typeof battle>['state'],
  master: BattleUnit,
  code: string,
  id: string
): BattleUnit {
  const base = state.units[0]!;
  const unit: BattleUnit = {
    ...structuredClone({
      ...base,
      effects: [],
      resists: {},
      perks: [],
    }),
    id,
    playerId: master.playerId,
    team: master.team,
    heroClassCode: code,
    displayName: code,
    health: 120,
    maxHp: 120,
    isSummon: true,
    summonerId: master.id,
    alive: true,
    forbiddenResurrect: false,
    lives: 0,
    isMercenary: false,
  };
  state.units.push(unit);
  return unit;
}

afterEach(() => {
  clearItemUsagesForTests();
});

describe('relics + artifacts (T7)', () => {
  test('все коды cat 5/6 покрыты списками', () => {
    expect(RELIC_CODES.length).toBe(10);
    expect(ARTIFACT_CODES.length).toBe(17);
  });

  test('315 индульгенция: вард + резист HOLY', () => {
    const { state, actor } = battle();
    addItem(state, actor.team, 315, 1);
    expect(runItem(state, actor, 315, actor.id).ok).toBe(true);
    expect(actor.resists.HOLY?.wardCharges).toBe(1);
    expect(actor.resists.HOLY?.value).toBe(20);
  });

  test('325 фолиант: +3 уровня', () => {
    const { state, actor } = battle();
    addItem(state, actor.team, 325, 1);
    expect(runItem(state, actor, 325, actor.id).ok).toBe(true);
    expect(actor.lvl).toBe(4);
  });

  test('355/465 перки', () => {
    const a = battle();
    const arm = a.actor.armor;
    addItem(a.state, a.actor.team, 355, 1);
    expect(runItem(a.state, a.actor, 355, a.actor.id).ok).toBe(true);
    expect(a.actor.armor).toBe(arm + 20);
    expect(a.actor.perks).toContain('BONUS_MOVEMENT');

    const b = battle();
    addItem(b.state, b.actor.team, 465, 1);
    expect(runItem(b.state, b.actor, 465, b.actor.id).ok).toBe(true);
    expect(b.actor.perks).toContain('SUMMON_LEVEL_UP');
  });

  test('475 святая вода по нежити-саммону', () => {
    const { state, actor, foe } = battle();
    const zombie = makeSummon(state, foe, 'Zombie', 'z1');
    const before = zombie.health;
    addItem(state, actor.team, 475, 1);
    expect(runItem(state, actor, 475, zombie.id).ok).toBe(true);
    expect(zombie.health).toBe(before - 100);
    expect(state.log.some((l) => l.includes('святой водой'))).toBe(true);
  });

  test('555 Огма: все 9 item-перков', () => {
    const { state, actor } = battle();
    addItem(state, actor.team, 555, 1);
    expect(runItem(state, actor, 555, actor.id).ok).toBe(true);
    for (const id of [
      'TALISMANS',
      'TECHNO',
      'ORBS',
      'SCROLLS',
      'RELICS',
      'ARTIFACTS',
      'MISC',
      'STAFFS',
      'MILITARY',
    ]) {
      expect(actor.perks).toContain(id);
    }
  });

  test('655 кольцо: prompt и воскрешение', () => {
    const { state, actor, ally } = battle();
    ally.health = 0;
    ally.lives = 0;
    markDeadIfNeeded(state, ally, { ignoreSaves: true });
    expect(ally.alive).toBe(false);
    expect(state.graveyard.some((g) => g.unitId === ally.id)).toBe(true);

    addItem(state, actor.team, 655, 1);
    const open = runItem(state, actor, 655, actor.id);
    expect(open.ok).toBe(true);
    expect(state.pendingPrompt?.kind).toBe('pontiff-resurrect');

    const original = Math.random;
    Math.random = () => 0.99;
    try {
      expect(
        applyAction(state, {
          playerId: actor.playerId,
          unitId: actor.id,
          action: 'item',
          choice: ally.id,
        }).ok
      ).toBe(true);
      expect(ally.alive).toBe(true);
      expect(ally.forbiddenResurrect).toBe(false);
      expect(itemCount(state, actor.team, 655)).toBe(0);
    } finally {
      Math.random = original;
    }
  });

  test('665 фиал: maxHp ×1.5', () => {
    const { state, actor } = battle();
    actor.health = 100;
    actor.maxHp = 200;
    addItem(state, actor.team, 665, 1);
    expect(runItem(state, actor, 665, actor.id).ok).toBe(true);
    expect(actor.maxHp).toBe(300);
    expect(actor.health).toBeGreaterThan(100);
  });

  test('715 наёмник не умирает с хозяином', () => {
    const { state, actor } = battle();
    const summon = makeSummon(state, actor, 'Ectoplasm', 'merc');
    addItem(state, actor.team, 715, 1);
    expect(runItem(state, actor, 715, summon.id).ok).toBe(true);
    expect(summon.isMercenary).toBe(true);

    // ход мог уйти — убиваем хозяина напрямую
    actor.health = 0;
    actor.lives = 0;
    markDeadIfNeeded(state, actor, { ignoreSaves: true });
    expect(summon.alive).toBe(true);
  });

  test('935 +3 жизни', () => {
    const { state, actor } = battle();
    addItem(state, actor.team, 935, 1);
    expect(runItem(state, actor, 935, actor.id).ok).toBe(true);
    expect(actor.lives).toBe(3);
  });

  test('346 шлем: MIND + REGENMANA', () => {
    const { state, actor } = battle();
    addItem(state, actor.team, 346, 1);
    expect(runItem(state, actor, 346, actor.id).ok).toBe(true);
    expect(actor.resists.MIND?.value).toBe(20);
    expect(hasEffect(actor, 'REGENMANA')).toBe(true);
  });

  test('476 кираса', () => {
    const { state, actor } = battle();
    const arm = actor.armor;
    addItem(state, actor.team, 476, 1);
    expect(runItem(state, actor, 476, actor.id).ok).toBe(true);
    expect(actor.armor).toBe(arm + 50);
    expect(actor.resists.FIRE?.value).toBe(15);
    expect(actor.resists.DEATH?.value).toBe(15);
  });

  test('516 healRate +0.25', () => {
    const { state, actor } = battle();
    actor.health = 50;
    actor.maxHp = 200;
    addItem(state, actor.team, 516, 1);
    expect(runItem(state, actor, 516, actor.id).ok).toBe(true);
    expect(actor.healRate).toBe(1.25);
    const healed = healUnit(actor, 100);
    expect(healed).toBe(125);
  });

  test('216 амулет: −30% power врагу', () => {
    const { state, actor, foe } = battle();
    foe.power = 100;
    addItem(state, actor.team, 216, 1);
    expect(runItem(state, actor, 216, foe.id).ok).toBe(true);
    expect(foe.power).toBe(70);
  });

  test('406 обмен маной invoker↔target', () => {
    const { state, actor, foe } = battle();
    actor.mana = 3;
    foe.mana = 8;
    addItem(state, actor.team, 406, 1);
    expect(runItem(state, actor, 406, foe.id).ok).toBe(true);
    expect(actor.mana).toBe(8);
    expect(foe.mana).toBe(3);
  });

  test('456/246/276 формулы от invoker.lvl', () => {
    const a = battle();
    a.actor.lvl = 5;
    addItem(a.state, a.actor.team, 456, 1);
    const ini = a.actor.initiative;
    expect(runItem(a.state, a.actor, 456, a.actor.id).ok).toBe(true);
    expect(a.actor.initiative).toBe(ini + 25);

    const b = battle();
    b.actor.lvl = 4;
    addItem(b.state, b.actor.team, 246, 1);
    const pow = b.actor.power;
    expect(runItem(b.state, b.actor, 246, b.actor.id).ok).toBe(true);
    expect(b.actor.power).toBe(pow + 18);

    const c = battle();
    c.actor.lvl = 3;
    addItem(c.state, c.actor.team, 276, 1);
    const luck = c.foe.luck;
    expect(runItem(c.state, c.actor, 276, c.foe.id).ok).toBe(true);
    expect(c.foe.luck).toBe(luck - 18);
  });

  test('466/636/646 эффекты', () => {
    const a = battle();
    addItem(a.state, a.actor.team, 466, 1);
    expect(runItem(a.state, a.actor, 466, a.foe.id).ok).toBe(true);
    expect(hasEffect(a.foe, 'KILLMANA')).toBe(true);

    const b = battle();
    addItem(b.state, b.actor.team, 636, 1);
    expect(runItem(b.state, b.actor, 636, b.actor.id).ok).toBe(true);
    expect(hasEffect(b.actor, 'CONTR')).toBe(true);

    const c = battle();
    addItem(c.state, c.actor.team, 646, 1);
    expect(runItem(c.state, c.actor, 646, c.actor.id).ok).toBe(true);
    expect(hasEffect(c.actor, 'FIRESHIELD')).toBe(true);
  });

  test('566/576 жизни и запрет', () => {
    const a = battle();
    addItem(a.state, a.actor.team, 566, 1);
    expect(runItem(a.state, a.actor, 566, a.actor.id).ok).toBe(true);
    expect(a.actor.lives).toBe(1);

    const b = battle();
    b.foe.lives = 3;
    addItem(b.state, b.actor.team, 576, 1);
    expect(runItem(b.state, b.actor, 576, b.foe.id).ok).toBe(true);
    expect(b.foe.lives).toBe(1);
    expect(b.foe.forbiddenResurrect).toBe(true);
  });

  test('616/736/356/906', () => {
    const a = battle();
    const fs = a.actor.resists.FINALSTRIKE?.value ?? 0;
    addItem(a.state, a.actor.team, 616, 1);
    expect(runItem(a.state, a.actor, 616, a.actor.id).ok).toBe(true);
    expect(a.actor.resists.FINALSTRIKE?.value).toBe(fs + 75);

    const b = battle();
    addItem(b.state, b.actor.team, 736, 1);
    expect(runItem(b.state, b.actor, 736, b.actor.id).ok).toBe(true);
    expect(b.actor.armor).toBe(80);
    expect(b.actor.resists.DESTROYARMOR?.immune).toBe(true);

    const c = battle();
    addItem(c.state, c.actor.team, 356, 1);
    expect(runItem(c.state, c.actor, 356, c.actor.id).ok).toBe(true);
    expect(c.actor.critBank).toBe(2);
    expect(c.actor.dodgeBank).toBe(2);

    const d = battle();
    const w = d.actor.resists.WEAPON?.value ?? 0;
    const f = d.actor.resists.FIRE?.value ?? 0;
    addItem(d.state, d.actor.team, 906, 1);
    expect(runItem(d.state, d.actor, 906, d.actor.id).ok).toBe(true);
    expect(d.actor.resists.WEAPON?.value).toBe(w + 50);
    expect(d.actor.resists.FIRE?.value).toBe(f + 50);
  });
});
