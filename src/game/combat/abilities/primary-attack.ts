import { basicAttackKind } from '../attack-style';
import type { AttackKind } from '../damage';
import type { BattleState, BattleUnit } from '../types';
import { isPilotClass, listPilotAbilities } from './registry';

/**
 * Тип основной атаки юнита: первый слот с уроном у пилота, базовая атака у остальных.
 * null — у пилота нет слотов с прямым уроном.
 */
export function primaryAttackKindOrNull(
  state: BattleState,
  unit: BattleUnit
): AttackKind | null {
  if (!isPilotClass(unit.heroClassCode)) {
    return basicAttackKind(unit.heroClassCode);
  }
  for (const ability of listPilotAbilities(state, unit)) {
    if (ability.attackKind) {
      return ability.attackKind;
    }
  }
  return null;
}

/** Тип основной атаки; без атакующих слотов — ближний удар. */
export function primaryAttackKind(state: BattleState, unit: BattleUnit): AttackKind {
  return primaryAttackKindOrNull(state, unit) ?? 'melee';
}
