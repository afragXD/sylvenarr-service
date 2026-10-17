/** Классы нежити (без полного ResistManager / race field). */
const UNDEAD_CODES = new Set([
  'Archlich',
  'GhostWarrior',
  'Dracolich',
  'Zombie',
  'SkeletonChampion',
  'Ectoplasm',
]);

/** Механизмы / искусственные (иммунитет к порабощению русалки). */
const ARTIFICIAL_CODES = new Set(['GoldGolem', 'Imp']);

/**
 * Нежить по коду класса.
 */
export function isUndeadClass(code: string): boolean {
  return UNDEAD_CODES.has(code);
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
