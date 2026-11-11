import type { BattleState, BattleTeamEconomy } from '../../game/combat/types';
import { emptyTeamEconomy } from '../../game/economy/wallet';
import { ITEM_CATALOG } from '../../game/items/catalog';
import type { CreatorMatchesModel } from './model';

const KNOWN_CODES = new Set(ITEM_CATALOG.map((item) => item.code));

function asInt(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Некорректное число');
  }
  return Math.trunc(value);
}

function ensureTeams(state: BattleState): [BattleTeamEconomy, BattleTeamEconomy] {
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

/**
 * Полная замена инвентаря отряда. Без записи в state.log.
 * Стеки с quantity 0 отбрасываются; неизвестный code → ошибка.
 */
export function applyTeamInventoryPatch(
  state: BattleState,
  team: 0 | 1,
  stacks: CreatorMatchesModel.inventoryStackPatch[]
): void {
  const codes: number[] = [];
  for (const stack of stacks) {
    const code = asInt(stack.code);
    const quantity = asInt(stack.quantity);
    if (quantity < 0) {
      throw new Error('Количество не может быть отрицательным');
    }
    if (quantity === 0) {
      continue;
    }
    if (!KNOWN_CODES.has(code)) {
      throw new Error(`Неизвестный предмет: ${code}`);
    }
    for (let i = 0; i < quantity; i++) {
      codes.push(code);
    }
  }
  const teams = ensureTeams(state);
  teams[team].inventory = codes;
}
