/**
 * CUT-2026-11-01c — proof через реальный боевой движок (не копии формул).
 * Каждый кейс пишет fixture JSON в combat/fixtures/engine-proof/<id>.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, spyOn, test } from 'bun:test';

import {
  dealDamage,
  estimateDamageRange,
  lastDealDamageResult,
  markDeadIfNeeded,
} from '../damage';
import {
  applyPsycho,
  maybePunishLowMorale,
} from '../morale';
import { hasEffect } from '../effects';
import { applyAction, createBattleState, meleeTargets, toBattleSummary } from '../engine';
import { setWard } from '../resists';
import { ROW_BACK } from '../settings';
import type { HeroClassStats } from '../types';
import { battleApiJson } from '../test/seededRandom';

const SEED = 20261101;
const FIXTURE_DIR = join(import.meta.dir, '../fixtures/engine-proof');

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 200,
  damage: 40,
  armor: 0,
  initiative: 40,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 40,
  mana: 15,
  maxMana: 15,
  gold: 100,
  size: 1,
  ...overrides,
});

/** Math.random → randInt(min,max) === value */
const rFor = (min: number, max: number, value: number): number =>
  (value - min) / (max - min + 1) + 1e-9;

function writeFixture(fixtureId: string, payload: Record<string, unknown>): void {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const body = {
    fixtureId,
    seed: SEED,
    ...payload,
  };
  writeFileSync(join(FIXTURE_DIR, `${fixtureId}.json`), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}

describe('CUT-2026-11-01c engine-proof', () => {
  test('AC-1: psycho −85/−100 — границы 60/61 и 90/91', () => {
    const mk = (morale: number) => {
      const state = createBattleState({
        matchId: `ac1-psycho-${morale}`,
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
          { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes: new Map([
          ['Knight', hero('Knight')],
          ['B', hero('B')],
        ]),
      });
      const unit = state.units.find((u) => u.id === 'p1')!;
      unit.morale = morale;
      unit.illness = false;
      unit.illnessKind = null;
      return { state, unit };
    };

    const run = (morale: number, roll: number) => {
      const { state, unit } = mk(morale);
      const rnd = spyOn(Math, 'random').mockReturnValue(rFor(1, 100, roll));
      applyPsycho(state, unit);
      rnd.mockRestore();
      return unit.illness;
    };

    expect(run(-85, 60)).toBe(true);
    expect(run(-85, 61)).toBe(false);
    expect(run(-100, 90)).toBe(true);
    expect(run(-100, 91)).toBe(false);

    writeFixture('ac1-psycho-threshold', {
      cases: [
        { morale: -85, rollSuccess: 60, rollFail: 61, illnessOnSuccess: true, illnessOnFail: false },
        { morale: -100, rollSuccess: 90, rollFail: 91, illnessOnSuccess: true, illnessOnFail: false },
      ],
      apiJson: JSON.parse(
        battleApiJson({
          fixtureId: 'ac1-psycho-threshold',
          seed: SEED,
          log: mk(-85).state.log,
          units: mk(-85).state.units.map((u) => ({
            id: u.id,
            heroClassCode: u.heroClassCode,
            health: u.health,
            maxHp: u.maxHp,
            alive: u.alive,
          })),
        })
      ),
    });
  });

  test('AC-1: debuff −50/−90 (кап 70) — границы 50/51 и 70/71', () => {
    const mk = (morale: number) => {
      const state = createBattleState({
        matchId: `ac1-debuff-${morale}`,
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
          { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes: new Map([
          ['Knight', hero('Knight', { damage: 40, power: 40 })],
          ['B', hero('B')],
        ]),
      });
      const unit = state.units.find((u) => u.id === 'p1')!;
      unit.morale = morale;
      unit.effects = [];
      return { state, unit };
    };

    const run = (morale: number, roll: number) => {
      const { state, unit } = mk(morale);
      const rnd = spyOn(Math, 'random').mockReturnValue(rFor(1, 100, roll));
      maybePunishLowMorale(state, unit);
      rnd.mockRestore();
      return { debuffed: hasEffect(unit, 'STRENGTH'), log: state.log, effects: unit.effects.map((e) => e.id) };
    };

    const m50ok = run(-50, 50);
    const m50fail = run(-50, 51);
    const m90ok = run(-90, 70);
    const m90fail = run(-90, 71);
    expect(m50ok.debuffed).toBe(true);
    expect(m50fail.debuffed).toBe(false);
    expect(m90ok.debuffed).toBe(true);
    expect(m90fail.debuffed).toBe(false);
    expect(m50ok.log.some((l) => l.includes('упадок духа'))).toBe(true);

    writeFixture('ac1-debuff-threshold', {
      cases: [
        { morale: -50, rollSuccess: 50, rollFail: 51 },
        { morale: -90, rollSuccess: 70, rollFail: 71, chanceCappedAt: 70 },
      ],
      logOk: m50ok.log,
      logFail: m50fail.log,
      effectsOk: m50ok.effects,
      effectsFail: m50fail.effects,
      logCapOk: m90ok.log,
      effectsCapOk: m90ok.effects,
      effectsCapFail: m90fail.effects,
    });
  });

  test('AC-4: Тройной удар hitChance 90 — граница промаха missChance / missChance+1', () => {
    const state = createBattleState({
      matchId: 'ac4-triple-90',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        // missChance = dodge+1+95-acc+5 = 101-acc; для hitChance 90 → miss 10 → acc 91
        ['DemonLord', hero('DemonLord', { accuracy: 91, damage: 40, luck: 0, initiative: 99 })],
        ['B', hero('B', { dodge: 0, health: 5000, armor: 0 })],
      ]),
    });
    const demon = state.units.find((u) => u.id === 'p1')!;
    const foe = state.units.find((u) => u.id === 'e1')!;
    demon.accuracy = 91;
    const est = estimateDamageRange(demon, foe, {
      kind: 'melee',
      accuracyPenalty: 5,
      damageMult: 1.15,
    });
    expect(est.hitChance).toBe(90);
    const missChance = 100 - est.hitChance;

    // Промах: randInt(1,100) <= missChance
    foe.health = 5000;
    const missRoll = missChance; // 10
    const hitRoll = missChance + 1; // 11 — в продукте «граница попадания»
    // Пользовательский ярлык «90/91» = hitChance; движок бросает промах.
    const rndMiss = spyOn(Math, 'random').mockImplementation(() => rFor(1, 100, missRoll));
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 1,
      targetId: 'e1',
    });
    rndMiss.mockRestore();
    const missed = state.log.some((l) => l.includes('промахивается'));
    expect(missed).toBe(true);

    const state2 = createBattleState({
      matchId: 'ac4-triple-90-hit',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['DemonLord', hero('DemonLord', { accuracy: 91, damage: 40, luck: 0, initiative: 99 })],
        ['B', hero('B', { dodge: 0, health: 5000, armor: 0 })],
      ]),
    });
    const demon2 = state2.units.find((u) => u.id === 'p1')!;
    const foe2 = state2.units.find((u) => u.id === 'e1')!;
    demon2.accuracy = 91;
    // hit: evade roll = 11; then luck skip; damage rand → 0
    let call = 0;
    const rndHit = spyOn(Math, 'random').mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return rFor(1, 100, hitRoll);
      }
      return rFor(0, 2, 0);
    });
    state2.activeUnitId = 'p1';
    state2.turnPlayerId = 'h';
    applyAction(state2, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 1,
      targetId: 'e1',
    });
    rndHit.mockRestore();
    expect(state2.log.some((l) => l.includes('трёхглавый'))).toBe(true);
    expect(foe2.health).toBeLessThan(5000);

    writeFixture('ac4-triple-90', {
      hitChance: est.hitChance,
      missChance,
      missRoll,
      hitRoll,
      labelNote: 'hitChance 90; движок бросает промах (≤missChance), не «roll≤90»',
      missLog: state.log,
      hitLog: state2.log,
      foeHealthAfterHit: foe2.health,
    });
  });

  test('AC-7: Нить жизни — ×1.40 при 40% потери и ×1.75 при 90% (melee/ranged/magic)', () => {
    const state = createBattleState({
      matchId: 'ac7-life-thread',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'GhostWarrior', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['GhostWarrior', hero('GhostWarrior', { damage: 40, power: 40, accuracy: 100, luck: 0 })],
        ['B', hero('B', { health: 5000, armor: 0 })],
      ]),
    });
    const gw = state.units.find((u) => u.id === 'p1')!;
    const foe = state.units.find((u) => u.id === 'e1')!;
    gw.maxHp = 100;
    gw.health = 100;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, { playerId: 'h', unitId: 'p1', action: 'ability', slot: 5 });
    expect(hasEffect(gw, 'LIFE_THREAD')).toBe(true);

    const kinds = ['melee', 'ranged', 'magic'] as const;
    const scenarios = [
      { lostPct: 40, health: 60, expectedMult: 1.4 },
      { lostPct: 90, health: 10, expectedMult: 1.75 },
    ] as const;

    const results: Record<string, Record<string, { withThread: number; without: number; mult: number }>> =
      {};

    for (const scenario of scenarios) {
      gw.health = scenario.health;
      results[`lost${scenario.lostPct}`] = {};
      for (const kind of kinds) {
        const deal = () => {
          const rnd = spyOn(Math, 'random').mockImplementation(() =>
            kind === 'magic' ? rFor(-3, 3, 0) : rFor(0, 2, 0)
          );
          foe.health = 5000;
          const dealt = dealDamage(
            gw,
            foe,
            { kind, forceHit: true, source: kind === 'magic' ? 'FIRE' : undefined },
            state
          );
          rnd.mockRestore();
          return dealt;
        };

        const withThread = deal();
        const saved = gw.effects.filter((e) => e.id === 'LIFE_THREAD');
        gw.effects = gw.effects.filter((e) => e.id !== 'LIFE_THREAD');
        const without = deal();
        gw.effects.push(...saved);

        expect(withThread).toBe(Math.round(without * scenario.expectedMult));
        results[`lost${scenario.lostPct}`][kind] = {
          withThread,
          without,
          mult: scenario.expectedMult,
        };
      }
    }

    writeFixture('ac7-katana-thread', {
      lifeThreadExact: results,
      note: '×1.40 при 40% потерянных ОЗ; ×1.75 при 90%; melee/ranged/magic через dealDamage',
    });
  });

  test('AC-8: казнь 19%/не 20%; FINALSTRIKE; DEATHWARD не тратится', () => {
    const mk = (opts: {
      matchId: string;
      health: number;
      finalStrike?: boolean;
      deathWard?: boolean;
      damage?: number;
    }) => {
      const state = createBattleState({
        matchId: opts.matchId,
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Dracolich', row: 0, pickOrder: 1 },
          { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes: new Map([
          [
            'Dracolich',
            hero('Dracolich', {
              damage: opts.damage ?? 1,
              accuracy: 100,
              luck: 0,
              initiative: 99,
            }),
          ],
          ['B', hero('B', { health: 100, armor: 0, dodge: 0 })],
        ]),
      });
      const foe = state.units.find((u) => u.id === 'e1')!;
      foe.maxHp = 100;
      foe.health = opts.health;
      foe.armor = 0;
      if (opts.deathWard) {
        setWard(foe, 'DEATH', 2);
      }
      if (opts.finalStrike) {
        foe.resists.FINALSTRIKE = { value: 0, wardCharges: 1 };
      }
      let n = 0;
      const rnd = spyOn(Math, 'random').mockImplementation(() => {
        n += 1;
        if (n === 1) {
          return rFor(1, 100, 50);
        }
        return rFor(0, 2, 0);
      });
      state.activeUnitId = 'p1';
      state.turnPlayerId = 'h';
      const deathWardBefore = foe.resists.DEATH?.wardCharges ?? 0;
      applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        slot: 5,
        targetId: 'e1',
      });
      rnd.mockRestore();
      return {
        alive: foe.alive,
        health: foe.health,
        log: state.log,
        deathWardBefore,
        deathWardAfter: foe.resists.DEATH?.wardCharges ?? 0,
        finalStrikeAfter: foe.resists.FINALSTRIKE?.wardCharges ?? 0,
      };
    };

    const at19 = mk({ matchId: 'ac8-exec-19', health: 19 });
    const at20 = mk({ matchId: 'ac8-exec-20', health: 20 });
    expect(at19.alive).toBe(false);
    expect(at19.log.some((l) => l.includes('< 20 % ОЗ') || l.includes('сжирает'))).toBe(true);
    expect(at20.alive).toBe(true);
    expect(at20.health).toBeGreaterThan(0);

    const fs = mk({ matchId: 'ac8-fs', health: 10, finalStrike: true });
    expect(fs.alive).toBe(true);
    expect(fs.health).toBe(1);
    expect(fs.finalStrikeAfter).toBe(0);

    const dw = mk({ matchId: 'ac8-deathward', health: 80, deathWard: true, damage: 40 });
    expect(dw.deathWardAfter).toBe(dw.deathWardBefore);
    expect(dw.deathWardBefore).toBe(2);

    writeFixture('ac8-devour-armor', {
      executeAt19: { alive: at19.alive, log: at19.log },
      noExecuteAt20: { alive: at20.alive, health: at20.health, log: at20.log },
      finalStrike: { alive: fs.alive, health: fs.health, wardAfter: fs.finalStrikeAfter, log: fs.log },
      deathWard: {
        before: dw.deathWardBefore,
        after: dw.deathWardAfter,
        log: dw.log,
      },
    });
  });

  test('AC-9: деградация — край / центр / пустая цель', () => {
    const board = () =>
      createBattleState({
        matchId: 'ac9-square',
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'w', playerId: 'h', heroClassCode: 'Witch', row: 0, pickOrder: 1 },
          { id: 'f0', playerId: 'g', heroClassCode: 'A', row: 0, pickOrder: 1 },
          { id: 'f1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 2 },
          { id: 'f2', playerId: 'g', heroClassCode: 'C', row: 0, pickOrder: 3 },
          { id: 'b0', playerId: 'g', heroClassCode: 'D', row: 1, pickOrder: 4 },
          { id: 'b1', playerId: 'g', heroClassCode: 'E', row: 1, pickOrder: 5 },
        ],
        heroes: new Map([
          ['Witch', hero('Witch', { mana: 20, initiative: 99 })],
          ['A', hero('A')],
          ['B', hero('B')],
          ['C', hero('C')],
          ['D', hero('D')],
          ['E', hero('E')],
        ]),
      });

    const cast = (targetId: string) => {
      const state = board();
      const witch = state.units.find((u) => u.id === 'w')!;
      witch.lvl = 10;
      witch.mana = 20;
      for (const id of ['f0', 'f1', 'f2', 'b0', 'b1']) {
        state.units.find((u) => u.id === id)!.lvl = 10;
      }
      // Все броски успеха деградации
      const rnd = spyOn(Math, 'random').mockReturnValue(0);
      state.activeUnitId = 'w';
      state.turnPlayerId = 'h';
      const result = applyAction(state, {
        playerId: 'h',
        unitId: 'w',
        action: 'ability',
        slot: 4,
        targetId,
      });
      rnd.mockRestore();
      const squareLine = state.log.find((l) => l.includes('по квадрату'));
      return { state, result, squareLine };
    };

    const edge = cast('f0');
    const center = cast('f1');
    expect(edge.result.ok).toBe(true);
    expect(center.result.ok).toBe(true);
    expect(edge.squareLine).toBeTruthy();
    expect(center.squareLine).toBeTruthy();

    const empty = board();
    const witch = empty.units.find((u) => u.id === 'w')!;
    witch.lvl = 10;
    witch.mana = 20;
    empty.activeUnitId = 'w';
    empty.turnPlayerId = 'h';
    const emptyResult = applyAction(empty, {
      playerId: 'h',
      unitId: 'w',
      action: 'ability',
      slot: 4,
      targetId: 'w',
    });
    expect(emptyResult.ok).toBe(false);

    writeFixture('ac9-square-geom', {
      edgeLine: edge.squareLine,
      centerLine: center.squareLine,
      edgeLog: edge.state.log,
      centerLog: center.state.log,
      emptyOk: emptyResult.ok,
      emptyMessage: 'message' in emptyResult ? emptyResult.message : null,
    });
  });

  test('AC-10: смерть с Извержением — 200→50/25 FIRE; нечётный maxHP через floor', () => {
    const runSplash = (maxHp: number) => {
      const state = createBattleState({
        matchId: `ac10-eruption-${maxHp}`,
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Incub', row: 0, pickOrder: 1 },
          { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
          { id: 'e2', playerId: 'g', heroClassCode: 'C', row: 0, pickOrder: 2 },
          { id: 'e3', playerId: 'g', heroClassCode: 'D', row: 1, pickOrder: 3 },
        ],
        heroes: new Map([
          ['Incub', hero('Incub', { mana: 20, power: 30, accuracy: 100, luck: 0, initiative: 99 })],
          ['B', hero('B', { health: maxHp })],
          ['C', hero('C', { health: 500 })],
          ['D', hero('D', { health: 500 })],
        ]),
      });
      const incub = state.units.find((u) => u.id === 'p1')!;
      const carrier = state.units.find((u) => u.id === 'e1')!;
      const sameRow = state.units.find((u) => u.id === 'e2')!;
      const otherRow = state.units.find((u) => u.id === 'e3')!;
      incub.lvl = 8;
      carrier.maxHp = maxHp;
      carrier.health = maxHp;
      sameRow.maxHp = 500;
      sameRow.health = 500;
      otherRow.maxHp = 500;
      otherRow.health = 500;
      // Снять сейвы/резисты: смерть носителя и полный FIRE-splash.
      carrier.resists = {};
      carrier.lives = 0;
      sameRow.resists = {};
      otherRow.resists = {};

      state.activeUnitId = 'p1';
      state.turnPlayerId = 'h';
      applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        slot: 2,
        targetId: 'e1',
      });
      expect(hasEffect(carrier, 'ERUPTION')).toBe(true);

      const sameBefore = sameRow.health;
      const otherBefore = otherRow.health;
      carrier.health = 0;
      markDeadIfNeeded(state, carrier);

      const sameDmg = sameBefore - sameRow.health;
      const otherDmg = otherBefore - otherRow.health;
      const expectedX = Math.floor(maxHp * 0.25);
      return {
        state,
        sameDmg,
        otherDmg,
        expectedX,
        expectedOther: Math.floor(expectedX / 2),
        log: state.log,
      };
    };

    const even = runSplash(200);
    expect(even.sameDmg).toBe(50);
    expect(even.otherDmg).toBe(25);
    expect(even.log.some((l) => l.includes('⟦FIRE⟧') && l.includes('извержен'))).toBe(true);

    // 199: floor(49.75)=49 (round дал бы 50) — фиксируем floor.
    const odd = runSplash(199);
    expect(odd.sameDmg).toBe(49);
    expect(odd.otherDmg).toBe(24);

    writeFixture('ac10-fire-floor', {
      evenMaxHp: 200,
      evenSplash: [even.sameDmg, even.otherDmg],
      oddMaxHp: 199,
      oddSplash: [odd.sameDmg, odd.otherDmg],
      oddNote: '⌊199×0.25⌋=49, ⌊49/2⌋=24',
      evenLog: even.log,
      oddLog: odd.log,
    });
  });

  test('AC-11: граница крита Азарта через applyAction (32% да, 33% нет)', () => {
    const run = (hp: number) => {
      const state = createBattleState({
        matchId: `ac11-azart-${hp}`,
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Inquisitor', row: 0, pickOrder: 1 },
          { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes: new Map([
          ['Inquisitor', hero('Inquisitor', { luck: 0, accuracy: 100, initiative: 99 })],
          ['B', hero('B', { health: 100, armor: 0 })],
        ]),
      });
      const inq = state.units.find((u) => u.id === 'p1')!;
      const foe = state.units.find((u) => u.id === 'e1')!;
      inq.lvl = 5;
      foe.maxHp = 100;
      foe.health = hp;
      state.activeUnitId = 'p1';
      state.turnPlayerId = 'h';
      applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        slot: 1,
        targetId: 'e1',
      });
      return state;
    };
    const low = run(32);
    const high = run(33);
    expect(low.log.some((l) => l.includes('азарт добивания (+19 пп крита'))).toBe(true);
    expect(high.log.some((l) => l.includes('азарт добивания'))).toBe(false);

    writeFixture('ac11-azart-boundary', {
      at32: low.log,
      at33: high.log,
    });
  });

  test('AC-15: weaponReach JSON + слабость Мародёра', () => {
    const state = createBattleState({
      matchId: 'ac15-weaponReach',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'atk', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'e0', playerId: 'g', heroClassCode: 'E0', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'E1', row: 0, pickOrder: 2 },
        { id: 'e2', playerId: 'g', heroClassCode: 'E2', row: 0, pickOrder: 3 },
      ],
      heroes: new Map([
        ['A', hero('A', { initiative: 99, accuracy: 100 })],
        ['E0', hero('E0')],
        ['E1', hero('E1')],
        ['E2', hero('E2')],
      ]),
    });
    const atk = state.units.find((u) => u.id === 'atk')!;
    atk.weaponReach = 1;
    const legal = meleeTargets(state, atk).map((u) => u.id);
    expect(legal).not.toContain('e2');
    expect(legal).toContain('e0');
    const summary = toBattleSummary(state);
    expect(summary.units.find((u) => u.id === 'atk')?.weaponReach).toBe(1);

    const mState = createBattleState({
      matchId: 'ac15-marauder-weak',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Marauder', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Marauder', hero('Marauder', { damage: 40, accuracy: 100, luck: 0, mana: 10, initiative: 99 })],
        ['B', hero('B', { health: 500 })],
      ]),
    });
    const marauder = mState.units.find((u) => u.id === 'p1')!;
    mState.activeUnitId = 'p1';
    mState.turnPlayerId = 'h';
    applyAction(mState, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 3,
      targetId: 'e1',
    });
    expect(hasEffect(marauder, 'WEAKNESS')).toBe(true);

    writeFixture('ac15-weaponReach-marauder', {
      weaponReach: atk.weaponReach,
      legalTargetIds: legal,
      blockedColumnTarget: 'e2',
      blocked: !legal.includes('e2'),
      battleSummary: {
        weaponReach: summary.units.find((u) => u.id === 'atk')?.weaponReach,
        unitIds: summary.units.map((u) => u.id),
      },
      marauderWeakness: hasEffect(marauder, 'WEAKNESS'),
      marauderLog: mState.log,
    });
  });

  test('AC-13: 20 некрит Копий (36–42) и 20 лечений (24–37)', () => {
    const spearSamples: number[] = [];
    const healSamples: number[] = [];

    for (let i = 0; i < 20; i += 1) {
      const state = createBattleState({
        matchId: `ac13-spear-${i}`,
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Abbess', row: ROW_BACK, pickOrder: 1 },
          { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes: new Map([
          ['Abbess', hero('Abbess', { power: 49, mana: 20, maxMana: 20, accuracy: 100, luck: 0, initiative: 99 })],
          ['B', hero('B', { health: 5000, armor: 0, dodge: 0 })],
        ]),
      });
      const abbess = state.units.find((u) => u.id === 'p1')!;
      const foe = state.units.find((u) => u.id === 'e1')!;
      abbess.row = ROW_BACK;
      abbess.power = 49;
      abbess.luck = 0;
      abbess.critBank = 0;
      foe.health = 5000;
      state.activeUnitId = 'p1';
      state.turnPlayerId = 'h';
      applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        slot: 1,
        targetId: 'e1',
      });
      const dealt = lastDealDamageResult().damage;
      expect(dealt).toBeGreaterThanOrEqual(36);
      expect(dealt).toBeLessThanOrEqual(42);
      spearSamples.push(dealt);
    }

    for (let i = 0; i < 20; i += 1) {
      const state = createBattleState({
        matchId: `ac13-heal-${i}`,
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Abbess', row: ROW_BACK, pickOrder: 1 },
          { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
          { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes: new Map([
          ['Abbess', hero('Abbess', { power: 49, mana: 20, maxMana: 20, initiative: 99 })],
          ['Ally', hero('Ally', { health: 50, maxMana: 0 })],
          ['B', hero('B')],
        ]),
      });
      const abbess = state.units.find((u) => u.id === 'p1')!;
      const ally = state.units.find((u) => u.id === 'p2')!;
      abbess.row = ROW_BACK;
      abbess.power = 49;
      ally.maxHp = 200;
      ally.health = 50;
      const before = ally.health;
      state.activeUnitId = 'p1';
      state.turnPlayerId = 'h';
      applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        slot: 2,
        targetId: 'p2',
      });
      const healed = ally.health - before;
      expect(healed).toBeGreaterThanOrEqual(24);
      expect(healed).toBeLessThanOrEqual(37);
      healSamples.push(healed);
    }

    writeFixture('ac13-abbess-spear-heal', {
      spearSamples,
      healSamples,
      spearMin: Math.min(...spearSamples),
      spearMax: Math.max(...spearSamples),
      healMin: Math.min(...healSamples),
      healMax: Math.max(...healSamples),
      spearRangeExpected: [36, 42],
      healRangeExpected: [24, 37],
    });
  });
});
