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
  // Под POLYMORPH качаем исходный класс (Ассасин-мимик), не текущий облик.
  const polymorphed = unit.effects.some((effect) => effect.id === 'POLYMORPH');
  const code =
    polymorphed && unit.transformParentCode
      ? unit.transformParentCode
      : unit.heroClassCode;
  const handler = CLASS_LEVELUPS[code];
  if (handler) {
    handler(unit, ind, state);
    return;
  }
  bumpLevel(unit, ind);
}

export { bumpLevel };
