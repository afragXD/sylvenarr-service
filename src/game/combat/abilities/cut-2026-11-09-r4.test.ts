import { afterEach, describe, expect, spyOn, test } from 'bun:test';

import { dealDamage } from '../damage';
import {
  delEffect,
  grantEffect,
  hasEffect,
  tickEffectsOnTurnEnd,
  tickEffectsOnTurnStart,
  tryStun,
} from '../effects';
import { createBattleState } from '../engine';
import { levelUpUnit } from '../level';
import { normalizeUnit } from '../morale';
import type { BattleState, BattleUnit, HeroClassStats } from '../types';
import { unitChoiceLabel } from '../transform';
import { abbessAbilities } from './abbess';
import { demonLordAbilities } from './demon-lord';
import { demiurgeAbilities } from './demiurge';
import { knightAbilities } from './knight';
import { oracleAbilities } from './oracle';

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
  size: code === 'DemonLord' || code === 'Titan' || code === 'Dracolich' ? 2 : 1,
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
  extra: Partial<typeof rules> = {},
): BattleState {
  return createBattleState({
    matchId: 'r4',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks,
    heroes,
    rules: { ...rules, ...extra },
  });
}

function unit(state: BattleState, id: string): BattleUnit {
  const found = state.units.find((item) => item.id === id);
  if (!found) {
    throw new Error(id);
  }
  return found;
}

