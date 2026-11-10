import { afterEach, describe, expect, spyOn, test } from 'bun:test';

import {
  delEffect,
  grantEffect,
  hasEffect,
  tickEffectsOnTurnEnd,
  tickEffectsOnTurnStart,
} from '../effects';
import { createBattleState } from '../engine';
import { levelUpUnit } from '../level';
import { normalizeUnit } from '../morale';
import type { BattleState, BattleUnit, HeroClassStats } from '../types';
import { abbessAbilities } from './abbess';
import { demonLordAbilities } from './demon-lord';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 400,
  damage: 40,
  armor: 10,
  initiative: 10,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 40,
  mana: 30,
  maxMana: 30,
  gold: 400,
  size: 1,
  ...overrides,
});

const rules = {
  maxTeamSize: 20,
  maxRowSize: 20,
  maxRounds: 40,
  healthBonus: 1,
  startingLevel: 1,
  fairEnabled: false,
  goldBonus: 1,
};

function makeState(
  picks: Array<{ id: string; playerId: string; heroClassCode: string; row: 0 | 1; pickOrder: number }>,
  heroes: Map<string, HeroClassStats>,
): BattleState {
  return createBattleState({
    matchId: 'r5',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks,
    heroes,
    rules,
  });
}

function unit(state: BattleState, id: string): BattleUnit {
  const found = state.units.find((item) => item.id === id);
  if (!found) {
    throw new Error(id);
  }
  return found;
}

/**
 * CUT-2026-11-09 r5: один раунд носителя = один start+end, плюс N «Ждать»
 * (доп. start+end без сброса wasEffected / effectsAgedThisRound).
 * Важно: симуляция тиками, не applyAction(wait) — см. отчёт AC-20.
 */
function runCarrierRound(
  carrier: BattleUnit,
  state: BattleState,
  opts: { waits?: number; resetFlags?: boolean } = {}
): void {
  const waits = opts.waits ?? 0;
  if (opts.resetFlags !== false) {
    carrier.wasEffected = false;
    carrier.effectsAgedThisRound = false;
  }
  tickEffectsOnTurnStart(carrier);
  tickEffectsOnTurnEnd(carrier, state);
  for (let i = 0; i < waits; i += 1) {
    tickEffectsOnTurnStart(carrier);
    tickEffectsOnTurnEnd(carrier, state);
  }
}

