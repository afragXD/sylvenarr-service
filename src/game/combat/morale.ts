import { addTeamGold, teamGold } from '../economy';
import { firstActionAttackKind } from './abilities/primary-attack';
import { alliesOf } from './abilities/targets';
import { dealDamage, formatLastLogDamage, markDeadIfNeeded, randInt } from './damage';
import { formatLogDamage } from './damageSources';
import { grantEffect } from './effects';
import { levelUpUnit } from './level';
import { isArtificialClass, isUndeadClass } from './races';
import type { BattleState, BattleUnit, MentalIllnessKind } from './types';

/**
 * Потолок морали юнита (CUT-2026-11-01c AC-1; владелец: 100, метод — не литерал 65 из бота).
 * Порт Hero.max_morale / self.maxMorale().
 */
export function maxMorale(_unit: BattleUnit): number {
  return 100;
}

/** @deprecated используйте maxMorale(unit) */
export const MORALE_CAP = 100;

/** Верхняя граница уклонения (порт Hero.normalize). */
export const DODGE_CAP = 45;

/** Верхняя граница удачи / крита (порт Hero.normalize crit). */
export const LUCK_CAP = 60;

const ILLNESS_KINDS: MentalIllnessKind[] = [
  'paranoia',
  'apathy',
  'schizophrenia',
  'degradation',
  'masochism',
];

/**
 * Порт Hero.normalize: полы урона/силы/уровня, потолки dodge/luck;
 * при morale ≥ maxMorale(unit) — доп. жизнь и сброс морали (AC-1).
 */
export function normalizeUnit(unit: BattleUnit, state?: BattleState): void {
  unit.damage = Math.max(0, unit.damage);
  unit.power = Math.max(0, unit.power);
  unit.lvl = Math.max(0, unit.lvl);
  unit.dodge = Math.min(DODGE_CAP, unit.dodge);
  unit.luck = Math.min(LUCK_CAP, unit.luck);
  applyMaxMoraleReward(unit, state);
}

/** Награда за максимальную мораль: lives ≤ 1, morale = maxMorale(unit) // 2. */
export function applyMaxMoraleReward(unit: BattleUnit, state?: BattleState): void {
  const cap = maxMorale(unit);
  if (unit.morale < cap) {
    unit.morale = Math.min(cap, unit.morale);
    return;
  }
  unit.lives = Math.min(unit.lives + 1, 1);
  unit.morale = Math.floor(cap / 2);
  if (state) {
    state.log.push(
      `${unit.displayName}: максимальный боевой дух! Доп. жизнь (${unit.lives}), мораль → ${unit.morale}.`
    );
  }
}

/**
 * Шанс % (1..100) — порт Chance(value).__bool__.
 */
export function chancePercent(value: number): boolean {
  return randInt(1, 100) <= value;
}

/** Шанс психоза за ход при morale ≤ −70: 30 + 2×(−70 − morale), кап не нужен до −100. */
export function psychoChance(morale: number): number {
  return 30 + 2 * (-70 - morale);
}

/** Шанс дебаффа низкой морали: min(|morale|, 70). */
export function lowMoraleDebuffChance(morale: number): number {
  return Math.min(Math.abs(morale), 70);
}

function isMoraleImmune(unit: BattleUnit): boolean {
  return isUndeadClass(unit.heroClassCode) || isArtificialClass(unit.heroClassCode);
}

function isMageUnit(state: BattleState, unit: BattleUnit): boolean {
  const kind = firstActionAttackKind(state, unit);
  // Маг = основная атака магическая; иначе воин (ближняя/дальняя).
  return kind === 'magic';
}

function pickLowestHpAlly(allies: BattleUnit[]): BattleUnit {
  let best = Number.POSITIVE_INFINITY;
  const pool: BattleUnit[] = [];
  for (const ally of allies) {
    if (ally.health < best) {
      best = ally.health;
      pool.length = 0;
      pool.push(ally);
    } else if (ally.health === best) {
      pool.push(ally);
    }
  }
  return pool[randInt(0, pool.length - 1)]!;
}

/**
 * Mental illness (CUT-2026-11-01c AC-1): 5 болезней, без «Душевного подъёма».
 */
export function addMentalIllness(state: BattleState, unit: BattleUnit, fate: number): void {
  switch (fate) {
    case 1: {
      unit.illnessKind = 'paranoia';
      state.log.push(
        `${unit.displayName}: паранойя — в начале хода бьёт союзника с наименьшими ОЗ.`
      );
      break;
    }
    case 2: {
      unit.illnessKind = 'apathy';
      if (unit.dodge > 0) {
        unit.dodge = 0;
      }
      if (unit.luck > 0) {
        unit.luck = 0;
      }
      unit.initiative = 5;
      state.log.push(`${unit.displayName}: апатия — уклонение 0, крит 0, инициатива 5.`);
      break;
    }
    case 3: {
      unit.illnessKind = 'schizophrenia';
      // TODO(items): Шизофрения — уничтожать 2 случайных предмета, когда появятся предметы
      unit.accuracy = Math.max(0, Math.round(unit.accuracy * (1 - 0.33)));
      state.log.push(
        `${unit.displayName}: шизофрения — точность −33%, предметы недоступны; золото будет разбрасывать.`
      );
      break;
    }
    case 4: {
      unit.illnessKind = 'degradation';
      // TODO(perks): Деградация — терять все перки
      const loss = Math.floor(unit.lvl / 2);
      if (loss > 0) {
        levelUpUnit(unit, -loss, state);
      }
      unit.mana = 0;
      state.log.push(`${unit.displayName}: деградация — −${loss} ур., мана 0.`);
      break;
    }
    case 5: {
      unit.illnessKind = 'masochism';
      state.log.push(`${unit.displayName}: мазохизм — в начале раунда ранит себя.`);
      break;
    }
    default:
      state.log.push(`${unit.displayName}: неизвестная болезнь разума.`);
      break;
  }
}

