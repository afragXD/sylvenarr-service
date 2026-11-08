/**
 * CUT-2026-11-01c — proof через реальный боевой движок (не копии формул).
 * Каждый кейс пишет fixture JSON в combat/fixtures/engine-proof/<id>.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, spyOn, test } from 'bun:test';

import { dealDamage, estimateDamageRange, lastDealDamageResult } from '../damage';
import {
  applyPsycho,
  maybePunishLowMorale,
} from '../morale';
import { grantEffect, hasEffect } from '../effects';
import { applyAction, createBattleState, meleeTargets, toBattleSummary } from '../engine';
import { setWard } from '../resists';
import { ROW_BACK } from '../settings';
import type { HeroClassStats } from '../types';
import { battleApiJson } from '../test/seededRandom';
import { applyAbility } from './registry';

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
  test('AC-1: порог psycho −70 — roll 30 болезнь, 31 нет', () => {
    const mk = () => {
      const state = createBattleState({
        matchId: 'ac1-psycho-threshold',
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
      unit.morale = -70;
      unit.illness = false;
      unit.illnessKind = null;
      return { state, unit };
    };

    const ok = mk();
    const rndOk = spyOn(Math, 'random').mockReturnValue(rFor(1, 100, 30));
    applyPsycho(ok.state, ok.unit);
    // fate randInt(1,5) — не важен для illness flag
    rndOk.mockRestore();
    expect(ok.unit.illness).toBe(true);

    const fail = mk();
    const rndFail = spyOn(Math, 'random').mockReturnValue(rFor(1, 100, 31));
    applyPsycho(fail.state, fail.unit);
    rndFail.mockRestore();
    expect(fail.unit.illness).toBe(false);

    writeFixture('ac1-psycho-threshold', {
      morale: -70,
      rollSuccess: 30,
      rollFail: 31,
      illnessOn30: ok.unit.illness,
      illnessOn31: fail.unit.illness,
      apiJson: JSON.parse(
        battleApiJson({
          fixtureId: 'ac1-psycho-threshold',
          seed: SEED,
          log: ok.state.log,
          units: ok.state.units.map((u) => ({
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

  test('AC-1: порог debuff −20 — roll 20 дебафф, 21 нет', () => {
    const mk = () => {
      const state = createBattleState({
        matchId: 'ac1-debuff-threshold',
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
      unit.morale = -20;
      unit.effects = [];
      return { state, unit };
    };

    const ok = mk();
    const rndOk = spyOn(Math, 'random').mockReturnValue(rFor(1, 100, 20));
    maybePunishLowMorale(ok.state, ok.unit);
    rndOk.mockRestore();
    expect(hasEffect(ok.unit, 'STRENGTH')).toBe(true);
    expect(ok.state.log.some((l) => l.includes('упадок духа'))).toBe(true);

    const fail = mk();
    const rndFail = spyOn(Math, 'random').mockReturnValue(rFor(1, 100, 21));
    maybePunishLowMorale(fail.state, fail.unit);
    rndFail.mockRestore();
    expect(hasEffect(fail.unit, 'STRENGTH')).toBe(false);

    writeFixture('ac1-debuff-threshold', {
      morale: -20,
      rollSuccess: 20,
      rollFail: 21,
      logOk: ok.state.log,
      logFail: fail.state.log,
      effectsOk: ok.unit.effects.map((e) => e.id),
      effectsFail: fail.unit.effects.map((e) => e.id),
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

  test('AC-7: Катана L4 — стан на roll 72, нет на 73; Нить жизни множит урон', () => {
    const runKatana = (stunRoll: number) => {
      const state = createBattleState({
        matchId: `ac7-stun-${stunRoll}`,
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'GhostWarrior', row: 0, pickOrder: 1 },
          { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes: new Map([
          ['GhostWarrior', hero('GhostWarrior', { damage: 20, accuracy: 100, luck: 0, initiative: 99 })],
          ['B', hero('B', { health: 500, dodge: 0 })],
        ]),
      });
      const gw = state.units.find((u) => u.id === 'p1')!;
      gw.lvl = 4;
      let n = 0;
      const rnd = spyOn(Math, 'random').mockImplementation(() => {
        n += 1;
        // 1: evade randInt(1,100) при missChance≈−4 всё ещё вызывается
        if (n === 1) {
          return rFor(1, 100, 50);
        }
        // 2: melee damage randInt(0,2)
        if (n === 2) {
          return rFor(0, 2, 0);
        }
        // 3: stun rollSrcChance
        return rFor(1, 100, stunRoll);
      });
      state.activeUnitId = 'p1';
      state.turnPlayerId = 'h';
      applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        slot: 1,
        targetId: 'e1',
      });
      rnd.mockRestore();
      return state;
    };

    const stunned = runKatana(72);
    const notStunned = runKatana(73);
    expect(stunned.log.some((l) => l.includes('парализован'))).toBe(true);
    expect(notStunned.log.some((l) => l.includes('парализован'))).toBe(false);
    expect(notStunned.log.some((l) => l.includes('боевого духа'))).toBe(true);

    // Жизнь на нитке: слот 5 → dealDamage с/без эффекта
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
    gw.health = 50;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, { playerId: 'h', unitId: 'p1', action: 'ability', slot: 5 });
    expect(hasEffect(gw, 'LIFE_THREAD')).toBe(true);

    const kinds = ['melee', 'ranged', 'magic'] as const;
    const mults: Record<string, { withThread: number; without: number }> = {};
    for (const kind of kinds) {
      foe.health = 5000;
      const withThread = dealDamage(
        gw,
        foe,
        { kind, forceHit: true, source: kind === 'magic' ? 'FIRE' : undefined },
        state
      );
      const saved = gw.effects.filter((e) => e.id === 'LIFE_THREAD');
      gw.effects = gw.effects.filter((e) => e.id !== 'LIFE_THREAD');
      foe.health = 5000;
      const without = dealDamage(
        gw,
        foe,
        { kind, forceHit: true, source: kind === 'magic' ? 'FIRE' : undefined },
        state
      );
      gw.effects.push(...saved);
      expect(withThread).toBeGreaterThan(without);
      mults[kind] = { withThread, without };
    }

    writeFixture('ac7-katana-thread', {
      stunChanceAtL4: 72,
      stunnedLog: stunned.log,
      notStunnedLog: notStunned.log,
      lifeThreadMults: mults,
    });
  });

  test('AC-8: Пожирание — Метка 20→эфф.5 vs ×1; DEATHWARD не тратится', () => {
    const run = (marked: boolean) => {
      const state = createBattleState({
        matchId: marked ? 'ac8-devour-marked' : 'ac8-devour-plain',
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Dracolich', row: 0, pickOrder: 1 },
          { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes: new Map([
          ['Dracolich', hero('Dracolich', { damage: 40, accuracy: 100, luck: 0, initiative: 99 })],
          ['B', hero('B', { health: 500, armor: 20, dodge: 0 })],
        ]),
      });
      const draco = state.units.find((u) => u.id === 'p1')!;
      const foe = state.units.find((u) => u.id === 'e1')!;
      foe.armor = 20;
      foe.health = 400;
      if (marked) {
        grantEffect(foe, 'MARKED', 2);
      }
      setWard(foe, 'DEATH', 2);
      const wardBefore = foe.resists.DEATH?.wardCharges ?? 0;
      // evade + damage: force via high acc; fix damage die to 0
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
      applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        slot: 5,
        targetId: 'e1',
      });
      rnd.mockRestore();
      return {
        dealt: 400 - foe.health,
        wardAfter: foe.resists.DEATH?.wardCharges ?? 0,
        wardBefore,
        log: state.log,
        marked,
      };
    };

    const withMark = run(true);
    const without = run(false);
    expect(withMark.dealt).toBeGreaterThan(without.dealt);
    expect(withMark.log.some((l) => l.includes('метка'))).toBe(true);
    expect(withMark.wardAfter).toBe(withMark.wardBefore);
    expect(without.wardAfter).toBe(without.wardBefore);
    // Эфф. броня 5 vs 20 при damage 40, die 0: 35 vs 20
    expect(withMark.dealt).toBe(40 - 5);
    expect(without.dealt).toBe(40 - 20);

    writeFixture('ac8-devour-armor', {
      withMark,
      without,
      effectiveArmorMarked: 5,
      armorPlain: 20,
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

  test('AC-10: Хлыст — FIRE в логе; крик с power 31 на 2 цели — floor split', () => {
    const whip = createBattleState({
      matchId: 'ac10-whip-fire',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Incub', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'e2', playerId: 'g', heroClassCode: 'C', row: 0, pickOrder: 2 },
      ],
      heroes: new Map([
        ['Incub', hero('Incub', { mana: 20, power: 30, accuracy: 100, luck: 0, initiative: 99 })],
        ['B', hero('B', { health: 200 })],
        ['C', hero('C', { health: 200 })],
      ]),
    });
    whip.activeUnitId = 'p1';
    whip.turnPlayerId = 'h';
    applyAction(whip, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 2,
      targetId: 'e1',
    });
    expect(whip.log.some((l) => l.includes('⟦FIRE⟧') || /огн/i.test(l))).toBe(true);

    const scream = createBattleState({
      matchId: 'ac10-scream-floor',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Incub', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'e2', playerId: 'g', heroClassCode: 'C', row: 0, pickOrder: 2 },
      ],
      heroes: new Map([
        ['Incub', hero('Incub', { mana: 20, power: 31, accuracy: 100, luck: 0, initiative: 99 })],
        ['B', hero('B', { health: 200, morale: 0 })],
        ['C', hero('C', { health: 200, morale: 0 })],
      ]),
    });
    const incub = scream.units.find((u) => u.id === 'p1')!;
    const e1 = scream.units.find((u) => u.id === 'e1')!;
    const e2 = scream.units.find((u) => u.id === 'e2')!;
    e1.morale = 0;
    e2.morale = 0;
    const hp1 = e1.health;
    const hp2 = e2.health;
    // applyAbility напрямую — без пассива Presence (не портит moraleFactor).
    const rnd = spyOn(Math, 'random').mockReturnValue(0);
    applyAbility(scream, incub, { slot: 1, targetId: 'e1' });
    rnd.mockRestore();
    const d1 = hp1 - e1.health;
    const d2 = hp2 - e2.health;
    // floor(31/2)=15 при morale 0
    expect(d1).toBe(15);
    expect(d2).toBe(15);
    expect(scream.log.some((l) => l.includes('(15)⟦MIND⟧'))).toBe(true);

    writeFixture('ac10-fire-floor', {
      whipLog: whip.log,
      screamDamage: [d1, d2],
      shareFloor: 15,
      power: 31,
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
