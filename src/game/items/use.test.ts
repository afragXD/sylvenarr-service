import { afterEach, describe, expect, test } from 'bun:test';

import { applyAction, createBattleState, toBattleSummary } from '../combat/engine';
import type { HeroClassStats } from '../combat/types';
import { addItem, itemCount } from './inventory';
import { clearItemUsagesForTests, getItemUsage, registerItemUsage } from './usages';

const hero = (code: string): HeroClassStats => ({
  code,
  displayName: code,
  health: 100,
  damage: 10,
  armor: 0,
  initiative: 10,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 10,
  mana: 5,
  maxMana: 5,
  gold: 100,
  size: 1,
});

function fairState(opts?: { fairEnabled?: boolean }) {
  const state = createBattleState({
    matchId: 'item-t5',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      { id: 'h1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
      { id: 'g1', playerId: 'g', heroClassCode: 'Assassin', row: 0, pickOrder: 1 },
    ],
    heroes: new Map([
      ['Knight', hero('Knight')],
      ['Assassin', hero('Assassin')],
    ]),
    rules: {
      maxTeamSize: 8,
      maxRowSize: 4,
      maxRounds: 20,
      healthBonus: 1,
      startingLevel: 1,
      fairEnabled: opts?.fairEnabled ?? true,
      goldBonus: 1,
    },
  });
  state.teams![0]!.inventory = [];
  state.teams![1]!.inventory = [];
  const actor = state.units.find((u) => u.id === state.activeUnitId)!;
  return { state, actor };
}

afterEach(() => {
  clearItemUsagesForTests();
});

