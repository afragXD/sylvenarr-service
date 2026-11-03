import { describe, expect, test } from 'bun:test';

import { applyAction, createBattleState, toBattleSummary } from '../combat/engine';
import type { HeroClassStats } from '../combat/types';
import { addItem, itemCount } from '../items/inventory';
import {
  applyFairBuy,
  applyFairSell,
  applyFairStop,
  beginFairPhase,
  buyPrice,
  selectTrader,
  sellPrice,
  shouldBeginFair,
} from './fair';
import { addTeamGold, teamGold } from './wallet';

const hero = (code: string, extra: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 200,
  damage: 20,
  armor: 10,
  initiative: 10,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 20,
  mana: 10,
  maxMana: 10,
  gold: 100,
  size: 1,
  ...extra,
});

function fairBattle(opts?: {
  fairFrequency?: number;
  shopSize?: number;
  hostIni?: number;
  guestIni?: number;
  hostGold?: number;
  guestGold?: number;
}) {
  const state = createBattleState({
    matchId: 'fair-t12',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      { id: 'h1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
      { id: 'g1', playerId: 'g', heroClassCode: 'Assassin', row: 0, pickOrder: 1 },
    ],
    heroes: new Map([
      ['Knight', hero('Knight', { initiative: opts?.hostIni ?? 10, gold: opts?.hostGold ?? 100 })],
      [
        'Assassin',
        hero('Assassin', { initiative: opts?.guestIni ?? 10, gold: opts?.guestGold ?? 100 }),
      ],
    ]),
    rules: {
      maxTeamSize: 8,
      maxRowSize: 4,
      maxRounds: 40,
      healthBonus: 1,
      startingLevel: 1,
      fairEnabled: true,
      fairFrequency: opts?.fairFrequency ?? 5,
      shopSize: opts?.shopSize ?? 8,
      goldBonus: 1,
    },
  });
  // Стартовые перки/инвентарь не мешают ярмарке; инвентарь чистим.
  if (state.teams) {
    state.teams[0]!.inventory = [];
    state.teams[1]!.inventory = [];
  }
  // Закрыть возможную фазу перков (startingLevel 1 обычно без неё).
  if (state.phase === 'perks' && state.perkOffers) {
    for (const offer of state.perkOffers) {
      applyAction(state, {
        playerId: offer.playerId,
        unitId: offer.unitId,
        action: 'perk_skip',
      });
    }
  }
  return state;
}

function forceFair(state: ReturnType<typeof fairBattle>, stage = 6): boolean {
  state.stage = stage;
  state.phase = 'combat';
  state.perkOffers = null;
  state.fair = null;
  return beginFairPhase(state);
}

describe('fair prices (T12)', () => {
  test('buy/sell при merchant 0 / 0.2 / 0.45', () => {
    const cost = 100;
    expect(buyPrice(cost, 0)).toBe(120);
    expect(buyPrice(cost, 0.2)).toBe(100);
    expect(buyPrice(cost, 0.45)).toBe(80);

    expect(sellPrice(cost, 0)).toBe(60);
    expect(sellPrice(cost, 0.2)).toBe(70);
    expect(sellPrice(cost, 0.45)).toBe(80);
  });
});