describe('CUT-2026-11-09 r4 AC-22 strength drift', () => {
  test('атака 0 → STRENGTH −1 → normalize → снятие → снова 0', () => {
    // CUT-2026-11-09 AC-22
    const beer = {
      id: 'b',
      damage: 0,
      effects: [] as BattleUnit['effects'],
    } as BattleUnit;
    Object.assign(
      beer,
      unit(
        makeState(
          [
            { id: 'b', playerId: 'h', heroClassCode: 'BeerElemental', row: 0, pickOrder: 1 },
            { id: 'f', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
          ],
          new Map([
            ['BeerElemental', hero('BeerElemental', { damage: 0 })],
            ['B', hero('B')],
          ]),
        ),
        'b',
      ),
    );
    beer.damage = 0;
    grantEffect(beer, 'STRENGTH', 2, -1);
    expect(beer.damage).toBe(0);
    normalizeUnit(beer);
    expect(beer.damage).toBe(0);
    delEffect(beer, 'STRENGTH');
    expect(beer.damage).toBe(0); // CUT-2026-11-09 AC-22 (было +1)
  });
});

describe('CUT-2026-11-09 r4 AC-20 GALL wait ticks', () => {
  function runGallTicks(lvl: number, armorStart: number): { strips: number; armor: number } {
    const state = makeState(
      [
        { id: 'a', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'k', playerId: 'g', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['A', hero('A')],
        ['Knight', hero('Knight', { armor: armorStart, health: 800 })],
      ]),
    );
    const knight = unit(state, 'k');
    knight.armor = armorStart;
    const rounds = 2 + Math.floor(lvl / 8);
    const strip = 3 + Math.floor(lvl / 5);
    grantEffect(knight, 'GALL', rounds, 10 + lvl, { casterLvl: lvl });
    const gall = knight.effects.find((effect) => effect.id === 'GALL')!;
    gall.fresh = undefined;

    let strips = 0;
    // Первый «ход»: тик + end.
    knight.wasEffected = false;
    knight.effectsAgedThisRound = false;
    const armorBefore = knight.armor;
    tickEffectsOnTurnStart(knight, state);
    if (knight.armor < armorBefore) {
      strips += 1;
      expect(armorBefore - knight.armor).toBe(Math.min(strip, armorBefore));
    }
    tickEffectsOnTurnEnd(knight, state);

    // Второй ход того же раунда («Ждать»): без тика, без съедания раунда.
    const roundsAfterFirst = knight.effects.find((effect) => effect.id === 'GALL')?.rounds;
    tickEffectsOnTurnStart(knight, state);
    expect(knight.armor).toBe(armorBefore - Math.min(strip, armorBefore));
    tickEffectsOnTurnEnd(knight, state);
    expect(knight.effects.find((effect) => effect.id === 'GALL')?.rounds).toBe(roundsAfterFirst);

    // Оставшиеся раунды эффекта (по одному тику на раунд).
    while (hasEffect(knight, 'GALL')) {
      // CUT-2026-11-09 r6: новый раунд носителя = stage++.
      knight.wasEffected = false;
      knight.effectsAgedThisRound = false;
      state.stage += 1;
      const before = knight.armor;
      tickEffectsOnTurnStart(knight, state);
      if (knight.armor < before) {
        strips += 1;
      }
      tickEffectsOnTurnEnd(knight, state);
    }
    return { strips, armor: knight.armor };
  }

  test('L10 + два «хода» за раунд → 3 тика, −15 брони', () => {
    // CUT-2026-11-09 AC-20
    const result = runGallTicks(10, 40);
    expect(result.strips).toBe(3);
    expect(result.armor).toBe(25); // 40 − 15
  });

  test('L2 → 2 тика, −6', () => {
    // CUT-2026-11-09 AC-20
    const result = runGallTicks(2, 20);
    expect(result.strips).toBe(2);
    expect(result.armor).toBe(14);
  });

  test('L20 → 4 тика, −28', () => {
    // CUT-2026-11-09 AC-20
    const result = runGallTicks(20, 40);
    expect(result.strips).toBe(4);
    expect(result.armor).toBe(12);
  });

  test('пол брони 0: без ухода в минус и без отката', () => {
    // CUT-2026-11-09 AC-20
    const state = makeState(
      [
        { id: 'a', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'k', playerId: 'g', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['A', hero('A')],
        ['Knight', hero('Knight', { armor: 4, health: 800 })],
      ]),
    );
    const knight = unit(state, 'k');
    knight.armor = 4;
    grantEffect(knight, 'GALL', 3, 20, { casterLvl: 10 });
    const gall = knight.effects.find((effect) => effect.id === 'GALL')!;
    gall.fresh = undefined;
    for (let i = 0; i < 3; i += 1) {
      // CUT-2026-11-09 r6: stage++ между симулируемыми раундами.
      knight.wasEffected = false;
      knight.effectsAgedThisRound = false;
      if (i > 0) {
        state.stage += 1;
      }
      tickEffectsOnTurnStart(knight, state);
      expect(knight.armor).toBeGreaterThanOrEqual(0);
      tickEffectsOnTurnEnd(knight, state);
    }
    expect(knight.armor).toBe(0);
    expect(hasEffect(knight, 'GALL')).toBe(false);
    const armorAfter = knight.armor;
    // Спадание не возвращает броню.
    expect(armorAfter).toBe(0);
  });
});

describe('CUT-2026-11-09 r4 AC-13 spark 7', () => {
  test('воин P0, Оракул L9 → искра Воздухом 7', () => {
    // CUT-2026-11-09 AC-13
    const heroes = new Map([
      ['Oracle', hero('Oracle', { initiative: 99, mana: 20, maxMana: 20 })],
      ['Knight', hero('Knight', { initiative: 1, damage: 30, power: 0, armor: 0 })],
      ['Foe', hero('Foe', { initiative: 1, health: 500, armor: 0, dodge: 0 })],
    ]);
    const state = makeState(
      [
        { id: 'o', playerId: 'h', heroClassCode: 'Oracle', row: 1, pickOrder: 1 },
        { id: 'k', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 2 },
        { id: 'f', playerId: 'g', heroClassCode: 'Foe', row: 0, pickOrder: 1 },
      ],
      heroes,
    );
    const oracle = unit(state, 'o');
    const knight = unit(state, 'k');
    oracle.lvl = 9;
    knight.power = 0;
    expect(oracleAbilities.apply(state, oracle, { slot: 3, targetId: 'k' }).status).toBe('done');
    expect(hasEffect(knight, 'AIRWEAPON')).toBe(true);
    const air = knight.effects.find((effect) => effect.id === 'AIRWEAPON');
    expect(air?.casterLvl).toBe(9);

    const foe = unit(state, 'f');
    const hp = foe.health;
    spyOn(Math, 'random').mockReturnValue(0);
    dealDamage(knight, foe, { kind: 'melee', damageMult: 1, source: 'WEAPON' }, state);
    // Искра: round(0/5+4)+⌊9/3⌋ = 4+3 = 7 поверх удара — в логе AIR.
    expect(state.log.some((line) => line.includes('⟦AIR⟧') && line.includes('7'))).toBe(true);
    expect(foe.health).toBeLessThan(hp);
  });
});

describe('CUT-2026-11-09 r4 AC-7 DemonLord stun %', () => {
  let randomSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = undefined;
  });

  test('при STUN 25% есть отказ и успех; STUN_IMMUNE отказывает без броска', () => {
    // CUT-2026-11-09 AC-7
    const state = makeState(
      [
        { id: 'd', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 't', playerId: 'g', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['DemonLord', hero('DemonLord', { initiative: 99 })],
      ]),
    );
    const target = unit(state, 't');
    target.resists = { STUN: { value: 25 } };

    randomSpy = spyOn(Math, 'random').mockReturnValue(0); // randInt(1,100)=1 ≤ 25 → отказ
    expect(tryStun(state, target, 1)).toBe(false);
    expect(hasEffect(target, 'STUNNED')).toBe(false);

    randomSpy.mockReturnValue(0.99); // → 100 > 25 → успех
    expect(tryStun(state, target, 1)).toBe(true);
    expect(hasEffect(target, 'STUNNED')).toBe(true);

    delEffect(target, 'STUNNED', state);
    delEffect(target, 'STUN_IMMUNE', state);
    grantEffect(target, 'STUN_IMMUNE', 3, 100);
    let rolled = 0;
    randomSpy.mockImplementation(() => {
      rolled += 1;
      return 0.99;
    });
    expect(tryStun(state, target, 1)).toBe(false);
    expect(rolled).toBe(0); // power ≥ 100 — без броска
  });
});

