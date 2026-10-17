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
 * Снимает все эффекты с юнита.
 */
export function clearAllEffects(unit: BattleUnit): void {
  for (const effect of [...unit.effects]) {
    delEffect(unit, effect.id);
  }
}

/** Debuff ids для cleanse (Herbalist и т.п.). */
export const DEBUFF_EFFECT_IDS: readonly EffectId[] = [
  'POISON',
  'BURNING',
  'BLEEDING',
  'FATMAN',
  'CHAINED',
  'FEAR',
  'PETRIFIED',
  'SLOW',
  'MARKED',
  'DEATHSENTENCE',
  'INTERFERENCE',
  'SILENCE',
  'IMPISH',
  'STUNNED',
  'WEAKNESS',
  'UNLUCKY',
  'GALL',
];

/**
 * Снимает только отрицательные эффекты.
 */
export function clearDebuffs(unit: BattleUnit): void {
  for (const id of DEBUFF_EFFECT_IDS) {
    if (hasEffect(unit, id)) {
      delEffect(unit, id);
    }
  }
}

/**
 * Лечение с учётом BLESSED (×(1 + power)).
 */
export function healUnit(unit: BattleUnit, amount: number): number {
  let healed = Math.max(0, amount);
  const blessed = unit.effects.find((effect) => effect.id === 'BLESSED');
  if (blessed) {
    healed = Math.round(healed * (1 + blessed.power));
  }
  const before = unit.health;
  unit.health = Math.min(unit.maxHp, unit.health + healed);
  return unit.health - before;
}

/**
 * Вампиризм оружия после нанесённого урона.
 */
export function applyVampWeaponHeal(attacker: BattleUnit, damage: number): number {
  if (damage <= 0) {
    return 0;
  }
  const vamp = attacker.effects.find((effect) => effect.id === 'VAMPWEAPON');
  if (!vamp || vamp.power <= 0) {
    return 0;
  }
  const heal = Math.max(1, Math.round(damage * Math.min(1, vamp.power)));
  return healUnit(attacker, heal);
}

/**
 * Трата маны; SILENCE блокирует.
 * @returns сообщение об ошибке или null при успехе.
 */
export function trySpendMana(unit: BattleUnit, cost: number): string | null {
  if (hasEffect(unit, 'SILENCE')) {
    return 'Немота — нельзя тратить ману';
  }
  if (unit.mana < cost) {
    return `Нужно ${cost} МР`;
  }
  unit.mana -= cost;
  return null;
}

/**
 * Тик в начале хода юнита: regen, DoT и уменьшение rounds.
 */
export function tickEffectsOnTurnStart(unit: BattleUnit): string[] {
  const log: string[] = [];
  for (const effect of [...unit.effects]) {
    if (effect.id === 'REGENHP' && unit.alive) {
      const healed = healUnit(
        unit,
        Math.max(1, Math.round(unit.maxHp * 0.06 * Math.max(0.5, effect.power || 1)))
      );
      if (healed > 0) {
        log.push(`${unit.displayName} восстанавливает ${healed} ОЗ (регенерация).`);
      }
    }
    if (
      (effect.id === 'POISON' ||
        effect.id === 'BURNING' ||
        effect.id === 'BLEEDING' ||
        effect.id === 'GALL') &&
      unit.alive
    ) {
      const dot = Math.max(1, Math.round(effect.power || 3));
      unit.health -= dot;
      log.push(`${unit.displayName} получает ${dot} урона от ${effect.id}.`);
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
    case 'FEAR':
      unit.damage = Math.max(1, unit.damage - Math.round(effect.power || 3));
      break;
    case 'HASTE':
      unit.initiative += Math.round(effect.power || 20);
      break;
    case 'CHAMELEON':
      unit.dodge += Math.round(effect.power || 20);
      break;
    case 'PETRIFIED':
      unit.armor += Math.round(effect.power || 15);
      break;
    case 'SLOW':
      unit.initiative = Math.max(
        1,
        unit.initiative - Math.round(effect.power || 15)
      );
      break;
    case 'STONEFLESH':
      unit.armor += Math.max(1, Math.round(effect.power || 20));
      break;
    case 'DEATHSENTENCE':
      unit.armor = Math.max(0, unit.armor - Math.round(effect.power || 5));
      break;
    case 'INTERFERENCE':
      unit.power = Math.max(0, unit.power - Math.round(effect.power || 5));
      break;
    case 'IMPISH':
      if (unit.polymorphSavedArmor < 0) {
        unit.polymorphSavedArmor = unit.armor;
      }
      unit.armor = 0;
      unit.damage = Math.max(1, unit.damage - Math.round(effect.power || 5));
      break;
    case 'LUCKY':
      unit.luck += Math.round(effect.power || 20);
      break;
    case 'FOCUSED':
      unit.accuracy += Math.round(effect.power || 15);
      break;
    case 'WEAKNESS':
      unit.damage = Math.max(1, unit.damage - Math.round(effect.power || 5));
      break;
    case 'UNLUCKY':
      unit.luck = Math.max(0, unit.luck - Math.round(effect.power || 20));
      break;
    case 'GALL':
      unit.armor = Math.max(0, unit.armor - Math.max(1, Math.round(effect.power || 2)));
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
    case 'FEAR':
      unit.damage += Math.round(effect.power || 3);
      break;
    case 'HASTE':
      unit.initiative = Math.max(1, unit.initiative - Math.round(effect.power || 20));
      break;
    case 'CHAMELEON':
      unit.dodge = Math.max(0, unit.dodge - Math.round(effect.power || 20));
      break;
    case 'PETRIFIED':
      unit.armor = Math.max(0, unit.armor - Math.round(effect.power || 15));
      break;
    case 'SLOW':
      unit.initiative += Math.round(effect.power || 15);
      break;
    case 'STONEFLESH':
      unit.armor = Math.max(0, unit.armor - Math.max(1, Math.round(effect.power || 20)));
      break;
    case 'DEATHSENTENCE':
      unit.armor += Math.round(effect.power || 5);
      break;
    case 'INTERFERENCE':
      unit.power += Math.round(effect.power || 5);
      break;
    case 'IMPISH':
      unit.damage += Math.round(effect.power || 5);
      if (unit.polymorphSavedArmor >= 0) {
        unit.armor = unit.polymorphSavedArmor;
        unit.polymorphSavedArmor = -1;
      }
      break;
    case 'LUCKY':
      unit.luck = Math.max(0, unit.luck - Math.round(effect.power || 20));
      break;
    case 'FOCUSED':
      unit.accuracy = Math.max(0, unit.accuracy - Math.round(effect.power || 15));
      break;
    case 'WEAKNESS':
      unit.damage += Math.round(effect.power || 5);
      break;
    case 'UNLUCKY':
      unit.luck += Math.round(effect.power || 20);
      break;
    case 'GALL':
      unit.armor += Math.max(1, Math.round(effect.power || 2));
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
