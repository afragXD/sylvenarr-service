import { basicAttackKind } from '../attack-style';
import type { AttackKind } from '../damage';
import type { BattleState, BattleUnit } from '../types';
import { isPilotClass, listPilotAbilities } from './registry';

/**
 * Тип основной атаки юнита: первый слот с уроном у пилота, базовая атака у остальных.
 * null — у пилота нет слотов с прямым уроном.
 */
export function primaryAttackKindOrNull(state: BattleState, unit: BattleUnit): AttackKind | null {
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

/**
 * Тип атаки слота [1] (порт firstAction для Помрачения рассудка).
 * Если слот 1 не бьёт (Homie и т.п.) — ближний удар, а не «первый магический слот»
 * (иначе Пивной элементаль бил бы FIRE из Сливняка).
 */
export function firstActionAttackKind(state: BattleState, unit: BattleUnit): AttackKind {
  if (!isPilotClass(unit.heroClassCode)) {
    return basicAttackKind(unit.heroClassCode);
  }
  const slot1 = listPilotAbilities(state, unit).find((ability) => ability.slot === 1);
  return slot1?.attackKind ?? 'melee';
}
