import { describe, expect, test } from 'bun:test';

import { dealDamage } from '../damage';
import type { BattleState, BattleUnit } from '../types';
import {
  delEffect,
  grantEffect,
  hasEffect,
  healUnit,
  resurrectUnit,
  tickEffectsOnTurnEnd,
  tickEffectsOnTurnStart,
  trySpendMana,
  tryStun,
} from './index';

const emptyState = (): BattleState =>
  ({
    log: [],
    units: [],
    graveyard: [],
  }) as unknown as BattleState;

const unit = (overrides: Partial<BattleUnit> = {}): BattleUnit => ({
  id: 'u1',
  playerId: 'p',
  team: 0,
  heroClassCode: 'A',
  displayName: 'A',
  row: 0,
  column: 0,
  maxHp: 100,
  health: 50,
  damage: 20,
  armor: 5,
  initiative: 10,
  dodge: 10,
  luck: 5,
  accuracy: 100,
  attackStyle: 'melee',
  power: 10,
  mana: 5,
  maxMana: 5,
  gold: 0,
  wasEffected: false,
  lvl: 1,
  hiddenLvl: 1,
  defending: false,
  alive: true,
  effects: [],
  resists: {},
  isSummon: false,
  summonerId: null,
  horseIsDead: false,
  authority: 0,
  maxSummons: 0,
  cumRage: 0,
  lichGrade: 0,
  isLichSummon: false,
  ultaCharges: 0,
  darts: 0,
  deathNote: 0,
  deathNoteCd: 0,
  gun: 0,
  forbiddenResurrect: false,
  polymorphSavedArmor: -1,
  transformParentCode: null,
  critBank: 0,
  armorPenetration: 0,
  dodgeBank: 0,
  enslavedOriginTeam: null,
  enslavedOriginPlayerId: null,
  morale: 0,
  ...overrides,
});

