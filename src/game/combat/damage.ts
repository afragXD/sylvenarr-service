import {
  applyVampWeaponHeal,
  delEffect,
  grantEffect,
  hasEffect,
  tryStun,
} from './effects';
import type { DamageSource } from './damageSources';
import {
  DAMAGE_SOURCE_LABELS,
  formatLogDamage,
  sourceFromAttackStyle,
} from './damageSources';
import { applyResistMultiplier } from './resists';
import type { BattleState, BattleUnit } from './types';

export const randInt = (min: number, max: number): number =>
  min + Math.floor(Math.random() * (max - min + 1));

/** Защита от рекурсии CONTR ↔ CONTR. */
let counterDepth = 0;

export type DealDamageOpts = {
  readonly damageMult?: number;
  readonly armorIgnore?: number;
  /** Источник урона; по умолчанию из attackStyle атакующего. */
  readonly source?: DamageSource;
  /** Принудительный стиль расчёта (огнемёт Pyro бьёт от power). */
  readonly forceStyle?: 'melee' | 'ranged' | 'magic';
  /** Пропуск проверки попадания (тесты / гарантированный удар). */
  readonly forceHit?: boolean;
  /** Множитель вклада уклонения в шанс промаха (цепь молнии и т.п.). */
  readonly evadeCoef?: number;
};

export type DealDamageResult = {
  damage: number;
  missed: boolean;
  blocked: boolean;
  crit: boolean;
  critFail: boolean;
  source: DamageSource;
};

let lastDeal: DealDamageResult = {
  damage: 0,
  missed: false,
  blocked: false,
  crit: false,
  critFail: false,
  source: 'WEAPON',
};

/** Метаданные последнего вызова dealDamage (промах / вард / крит). */
export function lastDealDamageResult(): DealDamageResult {
  return lastDeal;
}

/** `(N)⟦SRC⟧` по источнику последнего dealDamage (для логов способностей). */
export function formatLastLogDamage(amount: number): string {
  return formatLogDamage(amount, lastDeal.source);
}

type RawDamageResult = {
  raw: number;
  crit: boolean;
  /** Крит получен из банка — заряд списывается только если урон не заблокирован. */
  critFromBank: boolean;
  /** Натуральный промах (ролл > 95) — критический провал. */
  naturalMiss: boolean;
};