describe('fair phase (T12)', () => {
  test('порядок: выше initiative + gold/75; при равенстве — хозяин', () => {
    const hostFirst = fairBattle({ hostIni: 20, guestIni: 5 });
    expect(forceFair(hostFirst)).toBe(true);
    expect(hostFirst.fair!.turnTeam).toBe(0);
    expect(hostFirst.turnPlayerId).toBe('h');

    const guestFirst = fairBattle({ hostIni: 5, guestIni: 20 });
    expect(forceFair(guestFirst)).toBe(true);
    expect(guestFirst.fair!.turnTeam).toBe(1);
    expect(guestFirst.turnPlayerId).toBe('g');

    const tie = fairBattle({ hostIni: 10, guestIni: 10 });
    // Одинаковое стартовое золото отряда → ничья → хозяин.
    expect(forceFair(tie)).toBe(true);
    expect(tie.fair!.turnTeam).toBe(0);
  });

  test('очередь после «закончить торги» остаётся у соперника', () => {
    const state = fairBattle({ hostIni: 30, guestIni: 1 });
    expect(forceFair(state)).toBe(true);
    expect(state.fair!.turnTeam).toBe(0);
    const host = state.units.find((u) => u.team === 0)!;
    const guest = state.units.find((u) => u.team === 1)!;

    expect(
      applyAction(state, {
        playerId: 'h',
        unitId: host.id,
        action: 'fair_stop',
      }).ok
    ).toBe(true);
    expect(state.phase).toBe('fair');
    expect(state.fair!.stopped[0]).toBe(true);
    expect(state.fair!.turnTeam).toBe(1);

    // Гость покупает — очередь не уходит к остановившемуся хозяину.
    const code = state.fair!.shop[0]!;
    addTeamGold(state, 1, 50_000);
    expect(
      applyAction(state, {
        playerId: 'g',
        unitId: guest.id,
        action: 'fair_buy',
        itemCode: code,
      }).ok
    ).toBe(true);
    expect(state.fair!.turnTeam).toBe(1);
    expect(state.turnPlayerId).toBe('g');
  });

  test('бонус за стоп один раз; повторный стоп — отказ', () => {
    const state = fairBattle({ hostIni: 30, guestIni: 1, hostGold: 200 });
    expect(forceFair(state)).toBe(true);
    const host = state.units.find((u) => u.team === 0)!;
    const before = teamGold(state, 0);
    expect(applyFairStop(state, { playerId: 'h', unitId: host.id }).ok).toBe(true);
    const after = teamGold(state, 0);
    expect(after).toBeGreaterThan(before);
    // Класс Knight gold=200 → round(200*1.35)+[50..100] = 270+[50..100]
    expect(after - before).toBeGreaterThanOrEqual(320);
    expect(after - before).toBeLessThanOrEqual(370);

    expect(applyFairStop(state, { playerId: 'h', unitId: host.id }).ok).toBe(false);
  });

  test('проданное появляется на прилавке; нехватка золота — отказ', () => {
    const state = fairBattle({ hostIni: 30, guestIni: 1, shopSize: 4 });
    expect(forceFair(state)).toBe(true);
    const host = state.units.find((u) => u.team === 0)!;
    addItem(state, 0, 411, 1);
    const shopBefore = state.fair!.shop.length;

    expect(applyFairSell(state, { playerId: 'h', unitId: host.id, itemCode: 411 }).ok).toBe(true);
    expect(state.fair!.shop.length).toBe(shopBefore + 1);
    expect(state.fair!.shop.includes(411)).toBe(true);
    expect(itemCount(state, 0, 411)).toBe(0);

    // Ход перешёл гостю; вернём хозяину для теста покупки без золота.
    state.fair!.turnTeam = 0;
    state.fair!.stopped = [false, false];
    state.turnPlayerId = 'h';
    if (state.teams) {
      state.teams[0]!.gold = 0;
    }
    const code = state.fair!.shop[0]!;
    const buy = applyFairBuy(state, {
      playerId: 'h',
      unitId: host.id,
      itemCode: code,
    });
    expect(buy.ok).toBe(false);
    if (!buy.ok) {
      expect(buy.message).toContain('золота');
    }
  });

  test('нет ярмарки, если отряд мёртв', () => {
    const state = fairBattle();
    for (const u of state.units.filter((x) => x.team === 1)) {
      u.alive = false;
      u.health = 0;
    }
    state.stage = 6;
    expect(shouldBeginFair(state)).toBe(false);
    expect(beginFairPhase(state)).toBe(false);
  });

  test('стык раундов: fairFrequency → фаза fair; сводка с ценами', () => {
    const state = fairBattle({ fairFrequency: 1, hostIni: 40, guestIni: 1 });
    // stage=1 в бою; завершаем единственный ход хозяина wait… проще форсировать stage.
    expect(forceFair(state, 2)).toBe(true); // s=1, 1%1===0
    expect(state.phase).toBe('fair');
    expect(state.log.some((l) => l.startsWith('Ярмарка '))).toBe(true);
    expect(state.activeUnitId).toBeNull();

    const summary = toBattleSummary(state);
    expect(summary.phase).toBe('fair');
    expect(summary.fair).not.toBeNull();
    expect(summary.fair!.shop.length).toBeGreaterThan(0);
    expect(summary.fair!.shop[0]!.buyPrice).toBeGreaterThan(0);
    expect(summary.fair!.sellByTeam[0]).toEqual([]);
    expect(summary.fair!.traderIds[0]).toBe(state.fair!.traderIds[0]);
  });

  test('торговец: max merchant, затем initiative', () => {
    const state = createBattleState({
      matchId: 'traders',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'h1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'h2', playerId: 'h', heroClassCode: 'Abbess', row: 0, pickOrder: 2 },
        { id: 'g1', playerId: 'g', heroClassCode: 'Assassin', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Knight', hero('Knight', { initiative: 50 })],
        ['Abbess', hero('Abbess', { initiative: 5 })],
        ['Assassin', hero('Assassin')],
      ]),
      rules: {
        maxTeamSize: 8,
        maxRowSize: 4,
        maxRounds: 20,
        healthBonus: 1,
        startingLevel: 1,
        fairEnabled: true,
        fairFrequency: 5,
        shopSize: 8,
        goldBonus: 1,
      },
    });
    const abbess = state.units.find((u) => u.heroClassCode === 'Abbess')!;
    expect(abbess.merchant).toBe(0.2);
    const trader = selectTrader(state, 0)!;
    expect(trader.heroClassCode).toBe('Abbess');
  });

  test('оба стопа → Ярмарка завершена', () => {
    const state = fairBattle({ hostIni: 30, guestIni: 1 });
    expect(forceFair(state)).toBe(true);
    const host = state.units.find((u) => u.team === 0)!;
    const guest = state.units.find((u) => u.team === 1)!;
    expect(applyAction(state, { playerId: 'h', unitId: host.id, action: 'fair_stop' }).ok).toBe(
      true
    );
    expect(applyAction(state, { playerId: 'g', unitId: guest.id, action: 'fair_stop' }).ok).toBe(
      true
    );
    expect(state.fair).toBeNull();
    expect(state.log.some((l) => l === 'Ярмарка завершена')).toBe(true);
    expect(state.phase === 'combat' || state.phase === 'perks').toBe(true);
  });
});
