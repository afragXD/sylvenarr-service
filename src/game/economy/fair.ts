import { randInt } from '../combat/damage';
import type { BattleState, BattleUnit, FairState } from '../combat/types';
import { getItem } from '../items/catalog';
import { addItem, randomItemCodes, removeItem, teamInventory } from '../items/inventory';
import { economyOn } from './on';
import { addTeamGold, spendTeamGold, teamGold } from './wallet';

export type FairActionResult = { ok: true } | { ok: false; message: string };

/** Цена покупки: round(cost × max(0,8; 1,2 − merchant)). */
export function buyPrice(cost: number, merchant: number): number {
  return Math.round(cost * Math.max(0.8, 1.2 - merchant));
}

/** Цена продажи: round(cost × min(0,8; 0,6 + merchant × 0,5)). */
export function sellPrice(cost: number, merchant: number): number {
  return Math.round(cost * Math.min(0.8, 0.6 + merchant * 0.5));
}

function fairFrequencyOf(state: BattleState): number {
  return state.rules.fairFrequency ?? 5;
}

function shopSizeOf(state: BattleState): number {
  return state.rules.shopSize ?? 8;
}

function teamHasLiving(state: BattleState, team: 0 | 1): boolean {
  return state.units.some((u) => u.team === team && u.alive);
}

function playerIdOfTeam(state: BattleState, team: 0 | 1): string {
  return team === 0 ? state.hostPlayerId : state.guestPlayerId;
}

function teamOfPlayer(state: BattleState, playerId: string): 0 | 1 | null {
  if (playerId === state.hostPlayerId) {
    return 0;
  }
  if (playerId === state.guestPlayerId) {
    return 1;
  }
  return null;
}

/**
 * Торговец отряда: живой не-саммон с max merchant;
 * при равенстве — выше initiative, затем первый в state.units.
 * Если героев нет — любой живой юнит.
 */
export function selectTrader(state: BattleState, team: 0 | 1): BattleUnit | null {
  const living = state.units.filter((u) => u.team === team && u.alive);
  const heroes = living.filter((u) => !u.isSummon);
  const pool = heroes.length > 0 ? heroes : living;
  if (pool.length === 0) {
    return null;
  }
  let best = pool[0]!;
  let bestIndex = state.units.indexOf(best);
  for (let i = 1; i < pool.length; i++) {
    const cand = pool[i]!;
    const candIndex = state.units.indexOf(cand);
    const mBest = best.merchant ?? 0;
    const mCand = cand.merchant ?? 0;
    if (mCand > mBest) {
      best = cand;
      bestIndex = candIndex;
      continue;
    }
    if (mCand < mBest) {
      continue;
    }
    if (cand.initiative > best.initiative) {
      best = cand;
      bestIndex = candIndex;
      continue;
    }
    if (cand.initiative < best.initiative) {
      continue;
    }
    if (candIndex < bestIndex) {
      best = cand;
      bestIndex = candIndex;
    }
  }
  return best;
}

function traderOf(state: BattleState, team: 0 | 1): BattleUnit | null {
  const fair = state.fair;
  if (!fair) {
    return null;
  }
  const id = fair.traderIds[team];
  return state.units.find((u) => u.id === id) ?? null;
}

function merchantOf(unit: BattleUnit | null): number {
  return unit?.merchant ?? 0;
}

function turnScore(state: BattleState, team: 0 | 1, trader: BattleUnit): number {
  return trader.initiative + teamGold(state, team) / 75;
}

/** Нужна ли ярмарка на текущем стыке (после stage++). */
export function shouldBeginFair(state: BattleState): boolean {
  if (!economyOn(state)) {
    return false;
  }
  const freq = fairFrequencyOf(state);
  if (freq <= 0) {
    return false;
  }
  const s = state.stage - 1;
  if (s <= 0 || s % freq !== 0) {
    return false;
  }
  return teamHasLiving(state, 0) && teamHasLiving(state, 1);
}

/**
 * Начать фазу ярмарки, если условия выполнены.
 * @returns true — фаза fair активна.
 */
