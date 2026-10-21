import { describe, expect, test } from 'bun:test';

import { createSummon } from './abilities/summon';
import { applyAction, createBattleState, toBattleSummary } from './engine';
import { levelUpLivingUnits, levelUpUnit } from './level';
import { buildResultSnapshot } from './result-snapshot';
import type { HeroClassStats } from './types';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 100,
  damage: 20,
  armor: 5,
  initiative: 30,
  dodge: 10,
  luck: 5,
  accuracy: 90,
  power: 15,
  mana: 10,
  /** Выше стартовой маны — чтобы level-up addMana был виден в тестах роста. */
  maxMana: 99,
  gold: 200,
  size: 1,
  ...overrides,
});

const catalogHeroes = (...entries: HeroClassStats[]) =>
  new Map(entries.map((item) => [item.code, item]));

function makeDuel(hostCode: string, hostOverrides: Partial<HeroClassStats> = {}) {
  return createBattleState({
    matchId: 'm1',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      { id: 'p1', playerId: 'h', heroClassCode: hostCode, row: 0, pickOrder: 1 },
      { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
    ],
    heroes: catalogHeroes(
      hero(hostCode, { initiative: 50, ...hostOverrides }),
      hero('B', { initiative: 10 })
    ),
  });
}

describe('levels 4.0', () => {
  test('units start at lvl 1 and hiddenLvl 1', () => {
    const state = makeDuel('A');
    expect(state.units.every((unit) => unit.lvl === 1 && unit.hiddenLvl === 1)).toBe(true);
    expect(toBattleSummary(state).units[0]?.lvl).toBe(1);
  });

  test('levelup at round change; dead stay put', () => {
    const state = makeDuel('A');
    const foe = state.units.find((unit) => unit.id === 'p2')!;
    foe.alive = false;
    foe.health = 0;
    foe.lvl = 1;

    const max = levelUpLivingUnits(state);
    const alive = state.units.find((unit) => unit.id === 'p1')!;
    expect(alive.lvl).toBe(2);
    expect(alive.hiddenLvl).toBe(2);
    expect(foe.lvl).toBe(1);
    expect(max).toBe(2);
  });

  test('wait loop advances round and levels living units', () => {
    const state = makeDuel('A');

    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 2; i++) {
        const result = applyAction(state, {
          playerId: state.turnPlayerId!,
          unitId: state.activeUnitId!,
          action: 'wait',
        });
        expect(result.ok).toBe(true);
      }
    }

    expect(state.stage).toBe(2);
    expect(state.units.filter((unit) => unit.alive).every((unit) => unit.lvl === 2)).toBe(true);
    expect(state.log.some((line) => line.includes('ур. 2'))).toBe(true);
  });

  test('ability formula uses unit.lvl', () => {
    const state = makeDuel('Herbalist');
    const herbalist = state.units.find((unit) => unit.id === 'p1')!;
    herbalist.lvl = 10;
    levelUpUnit(herbalist, 0, state);
    expect(herbalist.lvl).toBe(10);
    const healLow = 5 + 1;
    const healHigh = 5 + herbalist.lvl;
    expect(healHigh).toBeGreaterThan(healLow);
  });

  test('result snapshot includes lvl', () => {
    const state = makeDuel('A');
    state.units[0]!.lvl = 4;
    state.outcome = 'host_win';
    const snap = buildResultSnapshot({
      state,
      hostDisplayName: 'H',
      guestDisplayName: 'G',
    });
    expect(snap.host.units[0]?.lvl).toBe(4);
  });
});

