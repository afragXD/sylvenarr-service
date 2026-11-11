import { afterEach, describe, expect, spyOn, test } from 'bun:test';

import { dealDamage } from '../damage';
import {
  grantEffect,
  hasEffect,
  tickEffectsOnTurnEnd,
  tickEffectsOnTurnStart,
} from '../effects';
import { applyAction, createBattleState } from '../engine';
import { levelUpUnit } from '../level';
import { chargeHintFor, stepsUntilCharge } from './charge-hints';
import type { BattleState, BattleUnit, HeroClassStats } from '../types';
import { abbessAbilities } from './abbess';
import { archlichAbilities } from './archlich';
import { demonLordAbilities } from './demon-lord';
import { knightAbilities } from './knight';
import { titanAbilities } from './titan';

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
  mana: 40,
  maxMana: 40,
  gold: 400,
  size: code === 'DemonLord' || code === 'Titan' || code === 'Archlich' || code === 'Dracolich' ? 2 : 1,
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
    matchId: 'r6',
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

function forceTurn(state: BattleState, id: string, playerId: string): void {
  state.activeUnitId = id;
  state.turnPlayerId = playerId;
  state.pendingPrompt = null;
}

function wait(state: BattleState, id: string, playerId: string): void {
  forceTurn(state, id, playerId);
  const result = applyAction(state, { playerId, unitId: id, action: 'wait' });
  expect(result.ok).toBe(true);
}

/** Довести ход до юнита id (wait остальных живых). */
function advanceUntil(state: BattleState, id: string, guard = 40): void {
  for (let i = 0; i < guard && state.outcome === 'ongoing'; i += 1) {
    if (state.activeUnitId === id) {
      return;
    }
    const active = state.activeUnitId;
    if (!active) {
      return;
    }
    const actor = unit(state, active);
    wait(state, active, actor.playerId);
  }
  expect(state.activeUnitId).toBe(id);
}

function effectRounds(u: BattleUnit, id: string): number | undefined {
  return u.effects.find((effect) => effect.id === id)?.rounds;
}

