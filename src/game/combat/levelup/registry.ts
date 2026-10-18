import type { BattleState, BattleUnit } from '../types';
import { bumpLevel } from './bump';
import { pilotLevelUps } from './pilots';
import { summonLevelUps } from './summons';
import type { ClassLevelUpFn } from './types';

const CLASS_LEVELUPS: Record<string, ClassLevelUpFn> = {
  ...pilotLevelUps,
  ...summonLevelUps,
};

/**
 * Классовый level-up (зеркало characters/*.py levelup).
 * Specter и неизвестные классы — только базовый bump.
 */
export function applyClassLevelUp(
  unit: BattleUnit,
  ind: number,
  state: BattleState
): void {
  const handler = CLASS_LEVELUPS[unit.heroClassCode];
  if (handler) {
    handler(unit, ind, state);
    return;
  }
  bumpLevel(unit, ind);
}

export { bumpLevel };
