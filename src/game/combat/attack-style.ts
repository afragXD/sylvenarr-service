/**
 * Упрощённый стиль атаки по коду класса (до порта уникальных скиллов).
 */
export function resolveAttackStyle(code: string): 'melee' | 'ranged' | 'magic' {
  const ranged = new Set(['Assassin', 'GoblinArcher', 'Detective']);
  const magic = new Set([
    'Archlich',
    'Demiurge',
    'Witch',
    'Oracle',
    'Herbalist',
    'Abbess',
    'Patriarch',
    'Dracolich',
    'GoblinShaman',
    'DemonLord',
    'Noonwraith',
    'Ectoplasm',
  ]);
  if (ranged.has(code)) {
    return 'ranged';
  }
  if (magic.has(code)) {
    return 'magic';
  }
  return 'melee';
}