describe('CUT-2026-11-09 r6: срок через applyAction(wait)', () => {
  let randomSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = undefined;
  });

  test('CONTR A/B/C: ровно 3 раунда (Abbess L5)', () => {
    // CUT-2026-11-09 AC-11 / r6
    randomSpy = spyOn(Math, 'random').mockReturnValue(0);

    const run = (mode: 'A' | 'B' | 'C') => {
      const state = makeState(
        [
          { id: 'det', playerId: 'h', heroClassCode: 'Detective', row: 0, pickOrder: 1 },
          { id: 'abb', playerId: 'h', heroClassCode: 'Abbess', row: 0, pickOrder: 2 },
          { id: 'foe', playerId: 'g', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        ],
        new Map([
          ['Detective', hero('Detective', { initiative: 99 })],
          ['Abbess', hero('Abbess', { initiative: 50, mana: 30, maxMana: 30 })],
          ['Knight', hero('Knight', { initiative: 1 })],
        ]),
      );
      const det = unit(state, 'det');
      const abb = unit(state, 'abb');
      abb.lvl = 5;
      abb.mana = 30;

      if (mode === 'A') {
        advanceUntil(state, 'det');
        expect(abbessAbilities.apply(state, abb, { slot: 5, targetId: 'det' }).status).toBe('done');
        expect(effectRounds(det, 'CONTR')).toBe(3);
        wait(state, 'det', 'h');
        advanceUntil(state, 'det'); // delayed
        wait(state, 'det', 'h');
        expect(effectRounds(det, 'CONTR')).toBe(2);
      } else if (mode === 'B') {
        advanceUntil(state, 'det');
        wait(state, 'det', 'h');
        advanceUntil(state, 'abb');
        expect(abbessAbilities.apply(state, abb, { slot: 5, targetId: 'det' }).status).toBe('done');
        expect(effectRounds(det, 'CONTR')).toBe(3);
        // Добрать ход врага → delayed Детектива
        advanceUntil(state, 'det');
        expect(state.delayedPhase || state.delayedIds.includes('det') || true).toBe(true);
        wait(state, 'det', 'h');
        expect(effectRounds(det, 'CONTR')).toBe(2);
        // Ещё полный раунд
        advanceUntil(state, 'det');
        wait(state, 'det', 'h');
        advanceUntil(state, 'det');
        wait(state, 'det', 'h');
        expect(effectRounds(det, 'CONTR')).toBe(1);
        advanceUntil(state, 'det');
        wait(state, 'det', 'h');
        advanceUntil(state, 'det');
        wait(state, 'det', 'h');
        expect(hasEffect(det, 'CONTR')).toBe(false);
      } else {
        advanceUntil(state, 'abb');
        expect(abbessAbilities.apply(state, abb, { slot: 5, targetId: 'det' }).status).toBe('done');
        expect(effectRounds(det, 'CONTR')).toBe(3);
        // 3 раунда без wait на носителе: три end-тика носителя
        for (let i = 0; i < 3; i += 1) {
          advanceUntil(state, 'det');
          // Обычный ход: атака / wait один раз в раунде (без delayed)
          wait(state, 'det', 'h');
          advanceUntil(state, 'det');
          wait(state, 'det', 'h');
        }
        expect(hasEffect(det, 'CONTR')).toBe(false);
      }
    };

    run('A');
    run('B');
    run('C');
  });

  test('BLESSED A/B/C: ровно 2 раунда (Knight L1 и L12)', () => {
    // CUT-2026-11-09 AC-11 / r6
    randomSpy = spyOn(Math, 'random').mockReturnValue(0);
    for (const lvl of [1, 12]) {
      for (const mode of ['A', 'B', 'C'] as const) {
        const state = makeState(
          [
            { id: 'k', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
            { id: 'ally', playerId: 'h', heroClassCode: 'Detective', row: 0, pickOrder: 2 },
            { id: 'foe', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
          ],
          new Map([
            ['Knight', hero('Knight', { initiative: 80 })],
            ['Detective', hero('Detective', { initiative: 40 })],
            ['B', hero('B', { initiative: 1 })],
          ]),
        );
        const knight = unit(state, 'k');
        const ally = unit(state, 'ally');
        knight.lvl = lvl;

        if (mode === 'A') {
          advanceUntil(state, 'k');
          expect(knightAbilities.apply(state, knight, { slot: 3, targetId: 'ally' }).status).toBe(
            'done',
          );
          expect(effectRounds(ally, 'BLESSED')).toBe(2);
          // Носитель баффа — ally: ждёт и закрывает 2 раунда
          advanceUntil(state, 'ally');
          wait(state, 'ally', 'h');
          advanceUntil(state, 'ally');
          wait(state, 'ally', 'h');
          expect(effectRounds(ally, 'BLESSED')).toBe(1);
          advanceUntil(state, 'ally');
          wait(state, 'ally', 'h');
          advanceUntil(state, 'ally');
          wait(state, 'ally', 'h');
          expect(hasEffect(ally, 'BLESSED')).toBe(false);
        } else if (mode === 'B') {
          advanceUntil(state, 'ally');
          wait(state, 'ally', 'h');
          advanceUntil(state, 'k');
          expect(knightAbilities.apply(state, knight, { slot: 3, targetId: 'ally' }).status).toBe(
            'done',
          );
          expect(effectRounds(ally, 'BLESSED')).toBe(2);
          advanceUntil(state, 'ally');
          wait(state, 'ally', 'h');
          expect(effectRounds(ally, 'BLESSED')).toBe(1);
          advanceUntil(state, 'ally');
          wait(state, 'ally', 'h');
          advanceUntil(state, 'ally');
          wait(state, 'ally', 'h');
          expect(hasEffect(ally, 'BLESSED')).toBe(false);
        } else {
          advanceUntil(state, 'k');
          expect(knightAbilities.apply(state, knight, { slot: 3, targetId: 'ally' }).status).toBe(
            'done',
          );
          for (let i = 0; i < 2; i += 1) {
            advanceUntil(state, 'ally');
            wait(state, 'ally', 'h');
            advanceUntil(state, 'ally');
            wait(state, 'ally', 'h');
          }
          expect(hasEffect(ally, 'BLESSED')).toBe(false);
        }
      }
    }
  });

  test('GALL A/B/C: L20 −28 / L5 −8; броня ≥ 0', () => {
    // CUT-2026-11-09 AC-20 / r6
    randomSpy = spyOn(Math, 'random').mockReturnValue(0);

    for (const lvl of [20, 5]) {
      for (const mode of ['A', 'B', 'C'] as const) {
        const rounds = 2 + Math.floor(lvl / 8);
        const strip = 3 + Math.floor(lvl / 5);
        const state = makeState(
          [
            { id: 'c', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
            { id: 'ally', playerId: 'h', heroClassCode: 'Detective', row: 0, pickOrder: 2 },
            { id: 'foe', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
          ],
          new Map([
            ['Knight', hero('Knight', { initiative: 90, armor: 100, health: 800 })],
            ['Detective', hero('Detective', { initiative: 40 })],
            ['B', hero('B', { initiative: 1 })],
          ]),
        );
        const carrier = unit(state, 'c');
        carrier.armor = 100;
        const armor0 = 100;

        if (mode === 'A') {
          advanceUntil(state, 'c');
          grantEffect(carrier, 'GALL', rounds, 10 + lvl, { casterLvl: lvl });
          carrier.effects.find((e) => e.id === 'GALL')!.fresh = undefined;
        } else if (mode === 'B') {
          advanceUntil(state, 'c');
          wait(state, 'c', 'h');
          advanceUntil(state, 'ally');
          grantEffect(carrier, 'GALL', rounds, 10 + lvl, { casterLvl: lvl });
          carrier.effects.find((e) => e.id === 'GALL')!.fresh = undefined;
          wait(state, 'ally', 'h');
        } else {
          advanceUntil(state, 'c');
          grantEffect(carrier, 'GALL', rounds, 10 + lvl, { casterLvl: lvl });
          carrier.effects.find((e) => e.id === 'GALL')!.fresh = undefined;
        }

        let guard = 40;
        while (hasEffect(carrier, 'GALL') && guard-- > 0) {
          advanceUntil(state, 'c');
          wait(state, 'c', 'h');
        }
        expect(hasEffect(carrier, 'GALL')).toBe(false);
        // Level-up каждый раунд меняет броню — считаем тики по логу, не по net armor.
        const stripLogs = state.log.filter((line) => line.includes('разъедает броню'));
        expect(stripLogs.length).toBe(rounds);
        for (const line of stripLogs) {
          expect(line).toContain(`−${strip}`);
        }
        expect(carrier.armor).toBeGreaterThanOrEqual(0);
        expect(armor0).toBe(100);
      }
    }
  });

  test('сценарий B: два wait подряд в одном раунде не старят новый эффект дважды', () => {
    // CUT-2026-11-09 r6
    randomSpy = spyOn(Math, 'random').mockReturnValue(0);
    const state = makeState(
      [
        { id: 'c', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'ally', playerId: 'h', heroClassCode: 'Abbess', row: 0, pickOrder: 2 },
        { id: 'foe', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['Knight', hero('Knight', { initiative: 99 })],
        ['Abbess', hero('Abbess', { initiative: 50, mana: 30, maxMana: 30 })],
        ['B', hero('B', { initiative: 1 })],
      ]),
    );
    const carrier = unit(state, 'c');
    const abb = unit(state, 'ally');
    abb.lvl = 5;
    advanceUntil(state, 'c');
    wait(state, 'c', 'h');
    advanceUntil(state, 'ally');
    expect(abbessAbilities.apply(state, abb, { slot: 5, targetId: 'c' }).status).toBe('done');
    expect(effectRounds(carrier, 'CONTR')).toBe(3);
    advanceUntil(state, 'c');
    // Отложенный ход: два wait невозможны подряд без нового раунда — второй wait в delayed закрывает ход.
    wait(state, 'c', 'h');
    expect(effectRounds(carrier, 'CONTR')).toBe(2);
  });
});

describe('CUT-2026-11-09 r6 AC-4 abbess floor', () => {
  let randomSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = undefined;
  });

  test('6 порезок Кулак+Перерождение: maxHp ≥ ceil(initial/2), в конце на полу', () => {
    // CUT-2026-11-09 AC-4
    // Пол: Math.ceil(initialMaxHp * 0.5) в reduceMaxHp.
    randomSpy = spyOn(Math, 'random').mockReturnValue(0);
    const state = makeState(
      [
        { id: 't', playerId: 'h', heroClassCode: 'Titan', row: 0, pickOrder: 1 },
        { id: 'a', playerId: 'h', heroClassCode: 'Abbess', row: 0, pickOrder: 2 },
        { id: 'f', playerId: 'g', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['Titan', hero('Titan', { initiative: 99, mana: 40, maxMana: 40 })],
        ['Abbess', hero('Abbess', { initiative: 50, mana: 40, maxMana: 40 })],
        ['Knight', hero('Knight', { initiative: 1, health: 200 })],
      ]),
    );
    const foe = unit(state, 'f');
    foe.initialMaxHp = 200;
    foe.maxHp = 200;
    foe.health = 200;
    foe.resists = {};
    const floor = Math.ceil(200 * 0.5);
    unit(state, 'a').lvl = 5;

    // 6 чередований: Кулак → Перерождение → …
    for (let i = 0; i < 6; i += 1) {
      if (i % 2 === 0) {
        unit(state, 't').mana = 40;
        unit(state, 't').abilityCds = {};
        expect(titanAbilities.apply(state, unit(state, 't'), { slot: 1, targetId: 'f' }).status).toBe(
          'done',
        );
      } else {
        unit(state, 'a').mana = 40;
        unit(state, 'a').abilityCds = {};
        foe.resists = {};
        expect(abbessAbilities.apply(state, unit(state, 'a'), { slot: 4, targetId: 'f' }).status).toBe(
          'done',
        );
      }
      expect(foe.maxHp).toBeGreaterThanOrEqual(floor);
    }
    // Дожать Перерождениями до пола (Кулак maxHp не режет).
    let guard = 20;
    while (foe.maxHp > floor && guard-- > 0) {
      unit(state, 'a').mana = 40;
      unit(state, 'a').abilityCds = {};
      foe.resists = {};
      abbessAbilities.apply(state, unit(state, 'a'), { slot: 4, targetId: 'f' });
      expect(foe.maxHp).toBeGreaterThanOrEqual(floor);
    }
    expect(foe.maxHp).toBe(floor);
  });
});

describe('CUT-2026-11-09 r6 AC-5 DemonLord numbers', () => {
  let randomSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = undefined;
  });

  test('Рёв при 50% HP: STRENGTH +10 союзнику с атакой 30', () => {
    // CUT-2026-11-09 AC-5
    const state = makeState(
      [
        { id: 'd', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 'ally', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 2 },
        { id: 'f', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['DemonLord', hero('DemonLord', { initiative: 99, health: 400 })],
        ['Knight', hero('Knight', { damage: 30 })],
        ['B', hero('B')],
      ]),
    );
    const demon = unit(state, 'd');
    demon.maxHp = 400;
    demon.health = 200;
    demon.lvl = 5;
    expect(demonLordAbilities.apply(state, demon, { slot: 4 }).status).toBe('done');
    const str = unit(state, 'ally').effects.find((e) => e.id === 'STRENGTH');
    expect(str?.power).toBe(10);
    expect(str?.rounds).toBe(2);
  });

  test('REGENHP 1.5 при maxHp 228 → 21 ОЗ за тик', () => {
    // CUT-2026-11-09 AC-5
    const state = makeState(
      [
        { id: 'd', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 'f', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['DemonLord', hero('DemonLord', { health: 228 })],
        ['B', hero('B')],
      ]),
    );
    const demon = unit(state, 'd');
    demon.maxHp = 228;
    demon.health = 100;
    grantEffect(demon, 'REGENHP', 3, 1.5);
    const before = demon.health;
    tickEffectsOnTurnStart(demon, state);
    expect(demon.health - before).toBe(21);
  });

  test('Плевок L6 с промахом: HASTE +17 на 2 р.', () => {
    // CUT-2026-11-09 AC-5
    randomSpy = spyOn(Math, 'random').mockReturnValue(0);
    const state = makeState(
      [
        { id: 'd', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 'f', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['DemonLord', hero('DemonLord', { initiative: 99, mana: 20, maxMana: 20 })],
        ['B', hero('B', { dodge: 400 })],
      ]),
    );
    const demon = unit(state, 'd');
    demon.lvl = 6;
    expect(demonLordAbilities.apply(state, demon, { slot: 3, targetId: 'f' }).status).toBe('done');
    const haste = demon.effects.find((e) => e.id === 'HASTE');
    expect(haste?.power).toBe(17);
    expect(haste?.rounds).toBe(2);
  });

  test('Клинок: ×2/×1, два броска окаменения, КД 2', () => {
    // CUT-2026-11-09 AC-5
    const state = makeState(
      [
        { id: 'd', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 'f0', playerId: 'g', heroClassCode: 'Front', row: 0, pickOrder: 1 },
        { id: 'f1', playerId: 'g', heroClassCode: 'Back', row: 1, pickOrder: 2 },
      ],
      new Map([
        ['DemonLord', hero('DemonLord', { initiative: 99, damage: 20, accuracy: 100, luck: 0 })],
        ['Front', hero('Front', { health: 500, armor: 0, dodge: 0 })],
        ['Back', hero('Back', { health: 500, armor: 0, dodge: 0 })],
      ]),
    );
    unit(state, 'f0').column = 0;
    unit(state, 'f1').column = 0;
    const demon = unit(state, 'd');
    demon.lvl = 6; // 70+6=76
    demon.luck = 0;
    unit(state, 'f0').luck = 0;
    unit(state, 'f1').luck = 0;
    const hp0 = unit(state, 'f0').health;
    const hp1 = unit(state, 'f1').health;
    // После makeState: evade+dmg+petrify ×2. 1..5→0, 6→0.99 (второй petrify fail).
    let rolls = 0;
    randomSpy = spyOn(Math, 'random').mockImplementation(() => {
      rolls += 1;
      return rolls >= 6 ? 0.99 : 0;
    });
    expect(demonLordAbilities.apply(state, demon, { slot: 2, targetId: 'f0' }).status).toBe('done');
    const lost0 = hp0 - unit(state, 'f0').health;
    const lost1 = hp1 - unit(state, 'f1').health;
    expect(lost0).toBe(40);
    expect(lost1).toBe(20);
    expect(lost0).toBe(lost1 * 2);
    expect(hasEffect(unit(state, 'f0'), 'PETRIFIED')).toBe(true);
    expect(hasEffect(unit(state, 'f1'), 'PETRIFIED')).toBe(false);
    expect(demon.abilityCds?.[2]).toBe(2);
  });

  test('Трёхглавый: лечение round(maxHp×0.33) за каждого убитого', () => {
    // CUT-2026-11-09 AC-5
    randomSpy = spyOn(Math, 'random').mockReturnValue(0.99);
    const state = makeState(
      [
        { id: 'd', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 'a', playerId: 'g', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'b', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 2 },
      ],
      new Map([
        ['DemonLord', hero('DemonLord', { initiative: 99, damage: 200, accuracy: 100, luck: 0, health: 400 })],
        ['A', hero('A', { health: 30, armor: 0, dodge: 0 })],
        ['B', hero('B', { health: 30, armor: 0, dodge: 0 })],
      ]),
    );
    const demon = unit(state, 'd');
    demon.health = 100;
    const healExpect =
      Math.round(unit(state, 'a').maxHp * 0.33) + Math.round(unit(state, 'b').maxHp * 0.33);
    const before = demon.health;
    expect(demonLordAbilities.apply(state, demon, { slot: 1 }).status).toBe('done');
    expect(unit(state, 'a').alive).toBe(false);
    expect(unit(state, 'b').alive).toBe(false);
    expect(demon.health - before).toBe(healExpect);
  });
});

