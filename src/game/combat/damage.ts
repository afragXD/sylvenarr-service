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
import { pushSfx } from './sfx';
import type { BattleState, BattleUnit } from './types';

export const randInt = (min: number, max: number): number =>
  min + Math.floor(Math.random() * (max - min + 1));

/** Защита от рекурсии CONTR ↔ CONTR. */
let counterDepth = 0;

/**
 * Тип атаки (порт MeleePattern / ArcherPattern / MagicPattern):
 * задаёт формулу урона; чары оружия, контрудар и огненный щит — только melee.
 */
export type AttackKind = 'melee' | 'ranged' | 'magic';

export type DealDamageOpts = {
  readonly kind: AttackKind;
  readonly damageMult?: number;
  readonly armorIgnore?: number;
  /** Источник урона; по умолчанию из типа атаки. */
  readonly source?: DamageSource;
  /** Без контрудара цели (ignoreContr в боте). */
  readonly noCounter?: boolean;
  /** Пропуск проверки попадания (тесты / гарантированный удар). */
  readonly forceHit?: boolean;
  /**
   * Модификатор промаха как в боте `evade(other, mod)`:
   * шанс промаха = dodge + mod + 95 − accuracy (+ accuracyPenalty).
   * По умолчанию 1.
   */
  readonly evadeCoef?: number;
  /** Добавка к шансу промаха в пунктах (серии ударов). */
  readonly accuracyPenalty?: number;
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

type EvadeResult = { missed: boolean; fromDodgeBank: boolean };

type LuckResult =
  | { kind: 'normal' }
  | { kind: 'crit'; fromBank: boolean; mult: number }
  | { kind: 'fail' };

type RawDamageResult = {
  raw: number;
  crit: boolean;
  /** Крит получен из банка — заряд списывается только если урон не заблокирован. */
  critFromBank: boolean;
  /**
   * Критический провал удачи (порт `luck()` при crit < 0): удар по цели отменяется.
   * Обычный промах по точности сюда не входит.
   */
  luckFail: boolean;
  fromDodgeBank: boolean;
};

/** Порт Chance(value): randint(1,100) <= value (отрицательный шанс = никогда). */
export function rollChance(percent: number): boolean {
  return randInt(1, 100) <= percent;
}

/**
 * Порт evade(): dodge_bank, иначе Chance(dodge + mod + 95 − acc).
 * Без искусственного капа 20–95 — при точности 100 и нулевом уклонении промаха нет.
 */
function tryEvade(
  attacker: BattleUnit,
  defender: BattleUnit,
  opts: {
    readonly forceHit?: boolean;
    readonly evadeCoef?: number;
    readonly accuracyPenalty?: number;
  }
): EvadeResult {
  if (opts.forceHit) {
    return { missed: false, fromDodgeBank: false };
  }
  if ((defender.dodgeBank ?? 0) > 0) {
    defender.dodgeBank -= 1;
    return { missed: true, fromDodgeBank: true };
  }
  const evadeMod = opts.evadeCoef ?? 1;
  const missChance =
    defender.dodge + evadeMod + 95 - attacker.accuracy + (opts.accuracyPenalty ?? 0);
  return { missed: rollChance(missChance), fromDodgeBank: false };
}

/**
 * Множитель крита как в боте:
 * max(1, 2 + (acc/100 − 1)×1.4) — без crit_mf / crit_resist (их в юните пока нет).
 */
export function critMultiplier(attacker: BattleUnit): number {
  return Math.max(1, 2 + (attacker.accuracy / 100 - 1) * 1.4);
}

/** Порт luck(): банк / положительная удача / отрицательная удача. */
function rollLuck(attacker: BattleUnit): LuckResult {
  if (attacker.luck >= 0) {
    const mult = critMultiplier(attacker);
    if ((attacker.critBank ?? 0) > 0) {
      return { kind: 'crit', fromBank: true, mult };
    }
    if (attacker.luck > 0 && rollChance(attacker.luck)) {
      attacker.morale += 5;
      return { kind: 'crit', fromBank: false, mult };
    }
    return { kind: 'normal' };
  }
  if (rollChance(Math.abs(attacker.luck))) {
    return { kind: 'fail' };
  }
  return { kind: 'normal' };
}

/** Урон наказания при крит-провале (phys_damage / magicDamage в боте). */
function luckFailPunishmentDamage(attacker: BattleUnit, victim: BattleUnit): number {
  if (attacker.power > attacker.damage) {
    return Math.max(1, Math.round(attacker.power + randInt(-5, 5)));
  }
  return Math.max(1, Math.round(attacker.damage - victim.armor + randInt(0, 3)));
}

/**
 * Порт наказаний luck() при crit < 0: −5 морали + rand(0..2):
 * ничего / удар по себе / удар по случайному союзнику.
 */
function applyLuckFailPunishments(
  state: BattleState | undefined,
  attacker: BattleUnit
): void {
  attacker.morale -= 5;
  if (!state) {
    return;
  }
  let report = `${attacker.displayName}: критический провал! Потеряно 5 единиц боевого духа.`;
  const punishment = randInt(0, 2);
  if (punishment === 1) {
    const dealt = luckFailPunishmentDamage(attacker, attacker);
    attacker.health -= dealt;
    report += ` Более того, удар приходится на себя (${dealt} ОЗ).`;
    markDeadIfNeeded(state, attacker);
  } else if (punishment === 2) {
    const allies = state.units.filter(
      (unit) => unit.alive && unit.team === attacker.team && unit.id !== attacker.id
    );
    const victim = allies[randInt(0, allies.length - 1)];
    if (victim) {
      const dealt = luckFailPunishmentDamage(attacker, victim);
      victim.health -= dealt;
      report += ` Более того, вместо противника удар достаётся ${victim.displayName} (${dealt} ОЗ).`;
      markDeadIfNeeded(state, victim);
    }
  }
  state.log.push(report);
}

function computeBaseRaw(
  attacker: BattleUnit,
  defender: BattleUnit,
  opts: {
    readonly kind: AttackKind;
    readonly damageMult?: number;
    readonly armorIgnore?: number;
  }
): number {
  const armorIgnore = opts.armorIgnore ?? 0;
  const damageMult = opts.damageMult ?? 1;
  // Защита — через +50 резистов (EFF.DEFEND), не через ×1.5 брони.
  const armor = defender.armor * (1 - Math.min(1, Math.max(0, armorIgnore)));
  let raw: number;
  const style = opts.kind;
  if (style === 'magic') {
    raw = Math.max(1, Math.round(attacker.power * 0.8 + randInt(-3, 3) - armor * 0.15));
  } else if (style === 'ranged') {
    raw = Math.max(1, Math.round(attacker.damage - armor * 0.5 + randInt(0, 2)));
  } else {
    raw = Math.max(1, Math.round(attacker.damage - armor + randInt(0, 2)));
  }
  return Math.max(1, Math.round(raw * damageMult));
}

function computeRawDamage(
  attacker: BattleUnit,
  defender: BattleUnit,
  opts: {
    readonly kind: AttackKind;
    readonly damageMult?: number;
    readonly armorIgnore?: number;
    readonly forceHit?: boolean;
    readonly evadeCoef?: number;
    readonly accuracyPenalty?: number;
  },
  state?: BattleState
): RawDamageResult {
  const evade = tryEvade(attacker, defender, opts);
  if (evade.missed) {
    return {
      raw: 0,
      crit: false,
      critFromBank: false,
      luckFail: false,
      fromDodgeBank: evade.fromDodgeBank,
    };
  }
  const luck = rollLuck(attacker);
  if (luck.kind === 'fail') {
    applyLuckFailPunishments(state, attacker);
    return {
      raw: 0,
      crit: false,
      critFromBank: false,
      luckFail: true,
      fromDodgeBank: false,
    };
  }
  let raw = computeBaseRaw(attacker, defender, opts);
  const crit = luck.kind === 'crit';
  const critFromBank = luck.kind === 'crit' && luck.fromBank;
  if (crit) {
    raw = Math.round(raw * luck.mult);
  }
  return { raw, crit, critFromBank, luckFail: false, fromDodgeBank: false };
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
  const source = opts.source ?? sourceFromAttackStyle(opts.kind);
  const melee = opts.kind === 'melee';
  const result = computeRawDamage(attacker, defender, opts, state);
  if (result.raw <= 0) {
    if (state && !result.luckFail) {
      // luckFail уже пишет журнал в applyLuckFailPunishments.
      if (result.fromDodgeBank) {
        state.log.push(
          `${defender.displayName} мастерски уклоняется от атаки ${attacker.displayName}!`
        );
      } else {
        // Порт evade(): обычный промах тоже пишется в журнал (иначе AoE выглядит как «1 цель»).
        state.log.push(
          `${attacker.displayName} промахивается по ${defender.displayName}.`
        );
      }
    }
    lastDeal = {
      damage: 0,
      missed: true,
      blocked: false,
      crit: false,
      critFail: result.luckFail,
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
  const vampHealed = melee ? applyVampWeaponHeal(attacker, amount) : 0;
  if (state && vampHealed > 0) {
    state.log.push(`${attacker.displayName} высасывает ${vampHealed} ОЗ.`);
  }

  if (
    melee &&
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
    melee &&
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
    melee &&
    !opts.noCounter &&
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
      {
        kind: 'melee',
        damageMult: 1,
        armorIgnore: 0,
        forceHit: opts.forceHit,
      },
      state
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
  if (
    melee &&
    counterDepth === 0 &&
    amount > 0 &&
    hasEffect(defender, 'FIRESHIELD') &&
    attacker.alive
  ) {
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
 * Прямой урон по источнику без броска попадания и брони (порт harmWithSRC).
 * @returns фактически нанесённый урон (0 при варде / иммунитете).
 */
export function harmWithSource(
  state: BattleState,
  target: BattleUnit,
  amount: number,
  source: DamageSource
): number {
  const resist = applyResistMultiplier(target, source);
  if (resist.blocked) {
    if (resist.blockReason) {
      state.log.push(resist.blockReason);
    }
    return 0;
  }
  const dealt = Math.max(0, Math.round(amount * resist.multiplier));
  target.health -= dealt;
  return dealt;
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
    entry.value -= unit.heroClassCode === 'Antipaladin' ? 33 : 25;
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
  pushSfx(state, unit, 'death');
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