/**
 * Психоз в начале хода (CUT-2026-11-01c AC-1).
 * Undead/artificial иммунны. < −100 — смерть; ≤ −70 — шанс illness один раз за бой.
 */
export function applyPsycho(state: BattleState, unit: BattleUnit): void {
  if (isMoraleImmune(unit)) {
    return;
  }
  if (unit.morale > -70) {
    return;
  }
  if (unit.morale < -100) {
    state.log.push(`${unit.displayName} не выдерживает психологической атаки — сердечный приступ.`);
    unit.health = 0;
    markDeadIfNeeded(state, unit);
    return;
  }
  if (unit.illness) {
    return;
  }
  if (!chancePercent(psychoChance(unit.morale))) {
    return;
  }
  const fate = randInt(1, 5);
  addMentalIllness(state, unit, fate);
  unit.illness = true;
}

/** Тики болезней в начале хода носителя (паранойя, шизофрения). */
export function applyIllnessTurnStart(state: BattleState, unit: BattleUnit): void {
  if (!unit.alive || !unit.illnessKind) {
    return;
  }
  if (unit.illnessKind === 'paranoia') {
    const allies = alliesOf(state, unit).filter((ally) => ally.id !== unit.id);
    if (allies.length === 0) {
      state.log.push(`${unit.displayName}: паранойя — нет союзников для удара.`);
      return;
    }
    const target = pickLowestHpAlly(allies);
    const dmg = dealDamage(
      unit,
      target,
      {
        kind: firstActionAttackKind(state, unit),
        damageMult: 1,
        armorIgnore: 0,
      },
      state
    );
    state.log.push(
      `${unit.displayName} в паранойе бьёт ${target.displayName} ${formatLastLogDamage(dmg)}.`
    );
    markDeadIfNeeded(state, target);
    return;
  }
  if (unit.illnessKind === 'schizophrenia') {
    const loss = Math.min(300, teamGold(state, unit.team));
    addTeamGold(state, unit.team, -300);
    state.log.push(`${unit.displayName} разбрасывает и смеётся (−${loss} золота).`);
  }
}

/** Мазохизм: в начале раунда неблокируемый урон DEFAULT. */
export function applyMasochismRoundStart(state: BattleState): void {
  for (const unit of state.units) {
    if (!unit.alive || unit.illnessKind !== 'masochism') {
      continue;
    }
    const amount = Math.floor(Math.max(unit.damage, unit.power) / 3);
    if (amount <= 0) {
      continue;
    }
    unit.health -= amount;
    state.log.push(
      `${unit.displayName}: мазохизм наносит себе ${formatLogDamage(amount, 'DEFAULT')}.`
    );
    markDeadIfNeeded(state, unit);
  }
}

/**
 * Бонус за высокую мораль после хода (порт rewardForHighMorale).
 * Chance(morale) → на 2 раунда: маги +25% силы магии (ABSOLUTEPOWER), воины +33% урона (STRENGTH).
 */
export function maybeRewardHighMorale(state: BattleState, unit: BattleUnit): void {
  if (!unit.alive || unit.morale <= 0) {
    return;
  }
  if (!chancePercent(unit.morale)) {
    return;
  }
  if (isMageUnit(state, unit)) {
    grantEffect(unit, 'ABSOLUTEPOWER', 2, 0.25);
    state.log.push(`${unit.displayName}: высокий боевой дух усиливает магию (+25% СМ на 2 р.).`);
    return;
  }
  const bonus = Math.max(1, Math.round(unit.damage * 0.33));
  grantEffect(unit, 'STRENGTH', 2, bonus);
  state.log.push(`${unit.displayName}: высокий боевой дух даёт силу (+${bonus} урона на 2 р.).`);
}

/**
 * Дебафф низкой морали после хода (AC-1): при morale ≤ −20 шанс min(|m|, 70)%;
 * маг −20% силы, воин −round(0.25×dmg), 2 раунда; нежить/искусственные иммунны.
 */
export function maybePunishLowMorale(state: BattleState, unit: BattleUnit): void {
  if (!unit.alive || isMoraleImmune(unit)) {
    return;
  }
  if (unit.morale > -20) {
    return;
  }
  if (!chancePercent(lowMoraleDebuffChance(unit.morale))) {
    return;
  }
  if (isMageUnit(state, unit)) {
    const loss = Math.max(1, Math.round(unit.power * 0.2));
    grantEffect(unit, 'ABSOLUTEPOWER', 2, -loss);
    state.log.push(`${unit.displayName}: упадок духа ослабляет магию (−${loss} СМ на 2 р.).`);
    return;
  }
  const loss = Math.max(1, Math.round(unit.damage * 0.25));
  grantEffect(unit, 'STRENGTH', 2, -loss);
  state.log.push(`${unit.displayName}: упадок духа ослабляет атаку (−${loss} урона на 2 р.).`);
}

/** Случайная болезнь 1..5 (для тестов с фиксированным fate используйте addMentalIllness). */
export function rollIllnessFate(): number {
  return randInt(1, ILLNESS_KINDS.length);
}
