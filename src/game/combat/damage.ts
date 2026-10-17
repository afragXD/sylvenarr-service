import { applyVampWeaponHeal, hasEffect } from './effects';
import type { BattleState, BattleUnit } from './types';

export const randInt = (min: number, max: number): number =>
  min + Math.floor(Math.random() * (max - min + 1));

/** Защита от рекурсии CONTR ↔ CONTR. */
let counterDepth = 0;

function computeRawDamage(
  attacker: BattleUnit,
  defender: BattleUnit,
  opts: { readonly damageMult: number; readonly armorIgnore: number },
  forceMelee = false
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
  const style = forceMelee ? 'melee' : attacker.attackStyle;
  if (style === 'magic') {
    raw = Math.max(1, Math.round(attacker.power * 0.8 + randInt(-3, 3) - armor * 0.15));
  } else if (style === 'ranged') {
    raw = Math.max(1, Math.round(attacker.damage - armor * 0.5 + randInt(0, 2)));
  } else {
    raw = Math.max(1, Math.round(attacker.damage - armor + randInt(0, 2)));
  }
  raw = Math.max(1, Math.round(raw * opts.damageMult));
  if (randInt(1, 100) <= Math.min(40, attacker.luck)) {
    raw = Math.round(raw * 1.5);
  }
  return raw;
}

/**
 * Наносит урон с учётом стиля атаки, брони и удачи.
 * При VAMPWEAPON на атакующем восстанавливает ОЗ.
 * При CONTR на защитнике — один контрудар ближнего боя.
 */
export function dealDamage(
  attacker: BattleUnit,
  defender: BattleUnit,
  opts: { readonly damageMult: number; readonly armorIgnore: number },
  state?: BattleState
): number {
  const raw = computeRawDamage(attacker, defender, opts);
  if (raw <= 0) {
    return 0;
  }
  defender.health -= raw;
  applyVampWeaponHeal(attacker, raw);

  if (
    counterDepth === 0 &&
    defender.alive &&
    defender.health > 0 &&
    hasEffect(defender, 'CONTR') &&
    attacker.alive
  ) {
    counterDepth += 1;
    const counter = computeRawDamage(defender, attacker, { damageMult: 1, armorIgnore: 0 }, true);
    if (counter > 0) {
      attacker.health -= counter;
      applyVampWeaponHeal(defender, counter);
      if (state) {
        state.log.push(
          `${defender.displayName} отвечает контрударом по ${attacker.displayName} (${counter}).`
        );
      }
      if (attacker.health <= 0) {
        attacker.health = 0;
        attacker.alive = false;
        if (state) {
          state.log.push(`${attacker.displayName} погибает.`);
        }
      }
    }
    counterDepth -= 1;
  }

  return raw;
}

/**
 * Помечает юнита мёртвым при HP ≤ 0 и кладёт на кладбище (не саммоны).
 */
export function markDeadIfNeeded(state: BattleState, unit: BattleUnit): void {
  if (unit.health > 0) {
    return;
  }
  const wasAlive = unit.alive;
  unit.alive = false;
  unit.health = 0;
  if (!wasAlive) {
    return;
  }
  state.log.push(`${unit.displayName} погибает.`);
  if (!unit.isSummon && !state.graveyard.some((entry) => entry.unitId === unit.id)) {
    state.graveyard.push({
      unitId: unit.id,
      team: unit.team,
      heroClassCode: unit.heroClassCode,
      displayName: unit.displayName,
      forbiddenResurrect: unit.forbiddenResurrect,
    });
  }
}

/** Условный уровень пилотов (без полноценной системы lvl). */
export const PILOT_LVL = 5;