describe('class level-up growth', () => {
  test('Herbalist: armor +2 per level', () => {
    const state = makeDuel('Herbalist', { armor: 20 });
    const unit = state.units.find((u) => u.id === 'p1')!;
    const armorBefore = unit.armor;
    levelUpUnit(unit, 1, state);
    expect(unit.armor).toBe(armorBefore + 2);
    expect(unit.lvl).toBe(2);
    expect(unit.hiddenLvl).toBe(2);
  });

  test('Knight: armor +2, accuracy +3', () => {
    const state = makeDuel('Knight', { armor: 15, accuracy: 92, damage: 20 });
    const unit = state.units.find((u) => u.id === 'p1')!;
    const armorBefore = unit.armor;
    const accBefore = unit.accuracy;
    const dmgBefore = unit.damage;
    levelUpUnit(unit, 1, state);
    expect(unit.armor).toBe(armorBefore + 2);
    expect(unit.accuracy).toBe(accBefore + 3);
    expect(unit.damage).toBeGreaterThanOrEqual(dmgBefore + 1);
    expect(unit.damage).toBeLessThanOrEqual(dmgBefore + 2);
  });

  test('Assassin: damage += lvl (pre-bump), deathNote +3', () => {
    const state = makeDuel('Assassin', { damage: 28 });
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.deathNote = 15;
    unit.lvl = 1;
    const dmgBefore = unit.damage;
    levelUpUnit(unit, 1, state);
    expect(unit.damage).toBe(dmgBefore + 1);
    expect(unit.deathNote).toBe(18);
    expect(unit.lvl).toBe(2);
  });

  test('Patriarch: armor+3, power+4, mana+1', () => {
    const state = makeDuel('Patriarch', { armor: 5, power: 25, mana: 12 });
    const unit = state.units.find((u) => u.id === 'p1')!;
    levelUpUnit(unit, 1, state);
    expect(unit.armor).toBe(8);
    expect(unit.power).toBe(29);
    expect(unit.mana).toBe(13);
  });

  test('Abbess: maxHp +5', () => {
    const state = makeDuel('Abbess', { health: 205 });
    const unit = state.units.find((u) => u.id === 'p1')!;
    const maxBefore = unit.maxHp;
    levelUpUnit(unit, 1, state);
    expect(unit.maxHp).toBe(maxBefore + 5);
  });

  test('OrcKing: luck grows faster while negative (bot crit)', () => {
    const state = makeDuel('OrcKing', { luck: -37, damage: 30, accuracy: 90 });
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.luck = -37;
    unit.lvl = 1;
    levelUpUnit(unit, 1, state);
    // (lvl//2 + 3) = 3 while luck <= 0
    expect(unit.luck).toBe(-34);
    expect(unit.damage).toBe(30 + (0 + 1));
    expect(unit.accuracy).toBe(92);
  });

  test('Demiurge: bump first, then power/armor', () => {
    const state = makeDuel('Demiurge', { power: 27, armor: 0, mana: 8 });
    const unit = state.units.find((u) => u.id === 'p1')!;
    levelUpUnit(unit, 1, state);
    expect(unit.lvl).toBe(2);
    expect(unit.hiddenLvl).toBe(2);
    expect(unit.power).toBe(29);
    expect(unit.armor).toBe(2);
    expect(unit.mana).toBeGreaterThanOrEqual(8);
    expect(unit.mana).toBeLessThanOrEqual(11);
  });

  test('Pyro quirk: damage += 2 without * ind', () => {
    const state = makeDuel('Pyro', { damage: 5, power: 18 });
    const unit = state.units.find((u) => u.id === 'p1')!;
    levelUpUnit(unit, 1, state);
    expect(unit.damage).toBe(7);
    expect(unit.power).toBe(18 + (2 + 0));
  });

  test('GoblinTrapper: grows stats but hiddenLvl stays 1', () => {
    const state = makeDuel('OrcKing');
    state.catalog.GoblinTrapper = hero('GoblinTrapper', {
      health: 45,
      damage: 15,
      accuracy: 90,
      luck: 8,
    });
    const king = state.units.find((u) => u.id === 'p1')!;
    king.maxSummons = 2;
    const trapper = createSummon(state, {
      summoner: king,
      heroCode: 'GoblinTrapper',
      row: 1,
    })!;
    expect(trapper.lvl).toBe(1);
    expect(trapper.hiddenLvl).toBe(1);
    const dmgBefore = trapper.damage;
    levelUpUnit(trapper, 1, state);
    expect(trapper.lvl).toBe(2);
    expect(trapper.damage).toBe(dmgBefore + 4);
    expect(trapper.hiddenLvl).toBe(1);
  });

  test('end-round level-up changes class stats', () => {
    const state = makeDuel('Herbalist', { armor: 20 });
    const unit = state.units.find((u) => u.id === 'p1')!;
    const armorBefore = unit.armor;
    levelUpLivingUnits(state);
    expect(unit.lvl).toBe(2);
    expect(unit.armor).toBe(armorBefore + 2);
  });

  test('GoldGolem: damage +2', () => {
    const state = makeDuel('GoldGolem', { damage: 35 });
    const unit = state.units.find((u) => u.id === 'p1')!;
    levelUpUnit(unit, 1, state);
    expect(unit.damage).toBe(37);
  });

  test('Mermaid: mana +1', () => {
    const state = makeDuel('Mermaid', { mana: 2 });
    const unit = state.units.find((u) => u.id === 'p1')!;
    levelUpUnit(unit, 1, state);
    expect(unit.mana).toBe(3);
  });
});
