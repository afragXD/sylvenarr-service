/** Классы нежити (без полного ResistManager / race field). */
const UNDEAD_CODES = new Set([
  'Archlich',
  'GhostWarrior',
  'Dracolich',
  'Zombie',
  'SkeletonChampion',
  'Ectoplasm',
  'Witch',
  'Specter',
]);

/** Демоны / бездна. */
const DEMON_CODES = new Set(['DemonLord']);

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
