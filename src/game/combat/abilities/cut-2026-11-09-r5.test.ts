import { describe, expect, test } from 'bun:test';

import {
  grantEffect,
  hasEffect,
  tickEffectsOnTurnEnd,
  tickEffectsOnTurnStart,
} from '../effects';
import { createBattleState } from '../engine';
import type { BattleState, BattleUnit, HeroClassStats } from '../types';

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

/**
 * CUT-2026-11-09 r5: один раунд носителя = один start+end, плюс N «Ждать»
 * (доп. start+end без сброса wasEffected / effectsAgedThisRound).
 */
function runCarrierRound(
  unit: BattleUnit,
  state: BattleState,
  opts: { waits?: number; resetFlags?: boolean } = {}
): void {
  const waits = opts.waits ?? 0;
  if (opts.resetFlags !== false) {
    unit.wasEffected = false;
    unit.effectsAgedThisRound = false;
  }
  tickEffectsOnTurnStart(unit);
  tickEffectsOnTurnEnd(unit, state);
  for (let i = 0; i < waits; i += 1) {
    tickEffectsOnTurnStart(unit);
    tickEffectsOnTurnEnd(unit, state);
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
    const { state, unit } = battle();
    grantEffect(unit, 'BLESSED', 2, 0.5);
    unit.effects.find((e) => e.id === 'BLESSED')!.fresh = undefined;

    runCarrierRound(unit, state, { waits: 1 });
    expect(hasEffect(unit, 'BLESSED')).toBe(true);
    expect(unit.effects.find((e) => e.id === 'BLESSED')?.rounds).toBe(1);

    runCarrierRound(unit, state, { waits: 0 });
    expect(hasEffect(unit, 'BLESSED')).toBe(false);
  });

  test('BLESSED × два «Ждать»: ровно 2 раунда', () => {
    // CUT-2026-11-09 AC-11 / r5
    const { state, unit } = battle();
    grantEffect(unit, 'BLESSED', 2, 0.5);
    unit.effects.find((e) => e.id === 'BLESSED')!.fresh = undefined;

    runCarrierRound(unit, state, { waits: 2 });
    expect(hasEffect(unit, 'BLESSED')).toBe(true);
    expect(unit.effects.find((e) => e.id === 'BLESSED')?.rounds).toBe(1);

    runCarrierRound(unit, state, { waits: 2 });
    expect(hasEffect(unit, 'BLESSED')).toBe(false);
  });

  test('BLESSED без «Ждать»: длительность как в r4 (2 раунда)', () => {
    // CUT-2026-11-09 r5 регресс
    const { state, unit } = battle();
    grantEffect(unit, 'BLESSED', 2, 0.5);
    unit.effects.find((e) => e.id === 'BLESSED')!.fresh = undefined;

    runCarrierRound(unit, state);
    expect(unit.effects.find((e) => e.id === 'BLESSED')?.rounds).toBe(1);
    runCarrierRound(unit, state);
    expect(hasEffect(unit, 'BLESSED')).toBe(false);
  });

  test('HASTE × «Ждать»: срок = длительность, wait не съедает раунд', () => {
    // CUT-2026-11-09 r5 не-DoT
    const { state, unit } = battle();
    grantEffect(unit, 'HASTE', 2, 20);
    unit.effects.find((e) => e.id === 'HASTE')!.fresh = undefined;

    runCarrierRound(unit, state, { waits: 1 });
    expect(hasEffect(unit, 'HASTE')).toBe(true);
    expect(unit.effects.find((e) => e.id === 'HASTE')?.rounds).toBe(1);

    runCarrierRound(unit, state, { waits: 1 });
    expect(hasEffect(unit, 'HASTE')).toBe(false);
  });

  test('POISON × «Ждать»: тик и срок раз за раунд', () => {
    // CUT-2026-11-09 r5 DoT
    const { state, unit } = battle();
    unit.health = 500;
    unit.maxHp = 500;
    grantEffect(unit, 'POISON', 2, 1);
    unit.effects.find((e) => e.id === 'POISON')!.fresh = undefined;

    let ticks = 0;
    const hp0 = unit.health;
    runCarrierRound(unit, state, { waits: 1 });
    if (unit.health < hp0) {
      ticks += 1;
    }
    expect(ticks).toBe(1);
    expect(hasEffect(unit, 'POISON')).toBe(true);
    expect(unit.effects.find((e) => e.id === 'POISON')?.rounds).toBe(1);
    // Второй ход раунда («Ждать») не тикает и не старит.
    expect(unit.wasEffected).toBe(true);
    expect(unit.effectsAgedThisRound).toBe(true);

    const hp1 = unit.health;
    runCarrierRound(unit, state, { waits: 1 });
    if (unit.health < hp1) {
      ticks += 1;
    }
    expect(ticks).toBe(2);
    expect(hasEffect(unit, 'POISON')).toBe(false);
  });

  test('POISON без «Ждать»: 2 тика и спад за 2 раунда', () => {
    // CUT-2026-11-09 r5 регресс DoT
    const { state, unit } = battle();
    unit.health = 500;
    unit.maxHp = 500;
    grantEffect(unit, 'POISON', 2, 1);
    unit.effects.find((e) => e.id === 'POISON')!.fresh = undefined;

    let ticks = 0;
    for (let i = 0; i < 2; i += 1) {
      const before = unit.health;
      runCarrierRound(unit, state);
      if (unit.health < before) {
        ticks += 1;
      }
    }
    expect(ticks).toBe(2);
    expect(hasEffect(unit, 'POISON')).toBe(false);
  });
});
