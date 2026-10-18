import { applyClassLevelUp } from './levelup';
import type { BattleState, BattleUnit } from './types';

/**
 * Повышает уровень юнита на ind (legacy Hero.levelup + классовые приросты).
 */
export function levelUpUnit(unit: BattleUnit, ind = 1, state?: BattleState): void {
  if (!unit.alive || ind === 0) {
    return;
  }
  if (state) {
    applyClassLevelUp(unit, ind, state);
    return;
  }
  // Без state (точечные вызовы): только базовый bump lvl/hiddenLvl.
  unit.lvl = Math.max(1, unit.lvl + ind);
  if (ind > 0) {
    unit.hiddenLvl += ind;
  }
}

/**
 * Level-up всех живых в конце раунда (зеркало pvp.py).
 * Возвращает максимальный lvl среди получивших повышение (для лога).
 */
export function levelUpLivingUnits(state: BattleState): number {
  let maxLvl = 0;
  for (const unit of state.units) {
    if (!unit.alive) {
      continue;
    }
    levelUpUnit(unit, 1, state);
    if (unit.lvl > maxLvl) {
      maxLvl = unit.lvl;
    }
  }
  return maxLvl;
}