describe('item action (T5)', () => {
  test('отказ при выключенном переключателе', () => {
    const { state, actor } = fairState({ fairEnabled: false });
    addItem(state, actor.team, 237, 1);
    actor.perks = ['MISC'];
    const result = applyAction(state, {
      playerId: actor.playerId,
      unitId: actor.id,
      action: 'item',
      itemCode: 237,
      targetId: actor.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('выключены');
    }
    expect(itemCount(state, actor.team, 237)).toBe(1);
  });

  test('отказ без перка категории', () => {
    const { state, actor } = fairState();
    addItem(state, actor.team, 237, 1);
    actor.perks = [];
    registerItemUsage(237, () => ({ status: 'done' }));
    const result = applyAction(state, {
      playerId: actor.playerId,
      unitId: actor.id,
      action: 'item',
      itemCode: 237,
      targetId: actor.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Нужен навык: Расходники');
    }
    expect(itemCount(state, actor.team, 237)).toBe(1);
  });

  test('sellOnly — отказ без траты хода и предмета', () => {
    const { state, actor } = fairState();
    addItem(state, actor.team, 217, 1);
    actor.perks = ['MISC'];
    const activeBefore = state.activeUnitId;
    const result = applyAction(state, {
      playerId: actor.playerId,
      unitId: actor.id,
      action: 'item',
      itemCode: 217,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('продажи');
    }
    expect(itemCount(state, actor.team, 217)).toBe(1);
    expect(state.activeUnitId).toBe(activeBefore);
  });

  test('успех расходует экземпляр и тратит ход', () => {
    const { state, actor } = fairState();
    addItem(state, actor.team, 237, 2);
    actor.perks = ['MISC'];
    registerItemUsage(237, () => ({ status: 'done' }));
    const result = applyAction(state, {
      playerId: actor.playerId,
      unitId: actor.id,
      action: 'item',
      itemCode: 237,
      targetId: actor.id,
    });
    expect(result).toEqual({ ok: true });
    expect(itemCount(state, actor.team, 237)).toBe(1);
    expect(state.doneIds).toContain(actor.id);
    expect(state.activeUnitId).not.toBe(actor.id);
  });

  test('handler keepTurn — ход не тратится, предмет расходуется', () => {
    const { state, actor } = fairState();
    addItem(state, actor.team, 237, 1);
    actor.perks = ['MISC'];
    registerItemUsage(237, () => ({ status: 'done', keepTurn: true }));
    const result = applyAction(state, {
      playerId: actor.playerId,
      unitId: actor.id,
      action: 'item',
      itemCode: 237,
      targetId: actor.id,
    });
    expect(result).toEqual({ ok: true });
    expect(itemCount(state, actor.team, 237)).toBe(0);
    expect(state.activeUnitId).toBe(actor.id);
    expect(state.doneIds).not.toContain(actor.id);
  });

  test('Упаковка: 50% не тратит ход', () => {
    const { state, actor } = fairState();
    addItem(state, actor.team, 237, 1);
    actor.perks = ['MISC', 'DOUBLE_USING_INVENTORY'];
    registerItemUsage(237, () => ({ status: 'done' }));
    const originalRandom = Math.random;
    Math.random = () => 0; // chancePercent: randInt(1,100) → 1 ≤ 50
    try {
      const result = applyAction(state, {
        playerId: actor.playerId,
        unitId: actor.id,
        action: 'item',
        itemCode: 237,
        targetId: actor.id,
      });
      expect(result).toEqual({ ok: true });
      expect(itemCount(state, actor.team, 237)).toBe(0);
      expect(state.activeUnitId).toBe(actor.id);
      expect(state.log.some((line) => line.includes('упаковку'))).toBe(true);
    } finally {
      Math.random = originalRandom;
    }
  });

  test('Лудоман: кейс не тратит ход', () => {
    const { state, actor } = fairState();
    addItem(state, actor.team, 167, 1);
    actor.perks = ['MISC', 'LUDOMANIA'];
    registerItemUsage(167, () => ({ status: 'done' }));
    const result = applyAction(state, {
      playerId: actor.playerId,
      unitId: actor.id,
      action: 'item',
      itemCode: 167,
      targetId: actor.id,
    });
    expect(result).toEqual({ ok: true });
    expect(itemCount(state, actor.team, 167)).toBe(0);
    expect(state.activeUnitId).toBe(actor.id);
  });

  test('заглушка usages — «не реализовано» для неизвестного кода', () => {
    const outcome = getItemUsage(999_001)({} as never);
    expect(outcome.status).toBe('reject');
    if (outcome.status === 'reject') {
      expect(outcome.message).toBe('не реализовано');
    }
  });

  test('сводка: economyEnabled, inventory, perks, merchant', () => {
    const { state, actor } = fairState();
    addItem(state, actor.team, 237, 2);
    actor.perks = ['MISC', 'TALISMANS'];
    actor.merchant = 0.25;
    const summary = toBattleSummary(state);
    expect(summary.economyEnabled).toBe(true);
    expect(summary.units.find((u) => u.id === actor.id)?.perks).toEqual(['MISC', 'TALISMANS']);
    expect(summary.units.find((u) => u.id === actor.id)?.merchant).toBe(0.25);
    expect(summary.teams[actor.team].inventory).toEqual([
      expect.objectContaining({
        code: 237,
        name: 'Самоцвет жизни',
        quantity: 2,
        category: 7,
        tier: 2,
        target: 'ally',
      }),
    ]);
  });

  test('pendingPrompt source item завершается действием item + choice', () => {
    const { state, actor } = fairState();
    addItem(state, actor.team, 347, 1);
    actor.perks = ['MISC'];
    let phase: 'open' | 'pick' = 'open';
    registerItemUsage(347, (ctx) => {
      if (phase === 'open') {
        phase = 'pick';
        ctx.state.pendingPrompt = {
          unitId: ctx.invoker.id,
          kind: 'mimic-copy',
          options: [{ id: '237', label: 'Самоцвет' }],
          context: {},
          source: 'item',
          itemCode: 347,
        };
        return { status: 'pending' };
      }
      expect(ctx.choice).toBe('237');
      ctx.state.pendingPrompt = null;
      return { status: 'done' };
    });

    const open = applyAction(state, {
      playerId: actor.playerId,
      unitId: actor.id,
      action: 'item',
      itemCode: 347,
      targetId: actor.id,
    });
    expect(open).toEqual({ ok: true });
    expect(state.pendingPrompt?.source).toBe('item');
    expect(itemCount(state, actor.team, 347)).toBe(1);

    const finish = applyAction(state, {
      playerId: actor.playerId,
      unitId: actor.id,
      action: 'item',
      choice: '237',
    });
    expect(finish).toEqual({ ok: true });
    expect(itemCount(state, actor.team, 347)).toBe(0);
    expect(state.pendingPrompt).toBeNull();
  });
});