describe('CUT-2026-11-09 r4 AC-10 philosophical stone', () => {
  test('3 МР и КД 2 с ярмаркой и без', () => {
    // CUT-2026-11-09 AC-10
    for (const fairEnabled of [false, true]) {
      const state = makeState(
        [
          { id: 'm', playerId: 'h', heroClassCode: 'Demiurge', row: 0, pickOrder: 1 },
          { id: 'f', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        new Map([
          ['Demiurge', hero('Demiurge', { initiative: 99, mana: 10, maxMana: 10, lvl: 5 })],
          ['B', hero('B')],
        ]),
        { fairEnabled },
      );
      const mage = unit(state, 'm');
      mage.lvl = 5;
      mage.mana = 10;
      const meta = demiurgeAbilities.listAbilities(state, mage).find((item) => item.slot === 5);
      expect(meta?.disabledReason).toBeNull();
      expect(mage.mana).toBe(10);
      expect(demiurgeAbilities.apply(state, mage, { slot: 5 }).status).toBe('done');
      expect(mage.mana).toBe(7);
      expect(mage.abilityCds?.[5]).toBe(2);
      const metaCd = demiurgeAbilities.listAbilities(state, mage).find((item) => item.slot === 5);
      expect(metaCd?.disabledReason).toMatch(/Кулдаун|КД|2/);
    }
  });
});

describe('CUT-2026-11-09 r4 AC-4 abbess chances', () => {
  let randomSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = undefined;
  });

  test('Перерождение: союзник 55% на L5; враг 63%; пол maxHp 50%', () => {
    // CUT-2026-11-09 AC-4
    const heroes = new Map([
      ['Abbess', hero('Abbess', { initiative: 99, mana: 20, maxMana: 20, power: 40 })],
      ['Ally', hero('Ally', { initiative: 1, health: 200 })],
      ['Foe', hero('Foe', { initiative: 1, health: 200 })],
    ]);
    const allyState = makeState(
      [
        { id: 'a', playerId: 'h', heroClassCode: 'Abbess', row: 1, pickOrder: 1 },
        { id: 'ally', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'f', playerId: 'g', heroClassCode: 'Foe', row: 0, pickOrder: 1 },
      ],
      heroes,
    );
    unit(allyState, 'a').lvl = 5;
    randomSpy = spyOn(Math, 'random').mockReturnValue(0); // 1 ≤ 55
    const allyLvl = unit(allyState, 'ally').lvl;
    expect(abbessAbilities.apply(allyState, unit(allyState, 'a'), { slot: 4, targetId: 'ally' }).status).toBe(
      'done',
    );
    expect(unit(allyState, 'ally').lvl).toBeGreaterThan(allyLvl);

    randomSpy.mockRestore();
    const foeState = makeState(
      [
        { id: 'a', playerId: 'h', heroClassCode: 'Abbess', row: 1, pickOrder: 1 },
        { id: 'ally', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'f', playerId: 'g', heroClassCode: 'Foe', row: 0, pickOrder: 1 },
      ],
      heroes,
    );
    const foe = unit(foeState, 'f');
    foe.initialMaxHp = 200;
    foe.maxHp = 200;
    foe.health = 200;
    unit(foeState, 'a').lvl = 5;
    foe.resists = {};
    randomSpy = spyOn(Math, 'random').mockReturnValue(0); // успех 63%
    expect(abbessAbilities.apply(foeState, unit(foeState, 'a'), { slot: 4, targetId: 'f' }).status).toBe(
      'done',
    );
    expect(foe.maxHp).toBe(170); // 200×0.85
    // Пол 50% initialMaxHp: ещё одно сокращение не ниже 100.
    foe.resists = {};
    unit(foeState, 'a').mana = 20;
    unit(foeState, 'a').abilityCds = {};
    abbessAbilities.apply(foeState, unit(foeState, 'a'), { slot: 4, targetId: 'f' });
    expect(foe.maxHp).toBeGreaterThanOrEqual(100);
  });
});

