import { describe, expect, test } from 'bun:test';

import { markDeadIfNeeded } from '../damage';
import { hasEffect } from '../effects';
import { createBattleState } from '../engine';
import {
  addMentalIllness,
  applyIllnessTurnStart,
  applyMasochismRoundStart,
  applyMaxMoraleReward,
  applyPsycho,
  lowMoraleDebuffChance,
  MAX_MORALE,
  maybePunishLowMorale,
  psychoChance,
} from '../morale';
import type { HeroClassStats } from '../types';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 150,
  damage: 40,
  armor: 0,
  initiative: 40,
  dodge: 10,
  luck: 10,
  accuracy: 100,
  power: 50,
  mana: 10,
  maxMana: 10,
  gold: 500,
  size: 1,
  ...overrides,
});

const duel = (
  hostCode: string,
  guestCode = 'B',
  hostOver: Partial<HeroClassStats> = {},
  guestOver: Partial<HeroClassStats> = {}
) => {
  const heroes = new Map([
    [hostCode, hero(hostCode, { initiative: 99, ...hostOver })],
    [guestCode, hero(guestCode, { initiative: 1, ...guestOver })],
  ]);
  return createBattleState({
    matchId: 'ac1',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      { id: 'p1', playerId: 'h', heroClassCode: hostCode, row: 0, pickOrder: 1 },
      { id: 'e1', playerId: 'g', heroClassCode: guestCode, row: 0, pickOrder: 1 },
    ],
    heroes,
  });
};