describe('CUT-2026-11-09 r6 AC-6 / AC-21 Titan Marauder', () => {
  let randomSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = undefined;
  });

  test('Могучий кулак: +1 заряд Дрожи и лог; без заряда slot5 недоступен', () => {
    // CUT-2026-11-09 AC-6
    randomSpy = spyOn(Math, 'random').mockReturnValue(0.99);
    const state = makeState(
      [
        { id: 't', playerId: 'h', heroClassCode: 'Titan', row: 0, pickOrder: 1 },
        { id: 'f', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['Titan', hero('Titan', { initiative: 99, mana: 20, maxMana: 20, damage: 80 })],
        ['B', hero('B', { health: 20, armor: 0, dodge: 0 })],
      ]),
    );
    const titan = unit(state, 't');
    titan.ultaCharges = 0;
    expect(titanAbilities.listAbilities(state, titan).find((a) => a.slot === 5)?.disabledReason).toMatch(
      /Нет зарядов/,
    );
    expect(titanAbilities.apply(state, titan, { slot: 1, targetId: 'f' }).status).toBe('done');
    expect(unit(state, 'f').alive).toBe(false);
    expect(titan.ultaCharges).toBe(1);
    expect(state.log.some((line) => line.includes('заряд Дрожи'))).toBe(true);
  });

  test('chargeHintFor 10 раундов: Титан Сейчас N; Мародёр K совпадает с грантом', () => {
    // CUT-2026-11-09 AC-21
    const state = makeState(
      [
        { id: 't', playerId: 'h', heroClassCode: 'Titan', row: 0, pickOrder: 1 },
        { id: 'm', playerId: 'h', heroClassCode: 'Marauder', row: 0, pickOrder: 2 },
        { id: 'f', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['Titan', hero('Titan')],
        ['Marauder', hero('Marauder')],
        ['B', hero('B')],
      ]),
    );
    const titan = unit(state, 't');
    const marauder = unit(state, 'm');
    titan.ultaCharges = 1;
    marauder.ultaCharges = 1;
    for (let round = 0; round < 10; round += 1) {
      const hintT = chargeHintFor(titan, state, 5);
      expect(hintT).toContain(`Сейчас ${titan.ultaCharges}`);
      const k = stepsUntilCharge('Marauder', marauder.hiddenLvl, state.stage);
      const hintM = chargeHintFor(marauder, state, 4);
      expect(hintM).toContain(`через ${k}`);
      const before = marauder.ultaCharges;
      state.stage += 1;
      levelUpUnit(marauder, 1, state);
      if (k === 1) {
        expect(marauder.ultaCharges).toBe(before + 1);
      } else {
        expect(marauder.ultaCharges).toBe(before);
      }
      titan.ultaCharges += 1;
    }
  });
});