export function beginFairPhase(state: BattleState): boolean {
  if (!shouldBeginFair(state)) {
    return false;
  }
  const trader0 = selectTrader(state, 0);
  const trader1 = selectTrader(state, 1);
  if (!trader0 || !trader1) {
    return false;
  }

  const freq = fairFrequencyOf(state);
  const s = state.stage - 1;
  const index = Math.floor(s / freq);

  const score0 = turnScore(state, 0, trader0);
  const score1 = turnScore(state, 1, trader1);
  let turnTeam: 0 | 1 = 0;
  if (score1 > score0) {
    turnTeam = 1;
  }

  const fair: FairState = {
    index,
    shop: randomItemCodes(shopSizeOf(state)),
    turnTeam,
    stopped: [false, false],
    traderIds: [trader0.id, trader1.id],
  };
  state.fair = fair;
  state.phase = 'fair';
  state.activeUnitId = null;
  state.turnPlayerId = playerIdOfTeam(state, turnTeam);
  state.pendingPrompt = null;
  state.log.push(`Ярмарка ${index} начинается!`);
  return true;
}

function passFairTurn(state: BattleState): void {
  const fair = state.fair;
  if (!fair) {
    return;
  }
  const other = (1 - fair.turnTeam) as 0 | 1;
  if (!fair.stopped[other]) {
    fair.turnTeam = other;
    state.turnPlayerId = playerIdOfTeam(state, other);
  }
}

type FairTurnGate = { ok: true; team: 0 | 1; fair: FairState } | { ok: false; message: string };

function assertFairTurn(
  state: BattleState,
  input: { readonly playerId: string; readonly unitId: string }
): FairTurnGate {
  if (state.phase !== 'fair' || !state.fair) {
    return { ok: false, message: 'Сейчас не ярмарка' };
  }
  const fair = state.fair;
  const team = teamOfPlayer(state, input.playerId);
  if (team === null) {
    return { ok: false, message: 'Вы не участник боя' };
  }
  if (input.playerId !== state.turnPlayerId || team !== fair.turnTeam) {
    return { ok: false, message: 'Сейчас не ваша очередь у прилавка' };
  }
  if (fair.stopped[team]) {
    return { ok: false, message: 'Ваш отряд уже закончил торги' };
  }
  const unit = state.units.find((u) => u.id === input.unitId);
  if (!unit || unit.playerId !== input.playerId) {
    return { ok: false, message: 'Это не ваш юнит' };
  }
  return { ok: true, team, fair };
}

/** Купить предмет с прилавка. */
export function applyFairBuy(
  state: BattleState,
  input: { readonly playerId: string; readonly unitId: string; readonly itemCode: number }
): FairActionResult {
  const gate = assertFairTurn(state, input);
  if (!gate.ok) {
    return gate;
  }
  const { team, fair } = gate;
  const shopIndex = fair.shop.indexOf(input.itemCode);
  if (shopIndex < 0) {
    return { ok: false, message: 'Такого товара нет на прилавке' };
  }
  const item = getItem(input.itemCode);
  if (!item) {
    return { ok: false, message: 'Неизвестный предмет' };
  }
  const trader = traderOf(state, team);
  const price = buyPrice(item.cost, merchantOf(trader));
  if (!spendTeamGold(state, team, price)) {
    return { ok: false, message: `Не хватает золота (нужно ${price})` };
  }
  fair.shop.splice(shopIndex, 1);
  addItem(state, team, item.code, 1);
  const name = trader?.displayName ?? 'Отряд';
  state.log.push(`${name} покупает «${item.name}» за ${price}.`);
  passFairTurn(state);
  return { ok: true };
}

/** Продать один предмет на прилавок. */
export function applyFairSell(
  state: BattleState,
  input: { readonly playerId: string; readonly unitId: string; readonly itemCode: number }
): FairActionResult {
  const gate = assertFairTurn(state, input);
  if (!gate.ok) {
    return gate;
  }
  const { team, fair } = gate;
  const item = getItem(input.itemCode);
  if (!item) {
    return { ok: false, message: 'Неизвестный предмет' };
  }
  if (!removeItem(state, team, input.itemCode, 1)) {
    return { ok: false, message: 'У отряда нет этого предмета' };
  }
  const trader = traderOf(state, team);
  const price = sellPrice(item.cost, merchantOf(trader));
  addTeamGold(state, team, price);
  fair.shop.push(item.code);
  const name = trader?.displayName ?? 'Отряд';
  state.log.push(`${name} продаёт «${item.name}» за ${price}.`);
  passFairTurn(state);
  return { ok: true };
}

