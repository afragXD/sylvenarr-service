/** Источники урона / воздействий (порт arenamsterbot SRC). */
export const DAMAGE_SOURCES = [
  'DEFAULT',
  'WEAPON',
  'ARROWS',
  'MIND',
  'DEATH',
  'FIRE',
  'AIR',
  'EARTH',
  'WATER',
  'HOLY',
  'STUN',
  'DESTROYARMOR',
  'POLYMORPH',
  'IMITATION',
  'MOVEMENT',
  'FINALSTRIKE',
  'LOWERINGLEVEL',
] as const;

export type DamageSource = (typeof DAMAGE_SOURCES)[number];

export const DAMAGE_SOURCE_LABELS: Record<DamageSource, string> = {
  DEFAULT: 'Жизнь',
  WEAPON: 'Оружие',
  ARROWS: 'Снаряды',
  MIND: 'Разум',
  DEATH: 'Смерть',
  FIRE: 'Огонь',
  AIR: 'Воздух',
  EARTH: 'Земля',
  WATER: 'Вода',
  HOLY: 'Сакральный',
  STUN: 'Оглушение',
  DESTROYARMOR: 'Разрушение брони',
  POLYMORPH: 'Превращение',
  IMITATION: 'Копирование',
  MOVEMENT: 'Перемещение',
  FINALSTRIKE: 'Смертельный удар',
  LOWERINGLEVEL: 'Понижение уровня',
};

/** Источник урона по умолчанию для типа атаки. */
export function sourceFromAttackStyle(
  style: 'melee' | 'ranged' | 'magic'
): DamageSource {
  if (style === 'ranged') {
    return 'ARROWS';
  }
  if (style === 'magic') {
    return 'FIRE';
  }
  return 'WEAPON';
}

/**
 * Число урона в логе с машинным маркером источника для подсветки на клиенте.
 * Формат: `(42)⟦FIRE⟧` — маркер клиент скрывает, число красит по SRC.
 */
export function formatLogDamage(amount: number, source: DamageSource): string {
  return `(${amount})⟦${source}⟧`;
}
