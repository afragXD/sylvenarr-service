import type { BattleUnit } from '../../game/combat/types';
import type { CreatorMatchesModel } from './model';

function asInt(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Некорректное число');
  }
  return Math.trunc(value);
}

/**
 * Применяет MVP-патч статов к юниту in-place.
 * maxHp → clamp health; lvl → hiddenLvl = max(hiddenLvl, lvl).
 */
export function applyUnitStatsPatch(
  unit: BattleUnit,
  patch: CreatorMatchesModel.unitPatchBody
): void {
  if (patch.maxHp !== undefined) {
    unit.maxHp = Math.max(1, asInt(patch.maxHp));
  }
  if (patch.health !== undefined) {
    unit.health = asInt(patch.health);
  }
  if (patch.damage !== undefined) {
    unit.damage = asInt(patch.damage);
  }
  if (patch.armor !== undefined) {
    unit.armor = asInt(patch.armor);
  }
  if (patch.initiative !== undefined) {
    unit.initiative = asInt(patch.initiative);
  }
  if (patch.dodge !== undefined) {
    unit.dodge = asInt(patch.dodge);
  }
  if (patch.luck !== undefined) {
    unit.luck = asInt(patch.luck);
  }
  if (patch.accuracy !== undefined) {
    unit.accuracy = asInt(patch.accuracy);
  }
  if (patch.power !== undefined) {
    unit.power = asInt(patch.power);
  }
  if (patch.mana !== undefined) {
    unit.mana = asInt(patch.mana);
  }
  if (patch.maxMana !== undefined) {
    unit.maxMana = Math.max(0, asInt(patch.maxMana));
  }
  if (patch.morale !== undefined) {
    unit.morale = asInt(patch.morale);
  }
  if (patch.ultaCharges !== undefined) {
    unit.ultaCharges = Math.max(0, asInt(patch.ultaCharges));
  }
  if (patch.critBank !== undefined) {
    unit.critBank = Math.max(0, asInt(patch.critBank));
  }
  if (patch.lvl !== undefined) {
    unit.lvl = Math.max(1, asInt(patch.lvl));
    unit.hiddenLvl = Math.max(unit.hiddenLvl, unit.lvl);
  }

  const minHp = unit.alive ? 1 : 0;
  unit.health = Math.min(unit.maxHp, Math.max(minHp, unit.health));
  unit.mana = Math.min(unit.maxMana, Math.max(0, unit.mana));
}
