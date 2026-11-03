import type { BattleState } from '../combat/types';

export {
  addTeamGold,
  computeStartingTeamGold,
  emptyTeamEconomy,
  migrateLegacyTeamGold,
  spendTeamGold,
  teamGold,
} from './wallet';

/**
 * Включена ли экономика матча (ярмарка, перки, предметы).
 * Старые снимки без `fairEnabled` — выключено.
 */
export function economyOn(state: BattleState): boolean {
  return state.rules.fairEnabled === true;
}
