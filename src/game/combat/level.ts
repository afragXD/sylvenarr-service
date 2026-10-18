import type { BattleState, BattleUnit } from './types';

/**
 * Повышает уровень юнита на ind (legacy Hero.levelup).
 * Классовые приросты статов — follow-up; здесь только lvl.
 */
export function levelUpUnit(unit: BattleUnit, ind = 1): void {
  if (!unit.alive || ind === 0) {
    return;
  }
  unit.lvl = Math.max(1, unit.lvl + ind);
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
    levelUpUnit(unit, 1);
    if (unit.lvl > maxLvl) {
      maxLvl = unit.lvl;
    }
  }
  return maxLvl;
}