describe('CUT-2026-11-09 r5: срок эффектов раз за раунд носителя', () => {
  const battle = (): { state: BattleState; unit: BattleUnit } => {
    const state = createBattleState({
      matchId: 'cut-r5',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([['Knight', hero('Knight', { health: 500 })]]),
    });
    return { state, unit: state.units.find((u) => u.id === 'p1')! };
  };

  test('BLESSED × одно «Ждать»: ровно 2 раунда', () => {
    // CUT-2026-11-09 AC-11 / r5
    const { state, unit: carrier } = battle();
    grantEffect(carrier, 'BLESSED', 2, 0.5);
    carrier.effects.find((e) => e.id === 'BLESSED')!.fresh = undefined;

    runCarrierRound(carrier, state, { waits: 1 });
    expect(hasEffect(carrier, 'BLESSED')).toBe(true);
    expect(carrier.effects.find((e) => e.id === 'BLESSED')?.rounds).toBe(1);

    runCarrierRound(carrier, state, { waits: 0 });
    expect(hasEffect(carrier, 'BLESSED')).toBe(false);
  });

  test('BLESSED × два «Ждать»: ровно 2 раунда', () => {
    // CUT-2026-11-09 AC-11 / r5
    const { state, unit: carrier } = battle();
    grantEffect(carrier, 'BLESSED', 2, 0.5);
    carrier.effects.find((e) => e.id === 'BLESSED')!.fresh = undefined;

    runCarrierRound(carrier, state, { waits: 2 });
    expect(hasEffect(carrier, 'BLESSED')).toBe(true);
    expect(carrier.effects.find((e) => e.id === 'BLESSED')?.rounds).toBe(1);

    runCarrierRound(carrier, state, { waits: 2 });
    expect(hasEffect(carrier, 'BLESSED')).toBe(false);
  });

  test('BLESSED без «Ждать»: длительность как в r4 (2 раунда)', () => {
    // CUT-2026-11-09 r5 регресс
    const { state, unit: carrier } = battle();
    grantEffect(carrier, 'BLESSED', 2, 0.5);
    carrier.effects.find((e) => e.id === 'BLESSED')!.fresh = undefined;

    runCarrierRound(carrier, state);
    expect(carrier.effects.find((e) => e.id === 'BLESSED')?.rounds).toBe(1);
    runCarrierRound(carrier, state);
    expect(hasEffect(carrier, 'BLESSED')).toBe(false);
  });

  test('HASTE × «Ждать»: срок = длительность, wait не съедает раунд', () => {
    // CUT-2026-11-09 r5 не-DoT
    const { state, unit: carrier } = battle();
    grantEffect(carrier, 'HASTE', 2, 20);
    carrier.effects.find((e) => e.id === 'HASTE')!.fresh = undefined;

    runCarrierRound(carrier, state, { waits: 1 });
    expect(hasEffect(carrier, 'HASTE')).toBe(true);
    expect(carrier.effects.find((e) => e.id === 'HASTE')?.rounds).toBe(1);

    runCarrierRound(carrier, state, { waits: 1 });
    expect(hasEffect(carrier, 'HASTE')).toBe(false);
  });

  test('POISON × «Ждать»: тик и срок раз за раунд', () => {
    // CUT-2026-11-09 r5 DoT
    const { state, unit: carrier } = battle();
    carrier.health = 500;
    carrier.maxHp = 500;
    grantEffect(carrier, 'POISON', 2, 1);
    carrier.effects.find((e) => e.id === 'POISON')!.fresh = undefined;

    let ticks = 0;
    const hp0 = carrier.health;
    runCarrierRound(carrier, state, { waits: 1 });
    if (carrier.health < hp0) {
      ticks += 1;
    }
    expect(ticks).toBe(1);
    expect(hasEffect(carrier, 'POISON')).toBe(true);
    expect(carrier.effects.find((e) => e.id === 'POISON')?.rounds).toBe(1);
    // Второй ход раунда («Ждать») не тикает и не старит.
    expect(carrier.wasEffected).toBe(true);
    expect(carrier.effectsAgedThisRound).toBe(true);

    const hp1 = carrier.health;
    runCarrierRound(carrier, state, { waits: 1 });
    if (carrier.health < hp1) {
      ticks += 1;
    }
    expect(ticks).toBe(2);
    expect(hasEffect(carrier, 'POISON')).toBe(false);
  });

  test('POISON без «Ждать»: 2 тика и спад за 2 раунда', () => {
    // CUT-2026-11-09 r5 регресс DoT
    const { state, unit: carrier } = battle();
    carrier.health = 500;
    carrier.maxHp = 500;
    grantEffect(carrier, 'POISON', 2, 1);
    carrier.effects.find((e) => e.id === 'POISON')!.fresh = undefined;

    let ticks = 0;
    for (let i = 0; i < 2; i += 1) {
      const before = carrier.health;
      runCarrierRound(carrier, state);
      if (carrier.health < before) {
        ticks += 1;
      }
    }
    expect(ticks).toBe(2);
    expect(hasEffect(carrier, 'POISON')).toBe(false);
  });
});