describe('CUT-2026-11-09 r4 AC-5 DemonLord blade/heal/spit', () => {
  let randomSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = undefined;
  });

  test('Клинок ×2/×1; трёхглавый лечит 33% maxHp убитого; промах Плевка даёт HASTE', () => {
    // CUT-2026-11-09 AC-5
    const heroes = new Map([
      ['DemonLord', hero('DemonLord', { initiative: 99, damage: 20, mana: 20, maxMana: 20, health: 400 })],
      ['Front', hero('Front', { initiative: 1, health: 30, armor: 0, dodge: 0 })],
      ['Back', hero('Back', { initiative: 1, health: 500, armor: 0, dodge: 0 })],
      ['Victim', hero('Victim', { initiative: 1, health: 15, armor: 0, dodge: 0 })],
    ]);
    const blade = makeState(
      [
        { id: 'd', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 'f', playerId: 'g', heroClassCode: 'Front', row: 0, pickOrder: 1 },
        { id: 'b', playerId: 'g', heroClassCode: 'Back', row: 1, pickOrder: 2 },
      ],
      heroes,
    );
    unit(blade, 'f').column = 0;
    unit(blade, 'b').column = 0;
    randomSpy = spyOn(Math, 'random').mockReturnValue(0.99);
    expect(demonLordAbilities.apply(blade, unit(blade, 'd'), { slot: 2, targetId: 'f' }).status).toBe('done');
    expect(unit(blade, 'f').alive).toBe(false);
    expect(unit(blade, 'b').health).toBeLessThan(unit(blade, 'b').maxHp); // ×1

    const triple = makeState(
      [
        { id: 'd', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 'v', playerId: 'g', heroClassCode: 'Victim', row: 0, pickOrder: 1 },
      ],
      heroes,
    );
    const demon = unit(triple, 'd');
    demon.health = Math.floor(demon.maxHp / 2);
    const hpBefore = demon.health;
    const victimMax = unit(triple, 'v').maxHp;
    expect(demonLordAbilities.apply(triple, demon, { slot: 1 }).status).toBe('done');
    expect(unit(triple, 'v').alive).toBe(false);
    expect(demon.health - hpBefore).toBe(Math.round(victimMax * 0.33));

    demon.mana = 20;
    const spit = makeState(
      [
        { id: 'd', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 't', playerId: 'g', heroClassCode: 'Back', row: 0, pickOrder: 1 },
      ],
      heroes,
    );
    unit(spit, 't').dodge = 400;
    randomSpy.mockReturnValue(0);
    expect(demonLordAbilities.apply(spit, unit(spit, 'd'), { slot: 3, targetId: 't' }).status).toBe('done');
    expect(hasEffect(unit(spit, 'd'), 'HASTE')).toBe(true);
    expect(spit.log.some((line) => line.includes('промах'))).toBe(true);
  });
});

