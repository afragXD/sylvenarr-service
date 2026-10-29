/** Классы нежити (без полного ResistManager / race field). */
const UNDEAD_CODES = new Set([
  'Archlich',
  'GhostWarrior',
  'Dracolich',
  'Zombie',
  'SkeletonChampion',
  'Specter',
]);

/** Демоны / бездна. */
const DEMON_CODES = new Set(['DemonLord', 'Witch', 'Incub']);

/** Мистика. */
const MYSTIC_CODES = new Set(['Ectoplasm', 'Demiurge', 'EvilTree', 'BeerElemental', 'Angel']);

/** Святые существа (бонус «Неумолимого тарана»). */
const HOLY_CODES = new Set(['Paladin', 'Patriarch', 'Abbess', 'Angel']);

/** Нелюди. */
const UNHUMAN_CODES = new Set(['Titan']);

/** Механизмы / искусственные (иммунитет к порабощению русалки). */
const ARTIFICIAL_CODES = new Set(['GoldGolem', 'Imp']);

/**
 * Нежить по коду класса.
 */
export function isUndeadClass(code: string): boolean {
  return UNDEAD_CODES.has(code);
}

/**
 * Демон по коду класса.
 */
export function isDemonClass(code: string): boolean {
  return DEMON_CODES.has(code);
}

/**
 * Мистика по коду класса.
 */
export function isMysticClass(code: string): boolean {
  return MYSTIC_CODES.has(code);
}

/**
 * Святое существо по коду класса.
 */
export function isHolyClass(code: string): boolean {
  return HOLY_CODES.has(code);
}

/**
 * Нелюдь по коду класса.
 */
export function isUnhumanClass(code: string): boolean {
  return UNHUMAN_CODES.has(code);
}

/**
 * Нежить или демон (бонус «нечестивых» целей).
 */
export function isUnholyClass(code: string): boolean {
  return isUndeadClass(code) || isDemonClass(code);
}

/**
 * Множитель урона святого оружия по нежити/демонам (+25%).
 * Учитывает lich-саммонов даже если код временно другой.
 */
export function unholyDamageMult(unit: {
  heroClassCode: string;
  isLichSummon?: boolean;
}): number {
  if (unit.isLichSummon || isUnholyClass(unit.heroClassCode)) {
    return 1.25;
  }
  return 1;
}

/**
 * Искусственный / механизм по коду класса.
 */
export function isArtificialClass(code: string): boolean {
  return ARTIFICIAL_CODES.has(code);
}

/**
 * Иммунитет к порабощению русалки.
 */
export function resistsEnslave(code: string): boolean {
  return isUndeadClass(code) || isArtificialClass(code);
}
