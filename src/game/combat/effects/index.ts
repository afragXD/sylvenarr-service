import {
  DAMAGE_SOURCE_LABELS,
  formatLogDamage,
  type DamageSource,
} from '../damageSources';
import { effectLogLabel } from '../effect-labels';
import { applyResistMultiplier, changeResist, mindResistFactor } from '../resists';
import { applyCatalogStats } from '../transform';
import type { BattleEffect, BattleState, BattleUnit, EffectId } from '../types';

/** Локальный randInt — чтобы не тянуть damage.ts (цикл damage ↔ effects). */
const randInt = (min: number, max: number): number =>
  min + Math.floor(Math.random() * (max - min + 1));

/** Источник урона DoT-эффектов (порт harmWithSRC из бота). */
const DOT_SOURCES: Partial<Record<EffectId, DamageSource>> = {
  POISON: 'DEATH',
  BURNING: 'FIRE',
  BLEEDING: 'DEATH',
  GALL: 'WATER',
};

/**
 * Урон DoT за тик по формулам бота (effects/valovertime.py):
 * power — множитель, rounds — оставшиеся раунды на момент тика.
 */
function dotTickAmount(unit: BattleUnit, effect: BattleEffect): number {
  const power = effect.power || 1;
  switch (effect.id) {
    case 'POISON':
      return Math.max(1, Math.round((randInt(4, 6) + effect.rounds * 6) * power));
    case 'BURNING':
      return Math.max(1, Math.round((randInt(4, 6) + 15) * power));
    case 'BLEEDING':
      return Math.max(1, Math.round((4 + effect.rounds * 3 + unit.lvl) * power));
    case 'GALL':
      return Math.max(1, Math.round(20 * power));
    default:
      return 0;
  }
}

/**
 * Снимает эффект и откатывает числовые баффы, если применимо.
 */
export function delEffect(unit: BattleUnit, id: EffectId, state?: BattleState): void {
  const idx = unit.effects.findIndex((effect) => effect.id === id);
  if (idx < 0) {
    return;
  }
  const [removed] = unit.effects.splice(idx, 1);
  if (!removed) {
    return;
  }
  reverseEffect(unit, removed, state);
}

/**
 * Снимает все эффекты с юнита.
 */
