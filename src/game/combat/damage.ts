import type { BattleState, BattleUnit } from './types';

export const randInt = (min: number, max: number): number =>
  min + Math.floor(Math.random() * (max - min + 1));

/**
 * Наносит урон с учётом стиля атаки, брони и удачи.
 */
export function dealDamage(
  attacker: BattleUnit,
  defender: BattleUnit,
  opts: { readonly damageMult: number; readonly armorIgnore: number }
): number {
  const hitChance = Math.min(95, Math.max(20, attacker.accuracy - defender.dodge / 2));
  if (randInt(1, 100) > hitChance) {
    return 0;
  }
  let armor = defender.armor * (1 - Math.min(1, Math.max(0, opts.armorIgnore)));
  if (defender.defending) {
    armor = Math.round(armor * 1.5);
  }
  let raw: number;
  if (attacker.attackStyle === 'magic') {
    raw = Math.max(1, Math.round(attacker.power * 0.8 + randInt(-3, 3) - armor * 0.15));
  } else if (attacker.attackStyle === 'ranged') {
    raw = Math.max(1, Math.round(attacker.damage - armor * 0.5 + randInt(0, 2)));
  } else {
    raw = Math.max(1, Math.round(attacker.damage - armor + randInt(0, 2)));
  }
  raw = Math.max(1, Math.round(raw * opts.damageMult));
  if (randInt(1, 100) <= Math.min(40, attacker.luck)) {
    raw = Math.round(raw * 1.5);
  }
  defender.health -= raw;
  return raw;
}

/**
 * Помечает юнита мёртвым при HP ≤ 0.
 */
export function markDeadIfNeeded(state: BattleState, unit: BattleUnit): void {
  if (unit.health <= 0) {
    unit.alive = false;
    unit.health = 0;
    state.log.push(`${unit.displayName} погибает.`);
  }
}

/** Условный уровень пилотов (без полноценной системы lvl). */
export const PILOT_LVL = 5;