describe('effects', () => {
  test('BLESSED multiplies heal', () => {
    const u = unit({ health: 50 });
    grantEffect(u, 'BLESSED', 2, 0.5);
    const healed = healUnit(u, 20);
    expect(healed).toBe(30);
  });

  test('FEAR reduces damage and restores on expire', () => {
    const u = unit({ damage: 20 });
    grantEffect(u, 'FEAR', 1, 3);
    expect(u.damage).toBe(17);
    delEffect(u, 'FEAR');
    expect(u.damage).toBe(20);
  });

  test('VAMPWEAPON heals on dealDamage', () => {
    const state = emptyState();
    const attacker = unit({
      id: 'a',
      displayName: 'Ассасин',
      health: 40,
      accuracy: 100,
      luck: 0,
      damage: 50,
    });
    grantEffect(attacker, 'VAMPWEAPON', 2, 0.5);
    const defender = unit({
      id: 'd',
      team: 1,
      health: 100,
      armor: 0,
      dodge: 0,
    });
    const dmg = dealDamage(
      attacker,
      defender,
      { damageMult: 1, armorIgnore: 0, forceHit: true },
      state
    );
    expect(dmg).toBeGreaterThan(0);
    expect(attacker.health).toBeGreaterThan(40);
    expect(state.log.some((line) => line.includes('высасывает'))).toBe(true);
  });

  test('CONTR counters after hit', () => {
    const attacker = unit({
      id: 'a',
      health: 100,
      accuracy: 100,
      luck: 0,
      damage: 10,
      armor: 0,
    });
    const defender = unit({
      id: 'd',
      team: 1,
      health: 100,
      armor: 0,
      dodge: 0,
      accuracy: 100,
      luck: 0,
      damage: 30,
    });
    grantEffect(defender, 'CONTR', 2, 0);
    dealDamage(attacker, defender, { damageMult: 1, armorIgnore: 0, forceHit: true });
    expect(attacker.health).toBeLessThan(100);
  });

  test('SILENCE blocks mana spend', () => {
    const u = unit({ mana: 10 });
    grantEffect(u, 'SILENCE', 2, 0);
    expect(trySpendMana(u, 2)).toBeTruthy();
    expect(u.mana).toBe(10);
  });

  test('STUNNED is detected for turn skip', () => {
    const u = unit();
    grantEffect(u, 'STUNNED', 1, 0);
    expect(hasEffect(u, 'STUNNED')).toBe(true);
  });

  test('VAMPWEAPON 1 раунд: вампиризм работает в свой ход и спадает в его конце', () => {
    const state = emptyState();
    const attacker = unit({ id: 'a', health: 50, maxHp: 100, damage: 20, accuracy: 100 });
    const defender = unit({ id: 'd', team: 1, health: 200, armor: 0, dodge: 0 });
    grantEffect(attacker, 'VAMPWEAPON', 1, 0.5);
    // Начало хода носителя: fresh сбрасывается, эффект жив.
    tickEffectsOnTurnStart(attacker);
    expect(hasEffect(attacker, 'VAMPWEAPON')).toBe(true);
    dealDamage(attacker, defender, { damageMult: 1, armorIgnore: 0, forceHit: true }, state);
    expect(attacker.health).toBeGreaterThan(50);
    // Спадение — в конце хода носителя.
    tickEffectsOnTurnEnd(attacker);
    expect(hasEffect(attacker, 'VAMPWEAPON')).toBe(false);
  });

  test('fresh: self-buff не тикает в конце хода наложения', () => {
    const u = unit();
    grantEffect(u, 'GUARDED', 2, 3);
    tickEffectsOnTurnEnd(u);
    expect(hasEffect(u, 'GUARDED')).toBe(true);
    expect(u.effects.find((effect) => effect.id === 'GUARDED')?.rounds).toBe(2);
    tickEffectsOnTurnStart(u);
    tickEffectsOnTurnEnd(u);
    expect(u.effects.find((effect) => effect.id === 'GUARDED')?.rounds).toBe(1);
  });

  test('tryStun: стан + иммунитет на 2 раунда после него', () => {
    const state = emptyState();
    const u = unit();
    expect(tryStun(state, u, 1)).toBe(true);
    expect(hasEffect(u, 'STUNNED')).toBe(true);
    expect(hasEffect(u, 'STUN_IMMUNE')).toBe(true);
    // Повторный стан блокируется иммунитетом.
    delEffect(u, 'STUNNED');
    expect(tryStun(state, u, 1)).toBe(false);
    expect(hasEffect(u, 'STUNNED')).toBe(false);
    // STUN_IMMUNE (3 р.) спадает через 3 end-тика; дальше стан снова возможен.
    for (let i = 0; i < 3; i += 1) {
      tickEffectsOnTurnStart(u);
      tickEffectsOnTurnEnd(u);
    }
    expect(hasEffect(u, 'STUN_IMMUNE')).toBe(false);
    expect(tryStun(state, u, 1)).toBe(true);
  });

  test('tryStun: вард STUN поглощает оглушение', () => {
    const state = emptyState();
    const u = unit();
    u.resists = { STUN: { value: 0, wardCharges: 1 } };
    expect(tryStun(state, u, 1)).toBe(false);
    expect(hasEffect(u, 'STUNNED')).toBe(false);
    expect(u.resists.STUN?.wardCharges ?? 0).toBe(0);
  });

  test('resurrectUnit: ½ maxHp, ½ инициативы, запрет повторного воскрешения', () => {
    const state = emptyState();
    const u = unit({ alive: false, health: 0, maxHp: 100, initiative: 40 });
    state.graveyard.push({
      unitId: u.id,
      team: 0,
      heroClassCode: 'A',
      displayName: 'A',
      forbiddenResurrect: false,
    });
    resurrectUnit(state, u);
    expect(u.alive).toBe(true);
    expect(u.maxHp).toBe(50);
    expect(u.health).toBe(50);
    expect(u.initiative).toBe(20);
    expect(u.forbiddenResurrect).toBe(true);
    expect(state.graveyard.length).toBe(0);
  });

  test('POISON: дот по формуле бота (power — множитель)', () => {
    const u = unit({ health: 300 });
    grantEffect(u, 'POISON', 2, 1.5);
    const before = u.health;
    tickEffectsOnTurnStart(u);
    const lost = before - u.health;
    // (4..6 + 2 * 6) * 1.5 = 24..27
    expect(lost).toBeGreaterThanOrEqual(24);
    expect(lost).toBeLessThanOrEqual(27);
  });

  test('DoT поглощается вардом цели', () => {
    const u = unit({ health: 300 });
    u.resists = { DEATH: { value: 0, wardCharges: 1 } };
    grantEffect(u, 'POISON', 2, 1.5);
    const before = u.health;
    const log = tickEffectsOnTurnStart(u);
    expect(u.health).toBe(before);
    expect(u.resists.DEATH?.wardCharges ?? 0).toBe(0);
    expect(log.some((line) => line.includes('вард'))).toBe(true);
  });
});
