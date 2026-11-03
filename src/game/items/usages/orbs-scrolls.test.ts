import { afterEach, describe, expect, test } from 'bun:test';

import { grantEffect, hasEffect } from '../../combat/effects';
import { applyAction, createBattleState } from '../../combat/engine';
import type { BattleUnit, HeroClassStats } from '../../combat/types';
import { getItem } from '../catalog';
import { addItem, itemCount, teamInventory } from '../inventory';
import { clearItemUsagesForTests } from './index';

const ORB_CODES = [233, 323, 343, 353, 363, 413, 433, 513, 523, 613] as const;
const SCROLL_CODES = [334, 354, 404, 434, 444, 454, 474] as const;

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
    matchId: 't8',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      { id: 'h1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
      { id: 'h2', playerId: 'h', heroClassCode: 'Paladin', row: 1, pickOrder: 2 },
      { id: 'g1', playerId: 'g', heroClassCode: 'Assassin', row: 0, pickOrder: 1 },
    ],
    heroes: new Map([
      ['Knight', hero('Knight', { initiative: 20, mana: 8, maxMana: 8 })],
      ['Paladin', hero('Paladin', { initiative: 5 })],
      ['Assassin', hero('Assassin', { initiative: 8 })],
      ['Oracle', hero('Oracle')],
      ['Herbalist', hero('Herbalist')],
      ['Mermaid', hero('Mermaid')],
      ['Specter', hero('Specter')],
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
  state.teams![0]!.inventory = [];
  state.teams![1]!.inventory = [];
  const actor = state.units.find((u) => u.id === state.activeUnitId)!;
  const ally = state.units.find((u) => u.team === actor.team && u.id !== actor.id)!;
  const foe = state.units.find((u) => u.team !== actor.team)!;
  actor.perks = ['ORBS', 'SCROLLS'];
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

describe('orbs + scrolls (T8)', () => {
  test('все коды cat 3/4 покрыты списками', () => {
    for (const code of ORB_CODES) {
      expect(getItem(code)?.category).toBe(3);
    }
    for (const code of SCROLL_CODES) {
      expect(getItem(code)?.category).toBe(4);
    }
    expect(ORB_CODES.length).toBe(10);
    expect(SCROLL_CODES.length).toBe(7);
  });

  test('343 стан через MIND', () => {
    const a = battle();
    addItem(a.state, a.actor.team, 343, 1);
    const original = Math.random;
    Math.random = () => 0; // roll success
    try {
      expect(runItem(a.state, a.actor, 343, a.foe.id).ok).toBe(true);
      expect(a.state.log.some((l) => l.includes('баньши'))).toBe(true);
      // После хода invoker оглушённый враг пропускает ход и STUNNED спадает; иммунитет остаётся.
      expect(hasEffect(a.foe, 'STUN_IMMUNE')).toBe(true);
    } finally {
      Math.random = original;
    }
  });

  test('353 требует morale invoker −150…0', () => {
    const bad = battle();
    bad.actor.morale = 10;
    addItem(bad.state, bad.actor.team, 353, 1);
    expect(runItem(bad.state, bad.actor, 353, bad.foe.id).ok).toBe(false);
    expect(itemCount(bad.state, bad.actor.team, 353)).toBe(1);

    const ok = battle();
    ok.actor.morale = -40;
    const hp = ok.foe.health;
    addItem(ok.state, ok.actor.team, 353, 1);
    expect(runItem(ok.state, ok.actor, 353, ok.foe.id).ok).toBe(true);
    expect(ok.foe.health).toBeLessThan(hp);
  });

  test('363 clearBuffs + WATER 60', () => {
    const a = battle();
    grantEffect(a.foe, 'STRENGTH', 2, 0.25);
    grantEffect(a.foe, 'POISON', 2, 1);
    const hp = a.foe.health;
    addItem(a.state, a.actor.team, 363, 1);
    expect(runItem(a.state, a.actor, 363, a.foe.id).ok).toBe(true);
    expect(hasEffect(a.foe, 'STRENGTH')).toBe(false);
    expect(hasEffect(a.foe, 'POISON')).toBe(true);
    expect(a.foe.health).toBeLessThan(hp);
  });

  test('613 extra turn только если цель уже ходила', () => {
    const bad = battle();
    addItem(bad.state, bad.actor.team, 613, 1);
    expect(runItem(bad.state, bad.actor, 613, bad.ally.id).ok).toBe(false);

    const ok = battle();
    ok.state.doneIds.push(ok.ally.id);
    addItem(ok.state, ok.actor.team, 613, 1);
    expect(runItem(ok.state, ok.actor, 613, ok.ally.id).ok).toBe(true);
    expect(ok.state.doneIds.includes(ok.ally.id)).toBe(false);
  });

  test('323 −30% текущих ОЗ', () => {
    const a = battle();
    a.foe.health = 100;
    addItem(a.state, a.actor.team, 323, 1);
    expect(runItem(a.state, a.actor, 323, a.foe.id).ok).toBe(true);
    expect(a.foe.health).toBe(70);
  });

  test('513 превращение в Oracle/Herbalist/Mermaid', () => {
    const a = battle();
    addItem(a.state, a.actor.team, 513, 1);
    expect(runItem(a.state, a.actor, 513, a.ally.id).ok).toBe(true);
    expect(['Oracle', 'Herbalist', 'Mermaid']).toContain(a.ally.heroClassCode);
  });

  test('433 атака −30%', () => {
    const a = battle();
    const dmg = a.foe.damage;
    addItem(a.state, a.actor.team, 433, 1);
    expect(runItem(a.state, a.actor, 433, a.foe.id).ok).toBe(true);
    expect(a.foe.damage).toBe(Math.round(dmg * 0.7));
  });

  test('413 +2 уровня всей команде', () => {
    const a = battle();
    const lvlA = a.actor.lvl;
    const lvlB = a.ally.lvl;
    addItem(a.state, a.actor.team, 413, 1);
    expect(runItem(a.state, a.actor, 413, a.actor.id).ok).toBe(true);
    expect(a.actor.lvl).toBe(lvlA + 2);
    expect(a.ally.lvl).toBe(lvlB + 2);
  });

  test('523 цель → Specter, полное HP, без эффектов', () => {
    const a = battle();
    grantEffect(a.ally, 'STRENGTH', 2, 0.2);
    a.ally.health = 50;
    addItem(a.state, a.actor.team, 523, 1);
    expect(runItem(a.state, a.actor, 523, a.ally.id).ok).toBe(true);
    expect(a.ally.heroClassCode).toBe('Specter');
    expect(a.ally.health).toBe(a.ally.maxHp);
    expect(hasEffect(a.ally, 'STRENGTH')).toBe(false);
    expect(a.ally.isSummon).toBe(false);
  });

  test('233 develop += 3', () => {
    const a = battle();
    a.foe.develop = 6;
    addItem(a.state, a.actor.team, 233, 1);
    expect(runItem(a.state, a.actor, 233, a.foe.id).ok).toBe(true);
    expect(a.foe.develop).toBe(9);
  });

  test('354/334 резисты и 50% keepTurn', () => {
    const a = battle();
    const fire = a.foe.resists.FIRE?.value ?? 0;
    addItem(a.state, a.actor.team, 354, 1);
    const original = Math.random;
    Math.random = () => 0; // chancePercent(50) → keepTurn
    try {
      expect(runItem(a.state, a.actor, 354, a.foe.id).ok).toBe(true);
      expect(a.foe.resists.FIRE?.value).toBe(fire - (20 + a.actor.lvl));
      expect(a.state.activeUnitId).toBe(a.actor.id);
    } finally {
      Math.random = original;
    }

    const b = battle();
    const air = b.foe.resists.AIR?.value ?? 0;
    addItem(b.state, b.actor.team, 334, 1);
    Math.random = () => 0.99; // no keepTurn
    try {
      expect(runItem(b.state, b.actor, 334, b.foe.id).ok).toBe(true);
      expect(b.foe.resists.AIR?.value).toBe(air - (20 + b.actor.lvl));
      expect(b.state.activeUnitId).not.toBe(b.actor.id);
    } finally {
      Math.random = original;
    }
  });

  test('474 броня + вард WEAPON, 50% keepTurn', () => {
    const a = battle();
    const arm = a.ally.armor;
    addItem(a.state, a.actor.team, 474, 1);
    const original = Math.random;
    Math.random = () => 0;
    try {
      expect(runItem(a.state, a.actor, 474, a.ally.id).ok).toBe(true);
      expect(a.ally.armor).toBe(arm + 15 + a.actor.lvl * 3);
      expect((a.ally.resists.WEAPON?.wardCharges ?? 0) > 0).toBe(true);
      expect(a.state.activeUnitId).toBe(a.actor.id);
    } finally {
      Math.random = original;
    }
  });

  test('444 уничтожает до 2 предметов; пусто — отказ', () => {
    const empty = battle();
    addItem(empty.state, empty.actor.team, 444, 1);
    expect(runItem(empty.state, empty.actor, 444, empty.foe.id).ok).toBe(false);
    expect(itemCount(empty.state, empty.actor.team, 444)).toBe(1);

    const ok = battle();
    addItem(ok.state, ok.foe.team, 107, 1);
    addItem(ok.state, ok.foe.team, 117, 1);
    addItem(ok.state, ok.foe.team, 187, 1);
    addItem(ok.state, ok.actor.team, 444, 1);
    expect(runItem(ok.state, ok.actor, 444, ok.foe.id).ok).toBe(true);
    expect(teamInventory(ok.state, ok.foe.team).length).toBe(1);
  });

  test('454 −3 уровня и случайный перк', () => {
    const a = battle();
    a.foe.lvl = 5;
    a.foe.hiddenLvl = 5;
    a.foe.perks = ['MISC', 'ORBS'];
    addItem(a.state, a.actor.team, 454, 1);
    expect(runItem(a.state, a.actor, 454, a.foe.id).ok).toBe(true);
    expect(a.foe.lvl).toBe(2);
    expect((a.foe.perks ?? []).length).toBe(1);
  });

  test('434 maxHp / 2', () => {
    const a = battle();
    a.foe.maxHp = 200;
    a.foe.health = 180;
    addItem(a.state, a.actor.team, 434, 1);
    expect(runItem(a.state, a.actor, 434, a.foe.id).ok).toBe(true);
    expect(a.foe.maxHp).toBe(100);
    expect(a.foe.health).toBe(100);
  });

  test('404 урон invoker.mana×10 LIFE, mana // 2', () => {
    const a = battle();
    a.actor.mana = 8;
    const hp = a.foe.health;
    addItem(a.state, a.actor.team, 404, 1);
    expect(runItem(a.state, a.actor, 404, a.foe.id).ok).toBe(true);
    expect(a.actor.mana).toBe(4);
    expect(a.foe.health).toBeLessThan(hp);
  });
});