/** Продать весь инвентарь (каждый уникальный код — один раз на прилавок). */
export function applyFairSellAll(
  state: BattleState,
  input: { readonly playerId: string; readonly unitId: string }
): FairActionResult {
  const gate = assertFairTurn(state, input);
  if (!gate.ok) {
    return gate;
  }
  const { team, fair } = gate;
  const inv = [...teamInventory(state, team)];
  const trader = traderOf(state, team);
  const merchant = merchantOf(trader);
  const seen = new Set<number>();
  let total = 0;
  for (const code of inv) {
    const item = getItem(code);
    if (!item) {
      continue;
    }
    if (!removeItem(state, team, code, 1)) {
      continue;
    }
    total += sellPrice(item.cost, merchant);
    if (!seen.has(code)) {
      fair.shop.push(code);
      seen.add(code);
    }
  }
  if (total > 0) {
    addTeamGold(state, team, total);
  }
  const name = trader?.displayName ?? 'Отряд';
  state.log.push(`${name} продаёт весь инвентарь${total > 0 ? ` за ${total}` : ''}.`);
  passFairTurn(state);
  return { ok: true };
}

/**
 * Закончить торги. Бонус один раз: round(classGold × 1,35) + randInt(50, 100).
 * @returns `{ done: true }` — оба отряда закончили.
 */
export function applyFairStop(
  state: BattleState,
  input: { readonly playerId: string; readonly unitId: string }
): FairActionResult & { done?: boolean } {
  const gate = assertFairTurn(state, input);
  if (!gate.ok) {
    return gate;
  }
  const { team, fair } = gate;
  fair.stopped[team] = true;

  const trader = traderOf(state, team);
  const classGold = trader ? (state.catalog[trader.heroClassCode]?.gold ?? 0) : 0;
  const bonus = Math.round(classGold * 1.35) + randInt(50, 100);
  addTeamGold(state, team, bonus);
  const name = trader?.displayName ?? 'Отряд';
  state.log.push(`${name} заканчивает торги (+${bonus} золота).`);

  if (fair.stopped[0] && fair.stopped[1]) {
    return { ok: true, done: true };
  }
  passFairTurn(state);
  return { ok: true, done: false };
}

export function fairPhaseFullyResolved(state: BattleState): boolean {
  const fair = state.fair;
  return Boolean(fair?.stopped[0] && fair.stopped[1]);
}

export type FairShopSummaryEntry = {
  code: number;
  name: string;
  description: string;
  category: number;
  tier: number;
  cost: number;
  buyPrice: number;
};

export type FairSellSummaryEntry = {
  code: number;
  name: string;
  sellPrice: number;
};

/** Сводка ярмарки для API: цены покупки у текущего торговца и продажи для обеих сторон. */
export function summarizeFair(state: BattleState): {
  index: number;
  turnTeam: 0 | 1;
  stopped: [boolean, boolean];
  traderIds: [string, string];
  shop: FairShopSummaryEntry[];
  sellByTeam: [FairSellSummaryEntry[], FairSellSummaryEntry[]];
} | null {
  const fair = state.fair;
  if (!fair || state.phase !== 'fair') {
    return null;
  }
  const turnTrader = traderOf(state, fair.turnTeam);
  const turnMerchant = merchantOf(turnTrader);
  const shop: FairShopSummaryEntry[] = [];
  for (const code of fair.shop) {
    const item = getItem(code);
    if (!item) {
      continue;
    }
    shop.push({
      code: item.code,
      name: item.name,
      description: item.description,
      category: item.category,
      tier: item.tier,
      cost: item.cost,
      buyPrice: buyPrice(item.cost, turnMerchant),
    });
  }

  const sellFor = (team: 0 | 1): FairSellSummaryEntry[] => {
    const trader = traderOf(state, team);
    const merchant = merchantOf(trader);
    const seen = new Set<number>();
    const out: FairSellSummaryEntry[] = [];
    for (const code of teamInventory(state, team)) {
      if (seen.has(code)) {
        continue;
      }
      seen.add(code);
      const item = getItem(code);
      if (!item) {
        continue;
      }
      out.push({
        code: item.code,
        name: item.name,
        sellPrice: sellPrice(item.cost, merchant),
      });
    }
    return out;
  };

  return {
    index: fair.index,
    turnTeam: fair.turnTeam,
    stopped: [fair.stopped[0], fair.stopped[1]],
    traderIds: [fair.traderIds[0], fair.traderIds[1]],
    shop,
    sellByTeam: [sellFor(0), sellFor(1)],
  };
}
