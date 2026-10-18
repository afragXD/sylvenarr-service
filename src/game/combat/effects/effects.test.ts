import { describe, expect, test } from 'bun:test';

import { dealDamage } from '../damage';
import type { BattleUnit } from '../types';
import { delEffect, grantEffect, hasEffect, healUnit, trySpendMana } from './index';

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
  gold: 0,
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
    const attacker = unit({ id: 'a', health: 40, accuracy: 100, luck: 0, damage: 50 });
    grantEffect(attacker, 'VAMPWEAPON', 2, 0.5);
    const defender = unit({
      id: 'd',
      team: 1,
      health: 100,
      armor: 0,
      dodge: 0,
    });
    const dmg = dealDamage(attacker, defender, {
      damageMult: 1,
      armorIgnore: 0,
      forceHit: true,
    });
    expect(dmg).toBeGreaterThan(0);
    expect(attacker.health).toBeGreaterThan(40);
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
});
