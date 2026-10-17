import type { BattleEffect, BattleUnit, EffectId } from '../types';

/**
 * Снимает эффект и откатывает числовые баффы, если применимо.
 */
export function delEffect(unit: BattleUnit, id: EffectId): void {
  const idx = unit.effects.findIndex((effect) => effect.id === id);
  if (idx < 0) {
    return;
  }
  const [removed] = unit.effects.splice(idx, 1);
  if (!removed) {
    return;
  }
  reverseEffect(unit, removed);
}

/**
 * Тик в начале хода юнита: DoT и уменьшение rounds.
 */
export function tickEffectsOnTurnStart(unit: BattleUnit): string[] {
  const log: string[] = [];
  for (const effect of [...unit.effects]) {
    if (effect.id === 'POISON' || effect.id === 'BURNING' || effect.id === 'BLEEDING') {
      const dot = Math.max(1, Math.round(effect.power || 3));
      unit.health -= dot;
      log.push(`${unit.displayName} получает ${dot} урона от ${effect.id}.`);
      if (unit.health <= 0) {
        unit.health = 0;
        unit.alive = false;
        log.push(`${unit.displayName} погибает.`);
      }
    }
    effect.rounds -= 1;
    if (effect.rounds <= 0) {
      delEffect(unit, effect.id);
      log.push(`Эффект ${effect.id} спадает с ${unit.displayName}.`);
    }
  }
  return log;
}

/**
 * Применяет числовой эффект при наложении.
 */
export function applyEffectOnAdd(unit: BattleUnit, effect: BattleEffect): void {
  switch (effect.id) {
    case 'STRENGTH':
      unit.damage += Math.round(effect.power);
      break;
    case 'HAPPY':
      unit.luck += Math.round(effect.power);
      break;
    case 'FATMAN':
      unit.dodge = Math.max(0, unit.dodge - Math.round(effect.power));
      break;
    case 'GUARDED':
      unit.armor += Math.max(1, Math.round(effect.power || 3));
      break;
    default:
      break;
  }
}

function reverseEffect(unit: BattleUnit, effect: BattleEffect): void {
  switch (effect.id) {
    case 'STRENGTH':
      unit.damage = Math.max(0, unit.damage - Math.round(effect.power));
      break;
    case 'HAPPY':
      unit.luck -= Math.round(effect.power);
      break;
    case 'FATMAN':
      unit.dodge += Math.round(effect.power);
      break;
    case 'GUARDED':
      unit.armor = Math.max(0, unit.armor - Math.max(1, Math.round(effect.power || 3)));
      break;
    default:
      break;
  }
}

/**
 * Есть ли активный эффект.
 */
export function hasEffect(unit: BattleUnit, id: EffectId): boolean {
  return unit.effects.some((effect) => effect.id === id);
}

/**
 * Добавляет эффект с applyOnAdd (продлевает, если уже есть).
 */
export function grantEffect(
  unit: BattleUnit,
  id: EffectId,
  rounds: number,
  power = 0
): void {
  const existing = unit.effects.find((effect) => effect.id === id);
  if (existing) {
    existing.rounds += rounds;
    return;
  }
  const effect: BattleEffect = { id, rounds, power };
  unit.effects.push(effect);
  applyEffectOnAdd(unit, effect);
}
