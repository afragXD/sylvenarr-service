import type { BattleState, BattleTeamEconomy } from '../combat/types';

/** Пустой кошелёк отряда. */
export function emptyTeamEconomy(gold = 0): BattleTeamEconomy {
  return { gold, inventory: [] };
}

/**
 * Стартовое золото отряда:
 * round(Σ gold класса × goldBonus × (героев > 1 ? 0,75 : 1)).
 * Саммоны в сумму не входят (передавать только героев драфта).
 */
export function computeStartingTeamGold(
  classGolds: ReadonlyArray<number>,
  goldBonus: number
): number {
  const sum = classGolds.reduce((acc, gold) => acc + gold, 0);
  const factor = classGolds.length > 1 ? 0.75 : 1;
  return Math.round(sum * goldBonus * factor);
}

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

/** Текущее золото отряда. */
export function teamGold(state: BattleState, team: 0 | 1): number {
  return teamsOf(state)[team].gold;
}

/**
 * Добавляет (или снимает при amount < 0) золото отряду; не ниже 0.
 * Возвращает новое значение.
 */
export function addTeamGold(state: BattleState, team: 0 | 1, amount: number): number {
  const teams = teamsOf(state);
  teams[team].gold = Math.max(0, teams[team].gold + amount);
  return teams[team].gold;
}

/**
 * Тратит золото отряда. false — нехватка (кошелёк не меняется).
 */
export function spendTeamGold(state: BattleState, team: 0 | 1, amount: number): boolean {
  const teams = teamsOf(state);
  if (amount <= 0) {
    return true;
  }
  if (teams[team].gold < amount) {
    return false;
  }
  teams[team].gold -= amount;
  return true;
}

/**
 * Миграция старого снимка: teams из суммы unit.gold; поле gold с юнитов снимается.
 */
export function migrateLegacyTeamGold(state: BattleState): void {
  type LegacyUnit = { team: 0 | 1; gold?: number };
  const units = state.units as LegacyUnit[];
  if (!state.teams) {
    const sum = (team: 0 | 1) =>
      units.reduce((acc, unit) => acc + (unit.team === team ? (unit.gold ?? 0) : 0), 0);
    state.teams = [emptyTeamEconomy(sum(0)), emptyTeamEconomy(sum(1))];
  } else {
    teamsOf(state);
  }
  for (const unit of units) {
    delete unit.gold;
  }
}