function computeRawDamage(
  attacker: BattleUnit,
  defender: BattleUnit,
  opts: {
    readonly damageMult: number;
    readonly armorIgnore: number;
    readonly forceStyle?: 'melee' | 'ranged' | 'magic';
    readonly forceHit?: boolean;
    readonly evadeCoef?: number;
  },
  forceMelee = false
): RawDamageResult {
  if (!opts.forceHit) {
    const evadeCoef = opts.evadeCoef ?? 1;
    const hitChance = Math.min(
      95,
      Math.max(20, attacker.accuracy - (defender.dodge / 2) * evadeCoef)
    );
    const roll = randInt(1, 100);
    if (roll > hitChance) {
      return { raw: 0, crit: false, critFromBank: false, naturalMiss: roll > 95 };
    }
  }
  const armorIgnore = opts.armorIgnore ?? 0;
  const damageMult = opts.damageMult ?? 1;
  let armor = defender.armor * (1 - Math.min(1, Math.max(0, armorIgnore)));
  if (defender.defending) {
    armor = Math.round(armor * 1.5);
  }
  let raw: number;
  const style = forceMelee ? 'melee' : (opts.forceStyle ?? attacker.attackStyle);
  if (style === 'magic') {
    raw = Math.max(1, Math.round(attacker.power * 0.8 + randInt(-3, 3) - armor * 0.15));
  } else if (style === 'ranged') {
    raw = Math.max(1, Math.round(attacker.damage - armor * 0.5 + randInt(0, 2)));
  } else {
    raw = Math.max(1, Math.round(attacker.damage - armor + randInt(0, 2)));
  }
  raw = Math.max(1, Math.round(raw * damageMult));
  let crit = false;
  let critFromBank = false;
  if ((attacker.critBank ?? 0) > 0) {
    crit = true;
    critFromBank = true;
  } else if (attacker.luck >= 0 && randInt(1, 100) <= Math.min(40, attacker.luck)) {
    crit = true;
    attacker.morale += 5;
  } else if (attacker.luck < 0 && randInt(1, 100) <= Math.min(40, Math.abs(attacker.luck))) {
    // Антикрит (порт luck() при crit < 0): −5 морали.
    attacker.morale -= 5;
  }
  if (crit) {
    raw = Math.round(raw * 1.5);
  }
  return { raw, crit, critFromBank, naturalMiss: false };
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
  const source = opts.source ?? sourceFromAttackStyle(attacker.attackStyle);
  const result = computeRawDamage(attacker, defender, opts);
  if (result.raw <= 0) {
    if (state && result.naturalMiss) {
      state.log.push(`${attacker.displayName}: критический провал!`);
    }
    lastDeal = {
      damage: 0,
      missed: true,
      blocked: false,
      crit: false,
      critFail: result.naturalMiss,
      source,
    };
    return 0;
  }

  const resist = applyResistMultiplier(defender, source);
  if (resist.blocked) {
    if (state && resist.blockReason) {
      state.log.push(resist.blockReason);
    }
    lastDeal = {
      damage: 0,
      missed: false,
      blocked: true,
      crit: false,
      critFail: false,
      source,
    };
    return 0;
  }

  // Крит-банк тратится только когда урон реально проходит.
  if (result.critFromBank) {
    attacker.critBank -= 1;
  }
  if (state && result.crit) {
    state.log.push(`${attacker.displayName}: критический удар!`);
  }

  const amount = Math.max(0, Math.round(result.raw * resist.multiplier));
  if (amount <= 0) {
    lastDeal = {
      damage: 0,
      missed: false,
      blocked: false,
      crit: result.crit,
      critFail: false,
      source,
    };
    return 0;
  }

  defender.health -= amount;
  const vampHealed = applyVampWeaponHeal(attacker, amount);
  if (state && vampHealed > 0) {
    state.log.push(`${attacker.displayName} высасывает ${vampHealed} ОЗ.`);
  }

  if (
    amount > 0 &&
    defender.alive &&
    defender.health > 0 &&
    hasEffect(attacker, 'FIREDWEAPON') &&
    randInt(1, 100) <= 55
  ) {
    grantEffect(defender, 'BURNING', 2, 1 + attacker.lvl * 0.04);
    if (state) {
      state.log.push(`${defender.displayName} загорается от огненного оружия.`);
    }
  }

  // Электрическое оружие: доп. урон воздухом (слабее огня) + шанс оглушения.
  if (
    amount > 0 &&
    defender.alive &&
    defender.health > 0 &&
    hasEffect(attacker, 'AIRWEAPON') &&
    counterDepth === 0
  ) {
    counterDepth += 1;
    const sparkRaw = Math.max(1, Math.round(attacker.power / 5 + 4));
    const sparkResist = applyResistMultiplier(defender, 'AIR');
    if (sparkResist.blocked) {
      if (state && sparkResist.blockReason) {
        state.log.push(sparkResist.blockReason);
      }
    } else {
      const spark = Math.max(0, Math.round(sparkRaw * sparkResist.multiplier));
      if (spark > 0) {
        defender.health -= spark;
        if (state) {
          state.log.push(
            `Электрическое оружие бьёт ${defender.displayName} воздухом ${formatLogDamage(spark, 'AIR')}.`
          );
        }
      }
    }
    const stunChance = Math.min(85, 50 + Math.floor(attacker.power / 5));
    if (state && defender.alive && defender.health > 0 && randInt(1, 100) <= stunChance) {
      if (tryStun(state, defender, 1)) {
        state.log.push(`${defender.displayName} оглушён разрядом оружия.`);
      }
    }
    if (state) {
      markDeadIfNeeded(state, defender);
    } else if (defender.health <= 0) {
      defender.health = 0;
      defender.alive = false;
    }
    counterDepth -= 1;
  }

  if (
    counterDepth === 0 &&
    defender.alive &&
    defender.health > 0 &&
    hasEffect(defender, 'CONTR') &&
    attacker.alive
  ) {
    counterDepth += 1;
    const counterResult = computeRawDamage(
      defender,
      attacker,
      { damageMult: 1, armorIgnore: 0, forceHit: opts.forceHit },
      true
    );
    if (counterResult.raw > 0) {
      const counterResist = applyResistMultiplier(attacker, 'WEAPON');
      if (counterResist.blocked) {
        if (state && counterResist.blockReason) {
          state.log.push(counterResist.blockReason);
        }
      } else {
        if (counterResult.critFromBank) {
          defender.critBank -= 1;
        }
        const counter = Math.max(0, Math.round(counterResult.raw * counterResist.multiplier));
        if (counter > 0) {
          attacker.health -= counter;
          applyVampWeaponHeal(defender, counter);
          if (state) {
            state.log.push(
              `${defender.displayName} отвечает контрударом по ${attacker.displayName} ${formatLogDamage(counter, 'WEAPON')}.`
            );
          }
          if (state) {
            markDeadIfNeeded(state, attacker);
          } else if (attacker.health <= 0) {
            attacker.health = 0;
            attacker.alive = false;
          }
        }
      }
    }
    counterDepth -= 1;
  }

  // Огненный щит: обжигает атакующего (можно сработать и по трупу с щитом — как в боте).
  if (counterDepth === 0 && amount > 0 && hasEffect(defender, 'FIRESHIELD') && attacker.alive) {
    counterDepth += 1;
    const shield = defender.effects.find((effect) => effect.id === 'FIRESHIELD');
    if (shield) {
      shield.rounds -= 1;
      if (shield.rounds <= 0) {
        delEffect(defender, 'FIRESHIELD', state);
      }
    }
    const armorStrip = Math.max(1, defender.lvl);
    attacker.armor -= armorStrip;
    const burnRaw = Math.max(1, Math.round(attacker.damage * 0.6 + defender.lvl));
    const burnResist = applyResistMultiplier(attacker, 'FIRE');
    if (burnResist.blocked) {
      if (state && burnResist.blockReason) {
        state.log.push(burnResist.blockReason);
      }
    } else {
      const burn = Math.max(0, Math.round(burnRaw * burnResist.multiplier));
      if (burn > 0) {
        attacker.health -= burn;
        if (state) {
          state.log.push(
            `Огненный щит ${defender.displayName} обжигает ${attacker.displayName} ${formatLogDamage(burn, 'FIRE')} и ломает броню на ${armorStrip}.`
          );
          markDeadIfNeeded(state, attacker);
        } else if (attacker.health <= 0) {
          attacker.health = 0;
          attacker.alive = false;
        }
      }
    }
    counterDepth -= 1;
  }

  lastDeal = {
    damage: amount,
    missed: false,
    blocked: false,
    crit: result.crit,
    critFail: false,
    source,
  };
  return amount;
}

