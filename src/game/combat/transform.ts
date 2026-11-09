import { resistsForClass } from './defaultResists';
import { genderForClass } from './gender';
import { cloneResists } from './resists';
import type { BattleState, BattleUnit, ResistMap } from './types';

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
  unit.gender = genderForClass(hero.code);
  return true;
}

/** Кладёт текущие резисты в стек перед сменой облика. */
export function pushResistSnapshot(unit: BattleUnit): void {
  const stack = unit.resistSnapshots ? [...unit.resistSnapshots] : [];
  stack.push(cloneResists(unit.resists));
  unit.resistSnapshots = stack;
}

/** Снимает последний снимок резистов. Пустой стек — null. */
export function popResistSnapshot(unit: BattleUnit): ResistMap | null {
  const stack = unit.resistSnapshots;
  if (!stack || stack.length === 0) {
    return null;
  }
  const next = [...stack];
  const snap = next.pop() ?? null;
  unit.resistSnapshots = next.length > 0 ? next : undefined;
  return snap;
}

/**
 * Переписывает класс и базовые статы юнита из каталога (доля ОЗ сохраняется).
 * replace — снимок текущих резистов, затем дефолты нового класса.
 * restore — резисты из снимка, не из каталога (потраченные варды не возвращаются).
 */
export function applyCatalogStats(
  state: BattleState,
  unit: BattleUnit,
  code: string,
  opts?: { readonly resistMode?: 'replace' | 'restore' },
): boolean {
  const hero = state.catalog[code];
  if (!hero) {
    return false;
  }
  const ratio = unit.maxHp > 0 ? unit.health / unit.maxHp : 1;
  const maxHp = Math.max(1, Math.round(hero.health * state.rules.healthBonus));
  unit.heroClassCode = hero.code;
  unit.displayName = hero.displayName;
  unit.gender = genderForClass(hero.code);
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
  if (opts?.resistMode === 'restore') {
    unit.resists = popResistSnapshot(unit) ?? resistsForClass(hero.code);
  } else {
    pushResistSnapshot(unit);
    unit.resists = resistsForClass(hero.code);
  }
  // Мимик / снятие облика: лимит призывов класса (иначе Ассасин остаётся с 0).
  unit.maxSummons = baseMaxSummonsForClass(hero.code);
  return true;
}

/**
 * Умножает maxHp и обрезает ОЗ.
 * Не опускает maxHp ниже 50 % стартового, если initialMaxHp задан.
 */
export function reduceMaxHp(unit: BattleUnit, factor: number): number {
  const raw = Math.max(1, Math.round(unit.maxHp * factor));
  const floor =
    typeof unit.initialMaxHp === 'number' ? Math.max(1, Math.ceil(unit.initialMaxHp * 0.5)) : 1;
  unit.maxHp = Math.max(floor, raw);
  if (unit.health > unit.maxHp) {
    unit.health = unit.maxHp;
  }
  return unit.maxHp;
}

/** Подпись цели: «Русалка (З2)» или «✦ Гоблин-лучник (П1) — саммон Хана орков (П2)». */
export function unitChoiceLabel(unit: BattleUnit, state?: BattleState): string {
  const place = `${unit.row === 0 ? 'П' : 'З'}${unit.column + 1}`;
  if (!unit.isSummon) {
    return `${unit.displayName} (${place})`;
  }
  const summoner = state?.units.find((item) => item.id === unit.summonerId);
  const owner = summoner
    ? ` — саммон ${summoner.displayName} (${summoner.row === 0 ? 'П' : 'З'}${summoner.column + 1})`
    : '';
  return `✦ ${unit.displayName} (${place})${owner}`;
}