describe('CUT-2026-11-09 r5 AC-4 abbess boundaries', () => {
  let randomSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = undefined;
  });

  test('Перерождение L5: союзник 55% ок / 56% отказ; враг 63% ок / 64% отказ', () => {
    // CUT-2026-11-09 AC-4
    const heroes = new Map([
      ['Abbess', hero('Abbess', { initiative: 99, mana: 40, maxMana: 40, power: 40 })],
      ['Ally', hero('Ally', { initiative: 1, health: 200 })],
      ['Foe', hero('Foe', { initiative: 1, health: 200 })],
    ]);

    const allyOk = makeState(
      [
        { id: 'a', playerId: 'h', heroClassCode: 'Abbess', row: 1, pickOrder: 1 },
        { id: 'ally', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'f', playerId: 'g', heroClassCode: 'Foe', row: 0, pickOrder: 1 },
      ],
      heroes,
    );
    unit(allyOk, 'a').lvl = 5;
    const allyLvl = unit(allyOk, 'ally').lvl;
    randomSpy = spyOn(Math, 'random').mockReturnValue(0.54); // randInt → 55 ≤ 55
    expect(abbessAbilities.apply(allyOk, unit(allyOk, 'a'), { slot: 4, targetId: 'ally' }).status).toBe(
      'done',
    );
    expect(unit(allyOk, 'ally').lvl).toBeGreaterThan(allyLvl);

    randomSpy.mockRestore();
    const allyFail = makeState(
      [
        { id: 'a', playerId: 'h', heroClassCode: 'Abbess', row: 1, pickOrder: 1 },
        { id: 'ally', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'f', playerId: 'g', heroClassCode: 'Foe', row: 0, pickOrder: 1 },
      ],
      heroes,
    );
    unit(allyFail, 'a').lvl = 5;
    const allyLvlFail = unit(allyFail, 'ally').lvl;
    randomSpy = spyOn(Math, 'random').mockReturnValue(0.55); // → 56 > 55
    expect(
      abbessAbilities.apply(allyFail, unit(allyFail, 'a'), { slot: 4, targetId: 'ally' }).status,
    ).toBe('done');
    expect(unit(allyFail, 'ally').lvl).toBe(allyLvlFail);

    randomSpy.mockRestore();
    const foeOk = makeState(
      [
        { id: 'a', playerId: 'h', heroClassCode: 'Abbess', row: 1, pickOrder: 1 },
        { id: 'ally', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'f', playerId: 'g', heroClassCode: 'Foe', row: 0, pickOrder: 1 },
      ],
      heroes,
    );
    const foe = unit(foeOk, 'f');
    foe.initialMaxHp = 200;
    foe.maxHp = 200;
    foe.health = 200;
    foe.resists = {};
    unit(foeOk, 'a').lvl = 5;
    randomSpy = spyOn(Math, 'random').mockReturnValue(0.62); // → 63 ≤ 63
    expect(abbessAbilities.apply(foeOk, unit(foeOk, 'a'), { slot: 4, targetId: 'f' }).status).toBe(
      'done',
    );
    expect(foe.maxHp).toBe(170);

    randomSpy.mockRestore();
    const foeFail = makeState(
      [
        { id: 'a', playerId: 'h', heroClassCode: 'Abbess', row: 1, pickOrder: 1 },
        { id: 'ally', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'f', playerId: 'g', heroClassCode: 'Foe', row: 0, pickOrder: 1 },
      ],
      heroes,
    );
    const foe2 = unit(foeFail, 'f');
    foe2.initialMaxHp = 200;
    foe2.maxHp = 200;
    foe2.health = 200;
    foe2.resists = {};
    unit(foeFail, 'a').lvl = 5;
    randomSpy = spyOn(Math, 'random').mockReturnValue(0.63); // → 64 > 63
    expect(abbessAbilities.apply(foeFail, unit(foeFail, 'a'), { slot: 4, targetId: 'f' }).status).toBe(
      'done',
    );
    expect(foe2.maxHp).toBe(200);
  });

  test('Призыв к оружию: 3 МР и КД 4', () => {
    // CUT-2026-11-09 AC-4
    const state = makeState(
      [
        { id: 'a', playerId: 'h', heroClassCode: 'Abbess', row: 1, pickOrder: 1 },
        { id: 'ally', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'f', playerId: 'g', heroClassCode: 'Foe', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['Abbess', hero('Abbess', { initiative: 99, mana: 10, maxMana: 10 })],
        ['Ally', hero('Ally')],
        ['Foe', hero('Foe')],
      ]),
    );
    const abbess = unit(state, 'a');
    const meta = abbessAbilities.listAbilities(state, abbess).find((item) => item.slot === 5);
    expect(meta?.label).toContain('3 МР');
    expect(meta?.disabledReason).toBeNull();
    expect(abbessAbilities.apply(state, abbess, { slot: 5, targetId: 'ally' }).status).toBe('done');
    expect(abbess.mana).toBe(7);
    expect(abbess.abilityCds?.[5]).toBe(4);
    expect(hasEffect(unit(state, 'ally'), 'CONTR')).toBe(true);
    const metaCd = abbessAbilities.listAbilities(state, abbess).find((item) => item.slot === 5);
    expect(metaCd?.disabledReason).toMatch(/Кулдаун|КД|4/);
  });
});

