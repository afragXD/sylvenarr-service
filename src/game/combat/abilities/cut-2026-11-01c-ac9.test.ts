import { afterEach, describe, expect, spyOn, test } from 'bun:test';

import { applyAction, createBattleState } from '../engine';
import type { HeroClassStats } from '../types';
import {
  massDegradationBaseChance,
  massDegradationLevelLoss,
} from './witch';
import { degradationSquareTargets } from './targets';
import { listPilotAbilities } from './registry';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 200,
  damage: 20,
  armor: 0,
  initiative: 40,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 20,
  mana: 20,
  maxMana: 20,
  gold: 100,
  size: 1,
  ...overrides,
});

describe('CUT-2026-11-01c AC-9 Witch mass degradation', () => {
  let randomSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    randomSpy?.mockRestore();
    randomSpy = undefined;
  });

  test('fixture chance/loss formulas L10', () => {
    expect(massDegradationBaseChance(10)).toBe(95);
    expect(massDegradationBaseChance(5)).toBe(90);
    expect(massDegradationBaseChance(20)).toBe(95);
    expect(massDegradationLevelLoss(10, true)).toBe(3);
    expect(massDegradationLevelLoss(10, false)).toBe(2);
    // Цепочка успехов −15 п.п.: 95 → 80 → 65 → 50
    let c = massDegradationBaseChance(10);
    const chain = [c];
    for (let i = 0; i < 3; i += 1) {
      c = Math.max(0, c - 15);
      chain.push(c);
    }
    expect(chain).toEqual([95, 80, 65, 50]);
  });

  test('fixture square 2×2: цель + сосед + двое напротив', () => {
    const state = createBattleState({
      matchId: 'ac9-sq',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'w', playerId: 'h', heroClassCode: 'Witch', row: 0, pickOrder: 1 },
        { id: 'f0', playerId: 'g', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'f1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 2 },
        { id: 'b0', playerId: 'g', heroClassCode: 'C', row: 1, pickOrder: 3 },
        { id: 'b1', playerId: 'g', heroClassCode: 'D', row: 1, pickOrder: 4 },
      ],
      heroes: new Map([
        ['Witch', hero('Witch')],
        ['A', hero('A')],
        ['B', hero('B')],
        ['C', hero('C')],
        ['D', hero('D')],
      ]),
    });
    const witch = state.units.find((u) => u.id === 'w')!;
    const f0 = state.units.find((u) => u.id === 'f0')!;
    const ids = degradationSquareTargets(state, witch, f0).map((u) => u.id);
    expect(ids).toEqual(['f0', 'f1', 'b0', 'b1']);
  });

  test('fixture cast: 5 МР, КД 3, primary −3 / others −2 при L10, цепочка шансов', () => {
    randomSpy = spyOn(Math, 'random').mockReturnValue(0); // всегда успех Chance
    const state = createBattleState({
      matchId: 'ac9-cast',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'w', playerId: 'h', heroClassCode: 'Witch', row: 0, pickOrder: 1 },
        { id: 'f0', playerId: 'g', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'f1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 2 },
        { id: 'b0', playerId: 'g', heroClassCode: 'C', row: 1, pickOrder: 3 },
        { id: 'b1', playerId: 'g', heroClassCode: 'D', row: 1, pickOrder: 4 },
      ],
      heroes: new Map([
        ['Witch', hero('Witch', { mana: 20 })],
        ['A', hero('A')],
        ['B', hero('B')],
        ['C', hero('C')],
        ['D', hero('D')],
      ]),
    });
    const witch = state.units.find((u) => u.id === 'w')!;
    witch.lvl = 10;
    witch.mana = 20;
    for (const id of ['f0', 'f1', 'b0', 'b1']) {
      const unit = state.units.find((u) => u.id === id)!;
      unit.lvl = 10;
      unit.hiddenLvl = 10;
    }
    const meta = listPilotAbilities(state, witch).find((a) => a.slot === 4)!;
    expect(meta.label).toBe('Массовая деградация');
    expect(meta.disabledReason).toBeNull();

    state.activeUnitId = 'w';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'w',
      action: 'ability',
      slot: 4,
      targetId: 'f0',
    });
    expect(result.ok).toBe(true);
    expect(witch.mana).toBe(15);
    expect(witch.degradationCd).toBe(3);
    expect(state.units.find((u) => u.id === 'f0')!.lvl).toBe(7); // −3
    expect(state.units.find((u) => u.id === 'f1')!.lvl).toBe(8); // −2
    expect(state.units.find((u) => u.id === 'b0')!.lvl).toBe(8);
    expect(state.units.find((u) => u.id === 'b1')!.lvl).toBe(8);
    expect(state.log.some((line) => line.includes('шанс был 95%'))).toBe(true);
    expect(state.log.some((line) => line.includes('шанс был 80%'))).toBe(true);
    expect(state.log.some((line) => line.includes('шанс был 65%'))).toBe(true);
    expect(state.log.some((line) => line.includes('шанс был 50%'))).toBe(true);
  });

  test('fixture fail: шанс не падает после провала', () => {
    randomSpy = spyOn(Math, 'random').mockReturnValue(0);
    const state = createBattleState({
      matchId: 'ac9-fail',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'w', playerId: 'h', heroClassCode: 'Witch', row: 0, pickOrder: 1 },
        { id: 'f0', playerId: 'g', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'f1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 2 },
      ],
      heroes: new Map([
        ['Witch', hero('Witch', { mana: 20 })],
        ['A', hero('A')],
        ['B', hero('B')],
      ]),
    });
    const witch = state.units.find((u) => u.id === 'w')!;
    witch.lvl = 10;
    const f0 = state.units.find((u) => u.id === 'f0')!;
    const f1 = state.units.find((u) => u.id === 'f1')!;
    f0.lvl = 10;
    f1.lvl = 10;
    // Иммун MIND на primary → гарантированный провал без −15 п.п.
    f0.resists.MIND = { value: 0, immune: true };
    state.activeUnitId = 'w';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'w',
      action: 'ability',
      slot: 4,
      targetId: 'f0',
    });
    expect(f0.lvl).toBe(10);
    expect(state.log.some((line) => line.includes('шанс 95% сохранён'))).toBe(true);
    expect(f1.lvl).toBe(8);
    expect(state.log.some((line) => line.includes('шанс был 95%'))).toBe(true);
  });

  test('fixture MIND/LOWERING ward учитывается', () => {
    randomSpy = spyOn(Math, 'random').mockReturnValue(0);
    const state = createBattleState({
      matchId: 'ac9-ward',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'w', playerId: 'h', heroClassCode: 'Witch', row: 0, pickOrder: 1 },
        { id: 'inq', playerId: 'g', heroClassCode: 'Inquisitor', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Witch', hero('Witch', { mana: 20 })],
        ['Inquisitor', hero('Inquisitor')],
      ]),
    });
    const witch = state.units.find((u) => u.id === 'w')!;
    const inq = state.units.find((u) => u.id === 'inq')!;
    witch.lvl = 10;
    const before = inq.lvl;
    // Снимаем вард MIND — проверяем именно LOWERINGLEVEL.
    inq.resists.MIND = { value: 0 };
    expect((inq.resists.LOWERINGLEVEL?.wardCharges ?? 0) > 0).toBe(true);
    state.activeUnitId = 'w';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'w',
      action: 'ability',
      slot: 4,
      targetId: 'inq',
    });
    expect(inq.lvl).toBe(before);
    expect(inq.resists.LOWERINGLEVEL?.wardCharges ?? 0).toBe(0);
  });
});
