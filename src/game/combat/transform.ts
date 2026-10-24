import { resolveAttackStyle } from './attack-style';
import { resistsForClass } from './defaultResists';
import type { BattleState, BattleUnit } from './types';

/**
 * Переписывает класс и базовые статы юнита из каталога (доля ОЗ сохраняется).
 */
export function applyCatalogStats(
  state: BattleState,
  unit: BattleUnit,
  code: string
): boolean {
  const hero = state.catalog[code];
  if (!hero) {
    return false;
  }
  const ratio = unit.maxHp > 0 ? unit.health / unit.maxHp : 1;
  const maxHp = Math.max(1, Math.round(hero.health * state.rules.healthBonus));
  unit.heroClassCode = hero.code;
  unit.displayName = hero.displayName;
  unit.maxHp = maxHp;
  unit.health = Math.max(1, Math.min(maxHp, Math.round(maxHp * ratio)));
  unit.damage = hero.damage;
  unit.armor = hero.armor;
  unit.initiative = hero.initiative;
  unit.dodge = hero.dodge;
  unit.luck = hero.luck;
  unit.accuracy = hero.accuracy;
  unit.power = hero.power;
  unit.mana = Math.max(unit.mana, hero.mana);
  unit.maxMana = Math.max(unit.maxMana, hero.maxMana ?? hero.mana);
  unit.attackStyle = resolveAttackStyle(hero.code);
  unit.resists = resistsForClass(hero.code);
  return true;
}

/** Подпись цели в pendingPrompt: «Ассасин (П2)». */
export function unitChoiceLabel(unit: BattleUnit): string {
  const row = unit.row === 0 ? 'П' : 'З';
  return `${unit.displayName} (${row}${unit.column + 1})`;
}