export function clearAllEffects(unit: BattleUnit, state?: BattleState): void {
  for (const effect of [...unit.effects]) {
    delEffect(unit, effect.id, state);
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
  'INTERDICT',
  'MAGIC_SHACKLES',
  'ASHILLNESS',
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
 * Лечение с учётом BLESSED (×(1 + power)); INTERDICT блокирует.
 */
export function healUnit(unit: BattleUnit, amount: number): number {
  if (hasEffect(unit, 'INTERDICT')) {
    return 0;
  }
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
 * Трата маны; SILENCE блокирует; MAGIC_SHACKLES жжёт ОЗ.
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
  if (hasEffect(unit, 'MAGIC_SHACKLES') && cost > 0) {
    const burn = Math.max(1, Math.round(cost * (10 + Math.floor(unit.lvl / 4))));
    unit.health -= burn;
  }
  return null;
}

/**
 * Урон от MAGIC_SHACKLES за последнюю трату `cost` МР (для лога).
 */
export function shacklesBurnAmount(cost: number, lvl = 1): number {
  return Math.max(1, Math.round(cost * (10 + Math.floor(lvl / 4))));
}

/**
 * Воскрешение (строгое): maxHp и инициатива режутся вдвое,
 * повторно воскресить юнита нельзя (forbiddenResurrect всегда).
 */
export function resurrectUnit(state: BattleState, unit: BattleUnit): void {
  unit.alive = true;
  unit.maxHp = Math.max(1, Math.floor(unit.maxHp / 2));
  unit.health = unit.maxHp;
  unit.initiative = Math.max(1, Math.floor(unit.initiative / 2));
  unit.defending = false;
  unit.forbiddenResurrect = true;
  state.graveyard = state.graveyard.filter((item) => item.unitId !== unit.id);
}

/**
 * Оглушение с учётом иммунитета (STUN_IMMUNE, power = % сопротивления)
 * и варда/иммунитета STUN.
 * При успехе: STUNNED на rounds + STUN_IMMUNE на rounds + 2 (порт stunMyself из бота).
 * @returns true, если цель оглушена.
 */
export function tryStun(state: BattleState, target: BattleUnit, rounds: number): boolean {
  const stunImmune = target.effects.find((effect) => effect.id === 'STUN_IMMUNE');
  if (stunImmune) {
    const power = stunImmune.power || 100;
    if (power >= 100 || randInt(1, 100) <= power) {
      state.log.push(`${target.displayName} сопротивляется оглушению.`);
      return false;
    }
  }
  const stunResist = target.resists.STUN;
  if (stunResist?.immune) {
    state.log.push(`${target.displayName} иммунен к оглушению.`);
    return false;
  }
  if ((stunResist?.wardCharges ?? 0) > 0 && stunResist) {
    stunResist.wardCharges = (stunResist.wardCharges ?? 1) - 1;
    if ((stunResist.wardCharges ?? 0) <= 0) {
      stunResist.wardCharges = undefined;
    }
    state.log.push(
      `${target.displayName}: вард «${DAMAGE_SOURCE_LABELS.STUN}» поглощает оглушение.`
    );
    return false;
  }
  grantEffect(target, 'STUNNED', rounds, 0);
  grantEffect(target, 'STUN_IMMUNE', rounds + 2, 100);
  return true;
}

/**
 * Защита от понижения/кражи уровней (вард/иммунитет LOWERINGLEVEL, порт Chance extra=LOWERINGLEVEL).
 * @returns true, если дрейн уровней разрешён.
 */
export function tryLevelDrain(state: BattleState, target: BattleUnit): boolean {
  const entry = target.resists.LOWERINGLEVEL;
  if (entry?.immune) {
    state.log.push(`${target.displayName} иммунен к понижению уровня.`);
    return false;
  }
  if ((entry?.wardCharges ?? 0) > 0 && entry) {
    entry.wardCharges = (entry.wardCharges ?? 1) - 1;
    if ((entry.wardCharges ?? 0) <= 0) {
      entry.wardCharges = undefined;
    }
    state.log.push(
      `${target.displayName}: вард «${DAMAGE_SOURCE_LABELS.LOWERINGLEVEL}» поглощает понижение уровня.`
    );
    return false;
  }
  return true;
}

/**
 * Порабощение: перенос в команду enslaver; откат при снятии ENSLAVED.
 */
export function enslaveUnit(target: BattleUnit, enslaver: BattleUnit): void {
  if (hasEffect(target, 'ENSLAVED')) {
    grantEffect(target, 'ENSLAVED', 1, 0);
    return;
  }
  target.enslavedOriginTeam = target.team;
  target.enslavedOriginPlayerId = target.playerId;
  target.team = enslaver.team;
  target.playerId = enslaver.playerId;
  grantEffect(target, 'ENSLAVED', 1, 0);
}

/**
 * Тик в начале хода юнита: regen и DoT (без уменьшения rounds).
 * DoT тикают только если !wasEffected (wait / доп. ход не повторяют урон).
 * Также сбрасывает флаг fresh — эффекты, дожившие до своего хода, тикают в его конце.
 */
export function tickEffectsOnTurnStart(unit: BattleUnit): string[] {
  const log: string[] = [];
  let fearTicked = false;
  for (const effect of [...unit.effects]) {
    effect.fresh = undefined;
    if (effect.id === 'REGENHP' && unit.alive) {
      const healed = healUnit(
        unit,
        Math.max(1, Math.round(unit.maxHp * 0.06 * Math.max(0.5, effect.power || 1)))
      );
      if (healed > 0) {
        log.push(`${unit.displayName} восстанавливает ${healed} ОЗ (регенерация).`);
      }
    }
    // FEAR — VOT бота: каждый тик −мораль, без мгновенного −урона.
    if (effect.id === 'FEAR' && unit.alive && !unit.wasEffected) {
      const loss = Math.round((5 + (effect.power || 3)) * mindResistFactor(unit));
      if (loss > 0) {
        unit.morale -= loss;
        log.push(
          `От магического страха ${unit.displayName} теряет ${loss} единиц боевого духа.`
        );
      }
      fearTicked = true;
    }
    const dotSource = DOT_SOURCES[effect.id];
    if (dotSource && unit.alive && !unit.wasEffected) {
      const resist = applyResistMultiplier(unit, dotSource);
      if (resist.blocked) {
        if (resist.blockReason) {
          log.push(resist.blockReason);
        }
      } else {
        const raw = dotTickAmount(unit, effect);
        const dot = Math.max(1, Math.round(raw * resist.multiplier));
        unit.health -= dot;
        log.push(
          `${unit.displayName} получает ${formatLogDamage(dot, dotSource)} урона от ${effectLogLabel(effect.id)}.`
        );
      }
    }
  }
  if (
    fearTicked ||
    [...unit.effects].some((effect) => DOT_SOURCES[effect.id])
  ) {
    unit.wasEffected = true;
  }
  return log;
}

/**
 * Прирост маны с clamp к maxMana.
 */
export function addMana(unit: BattleUnit, amount: number): number {
  if (amount <= 0 || unit.maxMana <= 0) {
    return 0;
  }
  const before = unit.mana;
  unit.mana = Math.min(unit.maxMana, unit.mana + amount);
  return unit.mana - before;
}

/**
 * Тик в конце хода юнита: уменьшение rounds и спадание эффектов.
 * Эффекты, наложенные в этот же ход (fresh), первый тик пропускают.
 */
export function tickEffectsOnTurnEnd(unit: BattleUnit, state?: BattleState): string[] {
  const log: string[] = [];
  for (const effect of [...unit.effects]) {
    if (effect.fresh) {
      continue;
    }
    effect.rounds -= 1;
    if (effect.rounds <= 0) {
      delEffect(unit, effect.id, state);
      log.push(
        `Эффект ${effectLogLabel(effect.id)} спадает с ${unit.displayName}.`
      );
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
      // В боте attrs=['morale'], не luck.
      unit.morale += Math.round(effect.power);
      break;
    case 'ABSOLUTEPOWER': {
      // Доля (0,1] → round(power * frac); иначе абсолютный бонус.
      const bonus =
        effect.power > 0 && effect.power <= 1
          ? Math.max(1, Math.round(unit.power * effect.power))
          : Math.round(effect.power);
      unit.power += bonus;
      effect.power = bonus;
      break;
    }
    case 'FATMAN':
      unit.dodge = Math.max(0, unit.dodge - Math.round(effect.power));
      break;
    case 'GUARDED':
      // TempLabels: только метка (блок выбора цели), без брони.
      break;
    case 'AIRSHIELD': {
      const delta = Math.max(1, Math.round(effect.power || 33));
      effect.power = delta;
      changeResist(unit, 'ARROWS', delta);
      break;
    }
    case 'FEAR':
      // VOT: мораль тикает в tickEffectsOnTurnStart, не на apply.
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
    case 'INVISIBLE':
      unit.dodge += Math.round(effect.power || 25);
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
    case 'ROW_FORTIFY':
      unit.armor += Math.max(1, Math.round(effect.power || 1));
      break;
    case 'ASHILLNESS': {
      // power — доля (VK [0.25, 0.25]); снижаем мощь и инициативу один раз.
      const frac = effect.power > 0 && effect.power <= 1 ? effect.power : 0.25;
      const powerLoss = Math.floor(unit.power * frac);
      const initLoss = Math.floor(unit.initiative * frac);
      unit.power = Math.max(0, unit.power - powerLoss);
      unit.initiative = Math.max(1, unit.initiative - initLoss);
      break;
    }
    case 'ENSLAVED':
    case 'MAGIC_SHACKLES':
      break;
    default:
      break;
  }
}

function reverseEffect(unit: BattleUnit, effect: BattleEffect, state?: BattleState): void {
  switch (effect.id) {
    case 'STRENGTH':
      unit.damage = Math.max(0, unit.damage - Math.round(effect.power));
      break;
    case 'HAPPY':
      unit.morale -= Math.round(effect.power);
      break;
    case 'ABSOLUTEPOWER':
      unit.power = Math.max(0, unit.power - Math.round(effect.power));
      break;
    case 'FATMAN':
      unit.dodge += Math.round(effect.power);
      break;
    case 'GUARDED':
      break;
    case 'AIRSHIELD':
      changeResist(unit, 'ARROWS', -Math.max(1, Math.round(effect.power || 33)));
      break;
    case 'FEAR':
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
    case 'POLYMORPH': {
      const parent = unit.transformParentCode;
      unit.transformParentCode = null;
      if (parent && state) {
        applyCatalogStats(state, unit, parent);
      }
      break;
    }
    case 'LUCKY':
      unit.luck = Math.max(0, unit.luck - Math.round(effect.power || 20));
      break;
    case 'FOCUSED':
      unit.accuracy = Math.max(0, unit.accuracy - Math.round(effect.power || 15));
      break;
    case 'INVISIBLE':
      unit.dodge = Math.max(0, unit.dodge - Math.round(effect.power || 25));
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
    case 'ENSLAVED': {
      if (unit.enslavedOriginTeam !== null) {
        unit.team = unit.enslavedOriginTeam;
      }
      if (unit.enslavedOriginPlayerId !== null) {
        unit.playerId = unit.enslavedOriginPlayerId;
      }
      unit.enslavedOriginTeam = null;
      unit.enslavedOriginPlayerId = null;
      if (state) {
        for (const summon of state.units) {
          if (summon.alive && summon.isSummon && summon.summonerId === unit.id) {
            summon.team = unit.team;
            summon.playerId = unit.playerId;
          }
        }
      }
      break;
    }
    case 'ROW_FORTIFY':
      unit.armor = Math.max(
        0,
        unit.armor - Math.max(1, Math.round(effect.power || 1))
      );
      break;
    case 'ASHILLNESS':
      // Снижение постоянное на время маркера; откат не восстанавливаем (доля от текущего).
      break;
    case 'MAGIC_SHACKLES':
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
 * Новый эффект помечается fresh — первый end-тик носителя его пропустит.
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
  const effect: BattleEffect = { id, rounds, power, fresh: true };
  unit.effects.push(effect);
  applyEffectOnAdd(unit, effect);
}