describe('CUT-2026-11-09 r5 AC-5 DemonLord roar HP', () => {
  let randomSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = undefined;
  });

  test('Рёв L5: при 50% HP бафф союзников; при 51% — давление на врагов', () => {
    // CUT-2026-11-09 AC-5
    const heroes = new Map([
      ['DemonLord', hero('DemonLord', { initiative: 99, damage: 30, health: 400, mana: 20, maxMana: 20 })],
      ['Ally', hero('Ally', { initiative: 1, damage: 20 })],
      ['Foe', hero('Foe', { initiative: 1, health: 300 })],
    ]);

    const low = makeState(
      [
        { id: 'd', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 'ally', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'f', playerId: 'g', heroClassCode: 'Foe', row: 0, pickOrder: 1 },
      ],
      heroes,
    );
    const demonLow = unit(low, 'd');
    demonLow.lvl = 5;
    demonLow.maxHp = 400;
    demonLow.health = 200; // ровно 50%
    randomSpy = spyOn(Math, 'random').mockReturnValue(0);
    expect(demonLordAbilities.apply(low, demonLow, { slot: 4 }).status).toBe('done');
    expect(hasEffect(unit(low, 'ally'), 'STRENGTH')).toBe(true);
    expect(hasEffect(demonLow, 'REGENHP')).toBe(true);
    expect(unit(low, 'f').morale).toBe(0);

    randomSpy.mockRestore();
    const high = makeState(
      [
        { id: 'd', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 'ally', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'f', playerId: 'g', heroClassCode: 'Foe', row: 0, pickOrder: 1 },
      ],
      heroes,
    );
    const demonHigh = unit(high, 'd');
    demonHigh.lvl = 5;
    demonHigh.maxHp = 400;
    demonHigh.health = 204; // 51%
    const foeMorale = unit(high, 'f').morale;
    randomSpy = spyOn(Math, 'random').mockReturnValue(0);
    expect(demonLordAbilities.apply(high, demonHigh, { slot: 4 }).status).toBe('done');
    expect(hasEffect(unit(high, 'ally'), 'STRENGTH')).toBe(false);
    expect(unit(high, 'f').morale).toBeLessThan(foeMorale);
    expect(high.log.some((line) => line.includes('давит на врагов'))).toBe(true);
  });
});

