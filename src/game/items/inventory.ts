import type { BattleState, BattleTeamEconomy } from '../combat/types';
import { emptyTeamEconomy } from '../economy/wallet';
import { ITEM_CATALOG, type ItemCatalogEntry } from './catalog';

function teamsOf(state: BattleState): [BattleTeamEconomy, BattleTeamEconomy] {
  if (!state.teams) {
    state.teams = [emptyTeamEconomy(), emptyTeamEconomy()];
  }
  if (!state.teams[0]) {
    state.teams[0] = emptyTeamEconomy();
  }
  if (!state.teams[1]) {
    state.teams[1] = emptyTeamEconomy();
  }
  state.teams[0].inventory = state.teams[0].inventory ?? [];
  state.teams[1].inventory = state.teams[1].inventory ?? [];
  return state.teams;
}

/** Инвентарь отряда (коды с повторами = количество). */
export function teamInventory(state: BattleState, team: 0 | 1): number[] {
  return teamsOf(state)[team].inventory;
}

/** Количество экземпляров кода в инвентаре отряда. */
export function itemCount(state: BattleState, team: 0 | 1, code: number): number {
  return teamInventory(state, team).filter((c) => c === code).length;
}

/** Добавить предмет(ы) в инвентарь отряда. */
export function addItem(state: BattleState, team: 0 | 1, code: number, amount = 1): void {
  if (amount <= 0) {
    return;
  }
  const inv = teamInventory(state, team);
  for (let i = 0; i < amount; i++) {
    inv.push(code);
  }
}

/**
 * Убрать до `amount` экземпляров кода. false — не хватило (инвентарь не меняется).
 */
export function removeItem(state: BattleState, team: 0 | 1, code: number, amount = 1): boolean {
  if (amount <= 0) {
    return true;
  }
  const inv = teamInventory(state, team);
  const indices: number[] = [];
  for (let i = 0; i < inv.length && indices.length < amount; i++) {
    if (inv[i] === code) {
      indices.push(i);
    }
  }
  if (indices.length < amount) {
    return false;
  }
  for (let i = indices.length - 1; i >= 0; i--) {
    inv.splice(indices[i]!, 1);
  }
  return true;
}

function sampleCodes(pool: ReadonlyArray<number>, count: number): number[] {
  if (pool.length === 0 || count <= 0) {
    return [];
  }
  const copy = [...pool];
  const result: number[] = [];
  for (let n = 0; n < count && copy.length > 0; n++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy[idx]!);
    copy.splice(idx, 1);
  }
  return result;
}

/** Случайные коды с tier в [minTier, maxTier] (по каталогу). */
export function randomItemCodesByTier(minTier: number, maxTier: number, count = 1): number[] {
  const pool = ITEM_CATALOG.filter((item) => item.tier >= minTier && item.tier <= maxTier).map(
    (item) => item.code
  );
  return sampleCodes(pool, count);
}

/** Случайные коды из указанных категорий (по каталогу). */
export function randomItemCodesByCategories(
  categories: ReadonlyArray<number>,
  count = 1
): number[] {
  const set = new Set(categories);
  const pool = ITEM_CATALOG.filter((item) => set.has(item.category)).map((item) => item.code);
  return sampleCodes(pool, count);
}

/** Случайные коды одной категории с tier в [minTier, maxTier]. */
export function randomItemCodesByCategoryAndTier(
  category: number,
  minTier: number,
  maxTier: number,
  count = 1
): number[] {
  const pool = ITEM_CATALOG.filter(
    (item) => item.category === category && item.tier >= minTier && item.tier <= maxTier
  ).map((item) => item.code);
  return sampleCodes(pool, count);
}

/** Случайные коды из всего каталога. */
export function randomItemCodes(count = 1): number[] {
  return sampleCodes(
    ITEM_CATALOG.map((item) => item.code),
    count
  );
}

export type InventoryStackSummary = {
  code: number;
  name: string;
  description: string;
  quantity: number;
  category: number;
  tier: number;
  target: ItemCatalogEntry['target'];
};

/** Сводка инвентаря: стеки по коду с метаданными каталога. */
export function summarizeInventory(state: BattleState, team: 0 | 1): InventoryStackSummary[] {
  const counts = new Map<number, number>();
  for (const code of teamInventory(state, team)) {
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const stacks: InventoryStackSummary[] = [];
  for (const [code, quantity] of counts) {
    const item = ITEM_CATALOG.find((entry) => entry.code === code);
    if (!item) {
      continue;
    }
    stacks.push({
      code: item.code,
      name: item.name,
      description: item.description,
      quantity,
      category: item.category,
      tier: item.tier,
      target: item.target,
    });
  }
  return stacks;
}