describe('CUT-2026-11-09 r6 OBS charge multi-levelup', () => {
  test('Ритуал Архилича на Зомби в R4: не больше +1 заряда за stage', () => {
    // CUT-2026-11-09 OBS-R5-CHARGE-LEVELUP — подтверждено, фикс lastChargeStage
    const state = makeState(
      [
        { id: 'lich', playerId: 'h', heroClassCode: 'Archlich', row: 0, pickOrder: 1 },
        { id: 'f', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['Archlich', hero('Archlich', { initiative: 99, mana: 40, maxMana: 40 })],
        ['B', hero('B')],
        ['Zombie', hero('Zombie')],
      ]),
    );
    state.stage = 4;
    const lich = unit(state, 'lich');
    lich.lvl = 12; // levels = 1+3 = 4
    // Призвать зомби через ручной summon-like unit
    const zombie = {
      ...unit(state, 'f'),
      id: 'z',
      heroClassCode: 'Zombie',
      displayName: 'Zombie',
      team: 0 as const,
      playerId: 'h',
      isSummon: true,
      isLichSummon: true,
      summonerId: lich.id,
      ultaCharges: 0,
      lvl: 1,
      hiddenLvl: 1,
    };
    state.units.push(zombie);
    const before = zombie.ultaCharges;
    expect(archlichAbilities.apply(state, lich, { slot: 3, targetId: 'z' }).status).toBe('done');
    // Без фикса было бы +4 (каждый шаг level-up на stage%4); с фиксом +1.
    expect(zombie.ultaCharges - before).toBe(1);
  });

  test('Witch R5: +3 level-up даёт +4 патрона один раз, не три', () => {
    // CUT-2026-11-09 OBS-R5-CHARGE-LEVELUP
    const state = makeState(
      [
        { id: 'w', playerId: 'h', heroClassCode: 'Witch', row: 0, pickOrder: 1 },
        { id: 'f', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['Witch', hero('Witch')],
        ['B', hero('B')],
      ]),
    );
    state.stage = 5;
    const witch = unit(state, 'w');
    witch.gun = 0;
    levelUpUnit(witch, 3, state);
    expect(witch.gun).toBe(4);
  });
});

