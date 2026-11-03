import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';

import { createSummon } from '../combat/abilities/summon';
import { dealDamage } from '../combat/damage';
import { grantEffect, hasEffect, tryStun } from '../combat/effects';
import { setEffectState } from '../combat/effects/context';
import { applyAction, createBattleState, forceDraw } from '../combat/engine';
import { changeResist } from '../combat/resists';
import type { BattleState, HeroClassStats } from '../combat/types';
import { addItem, itemCount } from '../items/inventory';
import { getItemUsage } from '../items/usages';
import { applyItemAction } from '../items/use';
import { tryBonusMovementKeepTurn } from './hooks';

const hero = (code: string, extra: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 400,
  damage: 20,
  armor: 0,
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

function duel(fairEnabled: boolean, host = 'A', guest = 'B'): BattleState {
  const state = createBattleState({
    matchId: `review-${fairEnabled ? 'on' : 'off'}`,
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      { id: 'h1', playerId: 'h', heroClassCode: host, row: 0, pickOrder: 1 },
      { id: 'g1', playerId: 'g', heroClassCode: guest, row: 0, pickOrder: 1 },
    ],
    heroes: new Map([
      [host, hero(host, { initiative: 20 })],
      [guest, hero(guest, { initiative: 5 })],
      ['Zombie', hero('Zombie')],
    ]),
    rules: {
      maxTeamSize: 8,
      maxRowSize: 4,
      maxRounds: 20,
      healthBonus: 1,
      startingLevel: 1,
      fairEnabled,
      goldBonus: 1,
    },
  });
  state.teams![0]!.inventory = [];
  state.teams![1]!.inventory = [];
  setEffectState(state);
  return state;
}

const hostUnit = (state: BattleState) => state.units.find((u) => u.id === 'h1')!;
const guestUnit = (state: BattleState) => state.units.find((u) => u.id === 'g1')!;

afterEach(() => {
  mock.restore();
});

describe('пробитие брони юнита', () => {
  const hit = (fairEnabled: boolean) => {
    const state = duel(fairEnabled);
    const atk = hostUnit(state);
    const def = guestUnit(state);
    atk.damage = 120;
    atk.armorPenetration = 0.5;
    def.armor = 100;
    return dealDamage(atk, def, { kind: 'melee', forceHit: true }, state);
  };

  test('при выключенной экономике не учитывается (DemonLord не усиливается)', () => {
    expect(hit(false)).toBeLessThan(30);
  });

  test('при включённой экономике учитывается', () => {
    expect(hit(true)).toBeGreaterThan(60);
  });
});

describe('SIGMALIKE / значение резиста STUN', () => {
  test('при включённой экономике резист 100 блокирует оглушение', () => {
    const state = duel(true);
    const target = guestUnit(state);
    changeResist(target, 'STUN', 100);
    expect(tryStun(state, target, 1)).toBe(false);
    expect(hasEffect(target, 'STUNNED')).toBe(false);
  });

  test('при выключенной экономике значение резиста не читается', () => {
    const state = duel(false);
    const target = guestUnit(state);
    changeResist(target, 'STUN', 100);
    expect(tryStun(state, target, 1)).toBe(true);
  });
});

