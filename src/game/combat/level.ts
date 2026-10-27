import { applyClassLevelUp } from './levelup';
import type { BattleState, BattleUnit } from './types';

/**
 * Повышает (или понижает) уровень юнита на ind.
 * При |ind| > 1 вызывает прирост по одному уровню: в формулах классов
 * участвует текущий lvl/hiddenLvl, поэтому пакетный ind даёт неверный результат.
 */
export function levelUpUnit(unit: BattleUnit, ind = 1, state?: BattleState): void {
  if (!unit.alive || ind === 0) {
    return;
  }
  const step = ind > 0 ? 1 : -1;
  const times = Math.abs(ind);
  for (let i = 0; i < times; i += 1) {
    if (!unit.alive) {
      return;
    }
    if (state) {
      applyClassLevelUp(unit, step, state);
    } else {
      // Без state (точечные вызовы): только базовый bump lvl/hiddenLvl.
      unit.lvl = Math.max(1, unit.lvl + step);
      if (step > 0) {
        unit.hiddenLvl += step;
      }
    }
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
