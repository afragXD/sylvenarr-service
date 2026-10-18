import { applyVampWeaponHeal, grantEffect, hasEffect } from './effects';
import type { DamageSource } from './damageSources';
import { sourceFromAttackStyle } from './damageSources';
import { applyResistMultiplier } from './resists';
import type { BattleState, BattleUnit } from './types';

export const randInt = (min: number, max: number): number =>
  min + Math.floor(Math.random() * (max - min + 1));

/** Защита от рекурсии CONTR ↔ CONTR. */
let counterDepth = 0;

export type DealDamageOpts = {
  readonly damageMult: number;
  readonly armorIgnore: number;
  /** Источник урона; по умолчанию из attackStyle атакующего. */
  readonly source?: DamageSource;
  /** Пропуск проверки попадания (тесты / гарантированный удар). */
  readonly forceHit?: boolean;
};

export type DealDamageResult = {
  damage: number;
  missed: boolean;
  blocked: boolean;
};

let lastDeal: DealDamageResult = { damage: 0, missed: false, blocked: false };

/** Метаданные последнего вызова dealDamage (промах / вард). */
export function lastDealDamageResult(): DealDamageResult {
  return lastDeal;
}

function computeRawDamage(
  attacker: BattleUnit,
  defender: BattleUnit,
  opts: {
    readonly damageMult: number;
    readonly armorIgnore: number;
    readonly forceHit?: boolean;
  },
  forceMelee = false
): number {
  if (!opts.forceHit) {
    const hitChance = Math.min(95, Math.max(20, attacker.accuracy - defender.dodge / 2));
    if (randInt(1, 100) > hitChance) {
      return 0;
    }
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
  let crit = false;
  if ((attacker.critBank ?? 0) > 0) {
    attacker.critBank -= 1;
    crit = true;
  } else if (randInt(1, 100) <= Math.min(40, attacker.luck)) {
    crit = true;
  }
  if (crit) {
    raw = Math.round(raw * 1.5);
  }
  return raw;
}

/**
 * Наносит урон с учётом стиля атаки, брони, удачи и сопротивлений.
 * При VAMPWEAPON на атакующем восстанавливает ОЗ.
 * При CONTR на защитнике — один контрудар ближнего боя.
 */
export function dealDamage(
  attacker: BattleUnit,
  defender: BattleUnit,
  opts: DealDamageOpts,
  state?: BattleState
): number {
  const raw = computeRawDamage(attacker, defender, opts);
  if (raw <= 0) {
    lastDeal = { damage: 0, missed: true, blocked: false };
    return 0;
  }

  const source = opts.source ?? sourceFromAttackStyle(attacker.attackStyle);
  const resist = applyResistMultiplier(defender, source);
  if (resist.blocked) {
    if (state && resist.blockReason) {
      state.log.push(resist.blockReason);
    }
    lastDeal = { damage: 0, missed: false, blocked: true };
    return 0;
  }

  const amount = Math.max(0, Math.round(raw * resist.multiplier));
  if (amount <= 0) {
    lastDeal = { damage: 0, missed: false, blocked: false };
    return 0;
  }

  defender.health -= amount;
  applyVampWeaponHeal(attacker, amount);

  if (
    amount > 0 &&
    defender.alive &&
    defender.health > 0 &&
    hasEffect(attacker, 'FIREDWEAPON') &&
    randInt(1, 100) <= 55
  ) {
    grantEffect(defender, 'BURNING', 2, Math.max(2, Math.round(3 + attacker.lvl * 0.2)));
    if (state) {
      state.log.push(`${defender.displayName} загорается от огненного оружия.`);
    }
  }

  if (
    counterDepth === 0 &&
    defender.alive &&
    defender.health > 0 &&
    hasEffect(defender, 'CONTR') &&
    attacker.alive
  ) {
    counterDepth += 1;
    const counterRaw = computeRawDamage(
      defender,
      attacker,
      { damageMult: 1, armorIgnore: 0, forceHit: opts.forceHit },
      true
    );
    if (counterRaw > 0) {
      const counterResist = applyResistMultiplier(attacker, 'WEAPON');
      if (counterResist.blocked) {
        if (state && counterResist.blockReason) {
          state.log.push(counterResist.blockReason);
        }
      } else {
        const counter = Math.max(0, Math.round(counterRaw * counterResist.multiplier));
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
      }
    }
    counterDepth -= 1;
  }

  lastDeal = { damage: amount, missed: false, blocked: false };
  return amount;
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