describe('предметы после ревью', () => {
  test('458 лечит целым числом ОЗ', () => {
    const state = duel(true);
    const invoker = hostUnit(state);
    invoker.damage = 33;
    invoker.power = 0;
    invoker.health = 100;
    getItemUsage(458)({ state, invoker, target: invoker, itemCode: 458 });
    expect(Number.isInteger(invoker.health)).toBe(true);
    expect(invoker.health).toBe(120);
  });

  test('558 и 458: шанс сохранить посох считается от уровня применившего', () => {
    spyOn(Math, 'random').mockReturnValue(0.995);
    const state = duel(true);
    const invoker = hostUnit(state);
    const target = state.units.find((u) => u.id === 'h1')!;
    invoker.lvl = 1;
    target.power = 0;
    const lowLvl = getItemUsage(558)({ state, invoker, target, itemCode: 558 });
    expect(lowLvl.status === 'done' && lowLvl.consume !== false).toBe(true);
    invoker.lvl = 100;
    const highLvl = getItemUsage(558)({ state, invoker, target, itemCode: 558 });
    expect(highLvl.status === 'done' && highLvl.consume === false).toBe(true);
  });

  test('655: пустое кладбище — отказ без траты', () => {
    const state = duel(true);
    const invoker = hostUnit(state);
    const outcome = getItemUsage(655)({ state, invoker, target: invoker, itemCode: 655 });
    expect(outcome.status).toBe('reject');
    expect(state.pendingPrompt).toBeNull();
  });

  test('655: «Выйти из меню» не тратит ни предмет, ни ход', () => {
    const state = duel(true);
    const invoker = hostUnit(state);
    invoker.perks = ['RELICS'];
    addItem(state, invoker.team, 655, 1);
    const outcome = getItemUsage(655)({
      state,
      invoker,
      target: invoker,
      itemCode: 655,
      choice: 'cancel',
    });
    expect(outcome).toEqual({ status: 'done', consume: false, keepTurn: true });
    expect(itemCount(state, invoker.team, 655)).toBe(1);
  });

  test('343: оглушает даже при STUN_IMMUNE', () => {
    spyOn(Math, 'random').mockReturnValue(0);
    const state = duel(true);
    const invoker = hostUnit(state);
    const target = guestUnit(state);
    grantEffect(target, 'STUN_IMMUNE', 3, 100);
    getItemUsage(343)({ state, invoker, target, itemCode: 343 });
    expect(hasEffect(target, 'STUNNED')).toBe(true);
  });

  test('347: в меню есть «Отмена», она не тратит мимика', () => {
    const state = duel(true);
    const invoker = hostUnit(state);
    addItem(state, invoker.team, 347, 1);
    addItem(state, invoker.team, 117, 1);
    getItemUsage(347)({ state, invoker, target: invoker, itemCode: 347 });
    expect(state.pendingPrompt?.options.some((o) => o.id === 'cancel')).toBe(true);
    const outcome = getItemUsage(347)({
      state,
      invoker,
      target: invoker,
      itemCode: 347,
      choice: 'cancel',
    });
    expect(outcome).toEqual({ status: 'done', consume: false, keepTurn: true });
    expect(state.pendingPrompt).toBeNull();
  });

  test('LUDOMANIA: кейс не тратит ход', () => {
    const state = duel(true);
    const invoker = hostUnit(state);
    invoker.perks = ['MISC', 'LUDOMANIA'];
    addItem(state, invoker.team, 167, 1);
    const result = applyItemAction(state, invoker, { itemCode: 167 });
    expect(result.ok && result.keepTurn).toBe(true);
  });

  test('DOUBLE_USING_INVENTORY: при удачном броске ход сохраняется', () => {
    spyOn(Math, 'random').mockReturnValue(0);
    const state = duel(true);
    const invoker = hostUnit(state);
    invoker.perks = ['MISC', 'DOUBLE_USING_INVENTORY'];
    addItem(state, invoker.team, 117, 1);
    const result = applyItemAction(state, invoker, { itemCode: 117, targetId: invoker.id });
    expect(result.ok && result.keepTurn).toBe(true);
  });
});

describe('перки и фазы после ревью', () => {
  test('LOWHP_EXTRATURN: «ждать» в доп. ходе сбрасывает флаг', () => {
    const state = duel(true);
    const actor = state.units.find((u) => u.id === state.activeUnitId)!;
    actor.lowHpExtraTurn = true;
    expect(
      applyAction(state, { playerId: actor.playerId, unitId: actor.id, action: 'wait' }).ok
    ).toBe(true);
    expect(actor.lowHpExtraTurn).toBe(false);
  });

  test('BONUS_MOVEMENT: при удачном броске ход после перемещения сохраняется', () => {
    spyOn(Math, 'random').mockReturnValue(0);
    const state = duel(true);
    const actor = hostUnit(state);
    actor.perks = ['BONUS_MOVEMENT'];
    expect(tryBonusMovementKeepTurn(state, actor)).toBe(true);
    actor.perks = [];
    expect(tryBonusMovementKeepTurn(state, actor)).toBe(false);
  });

  test('DARK_CREATURES_SLAYER: ×1,2 в ближнем бою по нежити', () => {
    const state = duel(true, 'A', 'Zombie');
    const atk = hostUnit(state);
    const def = guestUnit(state);
    atk.damage = 100;
    def.armor = 0;
    def.resists = {};
    const base = dealDamage(atk, def, { kind: 'melee', forceHit: true }, state);
    def.health = def.maxHp;
    atk.perks = ['DARK_CREATURES_SLAYER'];
    const slayer = dealDamage(atk, def, { kind: 'melee', forceHit: true }, state);
    expect(slayer).toBeGreaterThanOrEqual(Math.round(base * 1.15));
  });

  test('ничья во время фазы перков сбрасывает фазу, предложения и ярмарку', () => {
    const state = duel(true);
    state.phase = 'perks';
    state.perkOffers = [];
    forceDraw(state);
    expect(state.outcome).toBe('draw');
    expect(state.phase as string).toBe('combat');
    expect(state.perkOffers).toBeNull();
    expect(state.fair).toBeNull();
  });

  test('саммон при включённой экономике получает базовый MISC', () => {
    const state = duel(true);
    const master = hostUnit(state);
    master.maxSummons = 2;
    const summon = createSummon(state, { summoner: master, heroCode: 'Zombie', row: 1 });
    expect(summon?.perks).toEqual(['MISC']);
  });

  test('Отражение пишет в лог, на кого ушёл дебафф', () => {
    const state = duel(true);
    const bearer = hostUnit(state);
    const foe = guestUnit(state);
    grantEffect(bearer, 'REFLECTION', 3);
    grantEffect(bearer, 'POISON', 2, 1.2);
    expect(hasEffect(foe, 'POISON')).toBe(true);
    expect(state.log.some((l) => l.includes(`переходит на ${foe.displayName}`))).toBe(true);
  });
});
