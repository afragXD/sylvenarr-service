import type { BattleUnit } from '../types';

/**
 * Базовый Hero.levelup: lvl += ind; hidden_lvl += ind только при ind > 0.
 */
export function bumpLevel(unit: BattleUnit, ind: number): void {
  unit.lvl = Math.max(1, unit.lvl + ind);
  if (ind > 0) {
    unit.hiddenLvl += ind;
  }
}