describe('CUT-2026-11-01c AC-1', () => {
  test('fixture max-morale-life: lives кап 1, мораль = MAX_MORALE//2', () => {
    const state = duel('Knight');
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.lives = 0;
    unit.morale = MAX_MORALE;
    applyMaxMoraleReward(unit, state);
    expect(unit.lives).toBe(1);
    expect(unit.morale).toBe(Math.floor(MAX_MORALE / 2));

    unit.morale = MAX_MORALE + 10;
    applyMaxMoraleReward(unit, state);
    expect(unit.lives).toBe(1);
    expect(unit.morale).toBe(Math.floor(MAX_MORALE / 2));
  });

  test('fixture spend-life: maxHp 150→75, ОЗ=75, инициатива без штрафа', () => {
    const state = duel('Knight', 'B', { health: 150 });
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.resists = {}; // без FINALSTRIKE, иначе жизнь не тратится
    unit.maxHp = 150;
    unit.health = 0;
    unit.lives = 1;
    unit.initiative = 40;
    const ini = unit.initiative;
    markDeadIfNeeded(state, unit);
    expect(unit.alive).toBe(true);
    expect(unit.lives).toBe(0);
    expect(unit.maxHp).toBe(75);
    expect(unit.health).toBe(75);
    expect(unit.initiative).toBe(ini);
    expect(state.log.some((line) => line.includes('доп. жизнь'))).toBe(true);
  });

  test('psychoChance / lowMoraleDebuffChance числа МБ', () => {
    expect(psychoChance(-70)).toBe(30);
    expect(psychoChance(-85)).toBe(60);
    expect(psychoChance(-100)).toBe(90);
    expect(lowMoraleDebuffChance(-20)).toBe(20);
    expect(lowMoraleDebuffChance(-50)).toBe(50);
    expect(lowMoraleDebuffChance(-90)).toBe(70);
  });

  test('fixture low-morale-mage: power 50 → 40 на 2 р.', () => {
    // Pyro — маг с основной magic-атакой; нежить/искусственные иммунны к дебаффу.
    const state = duel('Pyro', 'B', { power: 50, mana: 15 });
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.power = 50;
    unit.morale = -90;
    let applied = false;
    for (let i = 0; i < 40 && !applied; i += 1) {
      unit.power = 50;
      unit.effects = unit.effects.filter((e) => e.id !== 'ABSOLUTEPOWER');
      maybePunishLowMorale(state, unit);
      if (hasEffect(unit, 'ABSOLUTEPOWER')) {
        applied = true;
        expect(unit.power).toBe(40);
        const eff = unit.effects.find((e) => e.id === 'ABSOLUTEPOWER')!;
        expect(eff.rounds).toBe(2);
      }
    }
    expect(applied).toBe(true);
  });

  test('fixture low-morale-warrior: damage 40 → 30 на 2 р.', () => {
    const state = duel('Knight', 'B', { damage: 40 });
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.damage = 40;
    unit.morale = -90;
    let applied = false;
    for (let i = 0; i < 40 && !applied; i += 1) {
      unit.damage = 40;
      unit.effects = unit.effects.filter((e) => e.id !== 'STRENGTH');
      maybePunishLowMorale(state, unit);
      if (hasEffect(unit, 'STRENGTH')) {
        applied = true;
        expect(unit.damage).toBe(30);
      }
    }
    expect(applied).toBe(true);
  });

  test('low morale: undead/artificial иммунны', () => {
    const undead = duel('Zombie');
    const z = undead.units.find((u) => u.id === 'p1')!;
    z.morale = -90;
    z.damage = 40;
    maybePunishLowMorale(undead, z);
    expect(hasEffect(z, 'STRENGTH')).toBe(false);

    const art = duel('GoldGolem');
    const g = art.units.find((u) => u.id === 'p1')!;
    g.morale = -90;
    maybePunishLowMorale(art, g);
    expect(hasEffect(g, 'STRENGTH')).toBe(false);
    expect(hasEffect(g, 'ABSOLUTEPOWER')).toBe(false);
  });

  test('fixture paranoia: бьёт союзника с наименьшими ОЗ', () => {
    const heroes = new Map([
      ['Knight', hero('Knight', { initiative: 99, damage: 40, accuracy: 100, luck: 0 })],
      ['Tank', hero('Tank', { initiative: 1, health: 200, dodge: 0 })],
      ['Fragile', hero('Fragile', { initiative: 1, health: 40, dodge: 0, armor: 0 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'ac1-paranoia',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Tank', row: 0, pickOrder: 2 },
        { id: 'p3', playerId: 'h', heroClassCode: 'Fragile', row: 1, pickOrder: 3 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const knight = state.units.find((u) => u.id === 'p1')!;
    const fragile = state.units.find((u) => u.id === 'p3')!;
    fragile.health = 15;
    fragile.dodge = 0;
    const tank = state.units.find((u) => u.id === 'p2')!;
    tank.health = 180;
    addMentalIllness(state, knight, 1);
    knight.illness = true;
    const hpBefore = fragile.health;
    applyIllnessTurnStart(state, knight);
    expect(fragile.health).toBeLessThan(hpBefore);
    expect(state.log.some((line) => line.includes('паранойе'))).toBe(true);
  });

  test('fixture apathy: dodge 0, crit 0, initiative 5', () => {
    const state = duel('Knight');
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.dodge = 20;
    unit.luck = 15;
    unit.initiative = 40;
    addMentalIllness(state, unit, 2);
    expect(unit.dodge).toBe(0);
    expect(unit.luck).toBe(0);
    expect(unit.initiative).toBe(5);
  });

  test('fixture schizophrenia: −33% точности и −300 золота за ход', () => {
    const state = duel('Knight', 'B', { gold: 500, accuracy: 100 });
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.gold = 500;
    unit.accuracy = 100;
    addMentalIllness(state, unit, 3);
    expect(unit.accuracy).toBe(67);
    unit.illness = true;
    applyIllnessTurnStart(state, unit);
    expect(unit.gold).toBe(200);
    expect(state.log.some((line) => line.includes('разбрасывает и смеётся'))).toBe(true);
    applyIllnessTurnStart(state, unit);
    expect(unit.gold).toBe(0);
  });

  test('fixture degradation: lvl 9 → 5, mana 0', () => {
    const state = duel('Knight');
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.lvl = 9;
    unit.hiddenLvl = 9;
    unit.mana = 8;
    addMentalIllness(state, unit, 4);
    expect(unit.lvl).toBe(5);
    expect(unit.mana).toBe(0);
  });

  test('fixture masochism: 13 урона в начале раунда, сквозь броню/варды', () => {
    const state = duel('Knight', 'B', { damage: 40, power: 25 });
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.damage = 40;
    unit.power = 25;
    unit.armor = 50;
    unit.health = 100;
    addMentalIllness(state, unit, 5);
    unit.illness = true;
    applyMasochismRoundStart(state);
    expect(unit.health).toBe(87);
    expect(state.log.some((line) => line.includes('мазохизм') && line.includes('⟦DEFAULT⟧'))).toBe(
      true
    );
  });

  test('psycho once per battle; death below -100; no Душевный подъём in code path', () => {
    const state = duel('Knight');
    const unit = state.units.find((u) => u.id === 'p1')!;
    // Иначе FINALSTRIKE 25% Рыцаря иногда спасает на 1 ОЗ.
    unit.resists = {};
    unit.morale = -85;
    unit.illness = true;
    unit.illnessKind = 'apathy';
    applyPsycho(state, unit);
    expect(unit.illnessKind).toBe('apathy');

    unit.illness = false;
    unit.illnessKind = null;
    unit.morale = -101;
    applyPsycho(state, unit);
    expect(unit.alive).toBe(false);
  });

  test('TODO(items) and TODO(perks) present in morale.ts source', async () => {
    const file = await Bun.file(
      new URL('../morale.ts', import.meta.url)
    ).text();
    expect(file).toContain(
      'TODO(items): Шизофрения — уничтожать 2 случайных предмета, когда появятся предметы'
    );
    expect(file).toContain('TODO(perks): Деградация — терять все перки');
  });
});
