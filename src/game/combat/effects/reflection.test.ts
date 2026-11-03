import { describe, expect, test } from 'bun:test';

import { dealDamage } from '../damage';
import type { BattleState, BattleUnit } from '../types';
import { setEffectState } from './context';
import { delEffect, destroyArmor, grantEffect, hasEffect, tickEffectsOnTurnStart } from './index';

const unit = (overrides: Partial<BattleUnit> = {}): BattleUnit => ({
  id: 'u1',
  playerId: 'p0',
  team: 0,
  heroClassCode: 'A',
  displayName: 'A',
  row: 0,
  column: 0,
  maxHp: 100,
  health: 100,
  damage: 20,
  armor: 30,
  initiative: 10,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 10,
  mana: 5,
  maxMana: 10,
  wasEffected: false,
  lvl: 3,
  hiddenLvl: 3,
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
});

const battle = (units: BattleUnit[]): BattleState => {
  const state = {
    matchId: 'm',
    hostPlayerId: 'p0',
    guestPlayerId: 'p1',
    catalog: {},
    rules: {
      maxTeamSize: 8,
      maxRowSize: 4,
      maxRounds: 20,
      healthBonus: 0.65,
      startingLevel: 1,
      fairEnabled: false,
    },
    stage: 1,
    units,
    doneIds: [],
    delayedIds: [],
    delayedPhase: false,
    activeUnitId: null,
    turnPlayerId: null,
    log: [],
    outcome: 'ongoing' as const,
    winnerPlayerId: null,
    pendingPrompt: null,
    drawOfferByPlayerId: null,
    preChoiceDoneIds: [],
    graveyard: [],
  };
  setEffectState(state);
  return state;
};

describe('REFLECTION', () => {
  test('дебафф уходит случайному врагу без Отражения', () => {
    const bearer = unit({ id: 'b', team: 0, displayName: 'Носитель' });
    const enemy = unit({
      id: 'e',
      team: 1,
      playerId: 'p1',
      displayName: 'Враг',
    });
    battle([bearer, enemy]);
    grantEffect(bearer, 'REFLECTION', 5);
    grantEffect(bearer, 'POISON', 2, 1);

    expect(hasEffect(bearer, 'POISON')).toBe(false);
    expect(hasEffect(enemy, 'POISON')).toBe(true);
  });

  test('если врагов без Отражения нет — дебафф остаётся на носителе', () => {
    const bearer = unit({ id: 'b', team: 0 });
    const enemy = unit({ id: 'e', team: 1, playerId: 'p1' });
    battle([bearer, enemy]);
    grantEffect(bearer, 'REFLECTION', 5);
    grantEffect(enemy, 'REFLECTION', 5);
    grantEffect(bearer, 'SLOW', 2, 15);

    expect(hasEffect(bearer, 'SLOW')).toBe(true);
    expect(hasEffect(enemy, 'SLOW')).toBe(false);
  });
});

describe('REGENMANA / KILLMANA', () => {
  test('REGENMANA восполняет ману на старте хода', () => {
    const u = unit({ mana: 2, maxMana: 10 });
    grantEffect(u, 'REGENMANA', 3, 3);
    const log = tickEffectsOnTurnStart(u);
    expect(u.mana).toBe(5);
    expect(log.some((line) => line.includes('восполняет'))).toBe(true);
  });

  test('KILLMANA снимает ману на старте хода', () => {
    const u = unit({ mana: 5, maxMana: 10 });
    grantEffect(u, 'KILLMANA', 3, 3);
    const log = tickEffectsOnTurnStart(u);
    expect(u.mana).toBe(2);
    expect(log.some((line) => line.includes('теряет'))).toBe(true);
  });
});

describe('DRUNK', () => {
  test('снижает точность и откатывает при снятии', () => {
    const u = unit({ accuracy: 100 });
    grantEffect(u, 'DRUNK', 2, 25);
    expect(u.accuracy).toBe(75);
    delEffect(u, 'DRUNK');
    expect(u.accuracy).toBe(100);
  });
});

describe('POISONEDWEAPON / BREAKWEAPON / destroyArmor', () => {
  test('destroyArmor не опускает броню ниже 0 и учитывает DESTROYARMOR', () => {
    const u = unit({ armor: 12 });
    expect(destroyArmor(u, 20)).toBe(12);
    expect(u.armor).toBe(0);
  });

  test('POISONEDWEAPON накладывает яд после попадания в ближнем бою', () => {
    const attacker = unit({
      id: 'atk',
      team: 0,
      damage: 40,
      accuracy: 1000,
      dodge: 0,
      luck: 0,
    });
    const defender = unit({
      id: 'def',
      team: 1,
      playerId: 'p1',
      health: 100,
      armor: 0,
      dodge: 0,
    });
    const state = battle([attacker, defender]);
    grantEffect(attacker, 'POISONEDWEAPON', 3);
    dealDamage(attacker, defender, { kind: 'melee', forceHit: true }, state);
    expect(hasEffect(defender, 'POISON')).toBe(true);
    expect(state.log.some((line) => line.includes('Яд просачивается'))).toBe(true);
  });

  test('BREAKWEAPON снимает броню после попадания', () => {
    const attacker = unit({
      id: 'atk',
      team: 0,
      damage: 40,
      accuracy: 1000,
      lvl: 3,
    });
    const defender = unit({
      id: 'def',
      team: 1,
      playerId: 'p1',
      health: 100,
      armor: 40,
      dodge: 0,
    });
    const state = battle([attacker, defender]);
    grantEffect(attacker, 'BREAKWEAPON', 3);
    const before = defender.armor;
    dealDamage(attacker, defender, { kind: 'melee', forceHit: true }, state);
    expect(defender.armor).toBe(before - (10 + attacker.lvl));
    expect(state.log.some((line) => line.includes('Руны уничтожают доспех'))).toBe(true);
  });
});