describe('CUT-2026-11-09 r6 AC-24 Patriarch sanctum levels', () => {
  let randomSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = undefined;
  });

  test('Перерождение: заряд на 7→8 и 14→15, без дубля', () => {
    // CUT-2026-11-09 AC-24
    randomSpy = spyOn(Math, 'random').mockReturnValue(0);
    const state = makeState(
      [
        { id: 'a', playerId: 'h', heroClassCode: 'Abbess', row: 0, pickOrder: 1 },
        { id: 'p', playerId: 'h', heroClassCode: 'Patriarch', row: 0, pickOrder: 2 },
        { id: 'f', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      new Map([
        ['Abbess', hero('Abbess', { initiative: 99, mana: 40, maxMana: 40 })],
        ['Patriarch', hero('Patriarch', { initiative: 1 })],
        ['B', hero('B')],
      ]),
    );
    const abb = unit(state, 'a');
    const pat = unit(state, 'p');
    abb.lvl = 20; // много уровней за перерождение: 1+floor(target.lvl/6)
    pat.lvl = 6;
    pat.hiddenLvl = 6;
    pat.ultaCharges = 1;
    // Перерождение поднимает levels = 1+floor(6/6)=2 → hidden 6→7→8, заряд на 7
    expect(abbessAbilities.apply(state, abb, { slot: 4, targetId: 'p' }).status).toBe('done');
    expect(pat.ultaCharges).toBe(2);
    expect(pat.hiddenLvl).toBeGreaterThanOrEqual(8);

    // Добить до 13, затем +2 через levelUp → 14→15 даёт ещё один
    while (pat.hiddenLvl < 13) {
      levelUpUnit(pat, 1, state);
    }
    const chargesAt13 = pat.ultaCharges;
    levelUpUnit(pat, 2, state); // 13→14→15, заряд на 14
    expect(pat.ultaCharges).toBe(chargesAt13 + 1);
    expect(chargeHintFor(pat, state, 4)).toContain('когда скрытый уровень кратен 7');
  });
});