describe('CUT-2026-11-09 r5 AC-19 Witch ammo R5…R20', () => {
  let randomSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = undefined;
  });

  test('R5/10/15/20: +4 каждый, итого +16; патроны не дают лишний урон', () => {
    // CUT-2026-11-09 AC-19
    randomSpy = spyOn(Math, 'random').mockReturnValue(0); // стабильный прирост damage
    const state = makeState(
      [
        { id: 'w', playerId: 'h', heroClassCode: 'Witch', row: 0, pickOrder: 1 },
        { id: 'f', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['Witch', hero('Witch', { initiative: 99, damage: 34 })],
        ['B', hero('B')],
      ]),
    );
    const witch = unit(state, 'w');
    witch.gun = 0;
    witch.lvl = 1;
    witch.hiddenLvl = 1;

    let gunTotal = 0;
    for (const stage of [5, 10, 15, 20]) {
      state.stage = stage;
      const gunBefore = witch.gun;
      levelUpUnit(witch, 1, state);
      expect(witch.gun - gunBefore).toBe(4);
      gunTotal += witch.gun - gunBefore;
    }
    expect(gunTotal).toBe(16);
    expect(witch.gun).toBe(16);

    // Соседний non-ammo stage: тот же прирост damage, gun без изменений.
    const ammo = makeState(
      [
        { id: 'w', playerId: 'h', heroClassCode: 'Witch', row: 0, pickOrder: 1 },
        { id: 'f', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['Witch', hero('Witch', { initiative: 99, damage: 34 })],
        ['B', hero('B')],
      ]),
    );
    const nonAmmo = makeState(
      [
        { id: 'w', playerId: 'h', heroClassCode: 'Witch', row: 0, pickOrder: 1 },
        { id: 'f', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['Witch', hero('Witch', { initiative: 99, damage: 34 })],
        ['B', hero('B')],
      ]),
    );
    const wAmmo = unit(ammo, 'w');
    const wPlain = unit(nonAmmo, 'w');
    wAmmo.lvl = 3;
    wPlain.lvl = 3;
    wAmmo.hiddenLvl = 3;
    wPlain.hiddenLvl = 3;
    wAmmo.damage = 40;
    wPlain.damage = 40;
    wAmmo.gun = 0;
    wPlain.gun = 0;
    ammo.stage = 5;
    nonAmmo.stage = 6;
    const dmgAmmoBefore = wAmmo.damage;
    const dmgPlainBefore = wPlain.damage;
    levelUpUnit(wAmmo, 1, ammo);
    levelUpUnit(wPlain, 1, nonAmmo);
    expect(wAmmo.gun - 0).toBe(4);
    expect(wPlain.gun).toBe(0);
    expect(wAmmo.damage - dmgAmmoBefore).toBe(wPlain.damage - dmgPlainBefore);
  });
});

describe('CUT-2026-11-09 r5 AC-22 ABSOLUTEPOWER', () => {
  test('сила 0 → ABSOLUTEPOWER −1 → normalize → снятие → снова 0', () => {
    // CUT-2026-11-09 AC-22
    const state = makeState(
      [
        { id: 'm', playerId: 'h', heroClassCode: 'Demiurge', row: 0, pickOrder: 1 },
        { id: 'f', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['Demiurge', hero('Demiurge', { power: 0 })],
        ['B', hero('B')],
      ]),
    );
    const mage = unit(state, 'm');
    mage.power = 0;
    grantEffect(mage, 'ABSOLUTEPOWER', 2, -1);
    expect(mage.power).toBe(0);
    normalizeUnit(mage);
    expect(mage.power).toBe(0);
    delEffect(mage, 'ABSOLUTEPOWER');
    expect(mage.power).toBe(0);
  });

  test('отрицательная дельта ABSOLUTEPOWER без дрейфа после снятия', () => {
    // CUT-2026-11-09 AC-22
    const state = makeState(
      [
        { id: 'm', playerId: 'h', heroClassCode: 'Demiurge', row: 0, pickOrder: 1 },
        { id: 'f', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['Demiurge', hero('Demiurge', { power: 20 })],
        ['B', hero('B')],
      ]),
    );
    const mage = unit(state, 'm');
    mage.power = 20;
    grantEffect(mage, 'ABSOLUTEPOWER', 2, -5);
    expect(mage.power).toBe(15);
    normalizeUnit(mage);
    expect(mage.power).toBe(15);
    delEffect(mage, 'ABSOLUTEPOWER');
    expect(mage.power).toBe(20);
  });
});