describe('CUT-2026-11-09 r4 AC-11 knight passive frequency', () => {
  let randomSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = undefined;
  });

  test('65+L%: отказ выше порога, успех на пороге даёт броню', () => {
    // CUT-2026-11-09 AC-11
    const state = makeState(
      [
        { id: 'k', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'f', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['Knight', hero('Knight', { initiative: 99, armor: 10 })],
        ['B', hero('B')],
      ]),
    );
    const knight = unit(state, 'k');
    knight.lvl = 5; // порог 70
    knight.passiveUsed = false;
    randomSpy = spyOn(Math, 'random').mockReturnValue(0.7); // randInt(1,100)=71 > 70 → отказ
    const armorFail = knight.armor;
    knightAbilities.preChoice?.(state, knight);
    expect(knight.armor).toBe(armorFail);

    knight.passiveUsed = false;
    randomSpy.mockReturnValue(0.69); // → 70 ≤ 70 успех
    knightAbilities.preChoice?.(state, knight);
    expect(knight.armor).toBeGreaterThan(armorFail);
  });
});

describe('CUT-2026-11-09 r4 AC-19 Witch ammo', () => {
  test('патроны +4 на раундах 10, 15 и 20; правило патронов не даёт урон', () => {
    // CUT-2026-11-09 AC-19: +4 gun от stage%5, без отдельной прибавки урона от патронов.
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
    witch.gun = 4;
    for (const stage of [10, 15, 20]) {
      state.stage = stage;
      const gunBefore = witch.gun;
      levelUpUnit(witch, 1, state);
      expect(witch.gun - gunBefore).toBe(4);
    }
    // На stage не кратном 5 патронов нет.
    state.stage = 11;
    const gunMid = witch.gun;
    levelUpUnit(witch, 1, state);
    expect(witch.gun).toBe(gunMid);
  });
});

describe('CUT-2026-11-09 r4 AC-16 unitChoiceLabel', () => {
  test('саммон с позициями; два одинаковых различимы', () => {
    const state = makeState(
      [
        { id: 'm', playerId: 'h', heroClassCode: 'Demiurge', row: 1, pickOrder: 1 },
        { id: 'f', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['Demiurge', hero('Demiurge')],
        ['B', hero('B')],
        ['Ectoplasm', hero('Ectoplasm')],
      ]),
    );
    const mage = unit(state, 'm');
    mage.column = 1;
    mage.row = 1;
    const ecto1 = {
      ...mage,
      id: 'e1',
      displayName: 'Эктоплазма',
      isSummon: true,
      summonerId: mage.id,
      row: 0 as const,
      column: 0,
    };
    const ecto2 = { ...ecto1, id: 'e2', column: 2 };
    state.units.push(ecto1, ecto2);
    expect(unitChoiceLabel(ecto1, state)).toBe('✦ Эктоплазма (П1) — саммон Demiurge (З2)');
    expect(unitChoiceLabel(ecto2, state)).toBe('✦ Эктоплазма (П3) — саммон Demiurge (З2)');
    expect(unitChoiceLabel(ecto1, state)).not.toBe(unitChoiceLabel(ecto2, state));
  });
});
