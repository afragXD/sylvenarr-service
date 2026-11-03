import { resistsForClass } from './defaultResists';
import type { BattleState, BattleUnit } from './types';

/**
 * Базовый лимит саммонов класса (без бонусов с левелапа вроде Орк-короля).
 */
export function baseMaxSummonsForClass(code: string): number {
  switch (code) {
    case 'OrcKing':
    case 'Archlich':
    case 'GhostWarrior':
      return 1;
    case 'Demiurge':
      return 2;
    default:
      return 0;
  }
}

/**
 * Только класс и имя из каталога (порт transformToAnotherClass): статы боя не трогаем.
 */
export function transformClassOnly(state: BattleState, unit: BattleUnit, code: string): boolean {
  const hero = state.catalog[code];
  if (!hero) {
    return false;
  }
  unit.heroClassCode = hero.code;
  unit.displayName = hero.displayName;
  return true;
}

/**
 * Переписывает класс и базовые статы юнита из каталога (доля ОЗ сохраняется).
 */
export function applyCatalogStats(state: BattleState, unit: BattleUnit, code: string): boolean {
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
  unit.resists = resistsForClass(hero.code);
  // Мимик / снятие облика: лимит призывов класса (иначе Ассасин остаётся с 0).
  unit.maxSummons = baseMaxSummonsForClass(hero.code);
  return true;
}

/** Подпись цели в pendingPrompt: «✦ Гоблин (П2)» для саммона. */
export function unitChoiceLabel(unit: BattleUnit): string {
  const row = unit.row === 0 ? 'П' : 'З';
  const mark = unit.isSummon ? '✦ ' : '';
  return `${mark}${unit.displayName} (${row}${unit.column + 1})`;
}
