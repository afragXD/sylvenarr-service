import { describe, expect, test } from 'bun:test';

import type { BattleUnit } from '../types';
import { delEffect, grantEffect } from './index';

const unit = (overrides: Partial<BattleUnit> = {}): BattleUnit =>
  ({
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
    power: 10,
    mana: 5,
    maxMana: 5,
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
    soulShatterCasts: 0,
    darts: 0,
    deathNote: 0,
    deathNoteCd: 0,
    mindCloudCd: 0,
    ectoplasmCd: 0,
    tortureLightningCd: 0,
    telekinesisCd: 0,
    crystalCharmsCd: 0,
    soulShatterCd: 0,
    momentPowerCd: 0,
    gun: 0,
    impPolymorphCd: 0,
    degradationCd: 0,
    darkRitualCd: 0,
    darkVeilCd: 0,
    forbiddenResurrect: false,
    polymorphSavedArmor: -1,
    transformParentCode: null,
    critBank: 0,
    armorPenetration: 0,
    dodgeBank: 0,
    enslavedOriginTeam: null,
    enslavedOriginPlayerId: null,
    morale: 0,
    lives: 0,
    illness: false,
    illnessKind: null,
    ...overrides,
  }) as BattleUnit;

describe('CUT-2026-11-09 AC-22', () => {
  test('маг с атакой 0 после пяти Слабостей остаётся на 0', () => {
    const mage = unit({ damage: 0, heroClassCode: 'Demiurge', displayName: 'Белый маг' });
    for (let i = 0; i < 5; i += 1) {
      grantEffect(mage, 'WEAKNESS', 2, 5);
      delEffect(mage, 'WEAKNESS');
    }
    expect(mage.damage).toBe(0);
  });

  test('воин 30 → 20 → 30', () => {
    const warrior = unit({ damage: 30, displayName: 'Воин' });
    grantEffect(warrior, 'WEAKNESS', 2, 10);
    expect(warrior.damage).toBe(20);
    delEffect(warrior, 'WEAKNESS');
    expect(warrior.damage).toBe(30);
  });

  test('двойное наложение Слабости не даёт дрейфа', () => {
    const warrior = unit({ damage: 30 });
    grantEffect(warrior, 'WEAKNESS', 2, 10);
    grantEffect(warrior, 'WEAKNESS', 2, 10);
    expect(warrior.damage).toBe(20);
    delEffect(warrior, 'WEAKNESS');
    expect(warrior.damage).toBe(30);
  });

  test('SLOW упирается в пол инициативы и возвращает ровно снятое', () => {
    const slow = unit({ initiative: 5 });
    grantEffect(slow, 'SLOW', 2, 15);
    expect(slow.initiative).toBe(1);
    delEffect(slow, 'SLOW');
    expect(slow.initiative).toBe(5);
  });

  test('UNLUCKY, FATMAN, FOCUSED, HASTE, STRENGTH и LUCKY без дрейфа', () => {
    const lucky = unit({ luck: 3, dodge: 4, accuracy: 6, initiative: 8, damage: 9 });
    grantEffect(lucky, 'UNLUCKY', 2, 20);
    expect(lucky.luck).toBe(0);
    delEffect(lucky, 'UNLUCKY');
    expect(lucky.luck).toBe(3);
    grantEffect(lucky, 'FATMAN', 2, 20);
    expect(lucky.dodge).toBe(0);
    delEffect(lucky, 'FATMAN');
    expect(lucky.dodge).toBe(4);
    grantEffect(lucky, 'FOCUSED', 2, 15);
    expect(lucky.accuracy).toBe(21);
    delEffect(lucky, 'FOCUSED');
    expect(lucky.accuracy).toBe(6);
    grantEffect(lucky, 'HASTE', 2, 20);
    expect(lucky.initiative).toBe(28);
    delEffect(lucky, 'HASTE');
    expect(lucky.initiative).toBe(8);
    grantEffect(lucky, 'STRENGTH', 2, 11);
    expect(lucky.damage).toBe(20);
    delEffect(lucky, 'STRENGTH');
    expect(lucky.damage).toBe(9);
    grantEffect(lucky, 'LUCKY', 2, 20);
    expect(lucky.luck).toBe(23);
    delEffect(lucky, 'LUCKY');
    expect(lucky.luck).toBe(3);
  });

  test('INVISIBLE не добавляет уклонение', () => {
    const hidden = unit({ dodge: 7 });
    grantEffect(hidden, 'INVISIBLE', 2, 25);
    expect(hidden.dodge).toBe(7);
    delEffect(hidden, 'INVISIBLE');
    expect(hidden.dodge).toBe(7);
  });
});