/**
 * Спасение на пороге смерти вардом/резистом FINALSTRIKE (порт death() из бота):
 * заряд варда → 1 ОЗ; иначе ролл value% → 1 ОЗ и value −25.
 */
function tryFinalStrikeSave(state: BattleState, unit: BattleUnit): boolean {
  const entry = unit.resists.FINALSTRIKE;
  if (!entry) {
    return false;
  }
  if ((entry.wardCharges ?? 0) > 0) {
    entry.wardCharges = (entry.wardCharges ?? 1) - 1;
    if (entry.wardCharges <= 0) {
      entry.wardCharges = undefined;
    }
    unit.health = 1;
    state.log.push(
      `${unit.displayName} на пороге смерти — вард «${DAMAGE_SOURCE_LABELS.FINALSTRIKE}» спасает (остаётся 1 ОЗ).`
    );
    return true;
  }
  if (entry.value > 0 && randInt(1, 100) <= entry.value) {
    entry.value -= 25;
    unit.health = 1;
    state.log.push(
      `${unit.displayName} на пороге смерти, но переживает удар (остаётся 1 ОЗ).`
    );
    return true;
  }
  return false;
}

/**
 * Помечает юнита мёртвым при HP ≤ 0 и кладёт на кладбище (не саммоны).
 * Перед смертью проверяет спасение вардом/резистом FINALSTRIKE.
 * При смерти хозяина уничтожает его саммонов (порт death() из бота).
 */
export function markDeadIfNeeded(state: BattleState, unit: BattleUnit): void {
  if (unit.health > 0) {
    return;
  }
  const wasAlive = unit.alive;
  if (wasAlive && tryFinalStrikeSave(state, unit)) {
    return;
  }
  unit.alive = false;
  unit.health = 0;
  if (!wasAlive) {
    return;
  }
  state.log.push(`${unit.displayName} погибает.`);
  if (unit.isSummon && unit.summonerId) {
    const master = state.units.find(
      (other) =>
        other.id === unit.summonerId &&
        other.alive &&
        other.heroClassCode === 'OrcKing'
    );
    if (master) {
      if (unit.heroClassCode === 'GoblinTrapper') {
        master.cumRage += 0.05;
        state.log.push(
          `${unit.displayName} погиб. Хан орков оплакивает его, как родного сына. Он поклялся отомстить.`
        );
      } else if (unit.heroClassCode === 'GoblinShaman') {
        master.cumRage += 0.03;
        state.log.push(
          `${unit.displayName} погиб, и ярость его Хана немного растёт.`
        );
      }
    }
  }
  if (!unit.isSummon && !state.graveyard.some((entry) => entry.unitId === unit.id)) {
    state.graveyard.push({
      unitId: unit.id,
      team: unit.team,
      heroClassCode: unit.heroClassCode,
      displayName: unit.displayName,
      forbiddenResurrect: unit.forbiddenResurrect,
    });
  }
  if (!unit.isSummon) {
    const summons = state.units.filter(
      (other) => other.alive && other.isSummon && other.summonerId === unit.id
    );
    for (const summon of summons) {
      summon.health = 0;
      state.log.push(
        `${summon.displayName} исчезает вместе с хозяином ${unit.displayName}.`
      );
      markDeadIfNeeded(state, summon);
    }
  }
}
