import { DAMAGE_SOURCE_LABELS, type DamageSource, formatLogDamage } from '../damageSources';
import { effectLogLabel } from '../effect-labels';
import {
  applyResistMultiplier,
  changeResist,
  consumeSrcFactor,
  mindResistFactor,
} from '../resists';
import { applyCatalogStats, popResistSnapshot, transformClassOnly } from '../transform';
import type { BattleEffect, BattleState, BattleUnit, EffectId } from '../types';
import { currentEffectState } from './context';

/** Источники +50/−50 при защитной стойке (порт Hero.protection / EFF.DEFEND). */
const DEFEND_RESIST_SOURCES = [
  'WEAPON',
  'FIRE',
  'WATER',
  'AIR',
  'EARTH',
  'DEATH',
  'MIND',
] as const satisfies ReadonlyArray<DamageSource>;

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
      // CUT AC-12: power хранит урон за тик (10 + L кастера).
      return Math.max(1, Math.round(power));
    default:
      return 0;
  }
}

/**
 * Снятие брони за тик Желчи: −(3 + ⌊L/5⌋), не ниже 0.
 * L кастера лежит в casterLvl. Старые снимки: power = 10+L.
 */
function gallArmorStrip(effect: BattleEffect): number {
  const lvl =
    typeof effect.casterLvl === 'number'
      ? effect.casterLvl
      : Math.max(0, Math.round(effect.power) - 10);
  return Math.max(0, 3 + Math.floor(lvl / 5));
}

/**
 * Сдвигает стат и запоминает фактическую дельту (после пола).
 * floor не задан — сдвиг без ограничения.
 */
function applyStatShift(
  effect: BattleEffect,
  current: number,
  delta: number,
  floor?: number,
): number {
  const next = floor === undefined ? current + delta : Math.max(floor, current + delta);
  effect.applied = next - current;
  return next;
}

/** Возвращает стат ровно на сохранённую дельту. */
function undoStatShift(effect: BattleEffect, current: number, fallbackApplied: number): number {
  const applied = typeof effect.applied === 'number' ? effect.applied : fallbackApplied;
  return current - applied;
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
  'INFECTED',
  'STUNNED',
  'WEAKNESS',
  'UNLUCKY',
  'GALL',
  'INTERDICT',
  'MAGIC_SHACKLES',
  'ASHILLNESS',
  'LIFE_FETTERS',
  'ERUPTION',
  'KILLMANA',
  'DRUNK',
];

/** Положительные эффекты для рассеивания (Angel «Кровь за Веру»). */
export const BUFF_EFFECT_IDS: readonly EffectId[] = [
  'STRENGTH',
  'BLESSED',
  'HAPPY',
  'VAMPWEAPON',
  'REGENHP',
  'HASTE',
  'CHAMELEON',
  'STONEFLESH',
  'CONTR',
  'FIRESHIELD',
  'AIRSHIELD',
  'LUCKY',
  'FOCUSED',
  'FIREDWEAPON',
  'AIRWEAPON',
  'INVISIBLE',
  'ROW_FORTIFY',
  'ABSOLUTEPOWER',
  'BERSERK',
  'IMAGINARY_HEALTH',
  'IMMOLATION',
  'DEATHWARD',
  'PAIN_REFLECT',
  'LIFE_THREAD',
  'REFLECTION',
  'REGENMANA',
  'POISONEDWEAPON',
  'BREAKWEAPON',
];

/**
 * Снимает положительные эффекты; возвращает число снятых.
 */
export function clearBuffs(unit: BattleUnit, state?: BattleState): number {
  let removed = 0;
  for (const id of BUFF_EFFECT_IDS) {
    if (hasEffect(unit, id)) {
      delEffect(unit, id, state);
      removed += 1;
    }
  }
  return removed;
}

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
  const rate = unit.healRate ?? 1;
  if (rate !== 1) {
    healed = Math.round(healed * rate);
  }
  const before = unit.health;
  unit.health = Math.min(unit.maxHp, unit.health + healed);
  const gained = unit.health - before;
  copyLoveHeal(unit, gained);
  return gained;
}

let loveCopying = false;

/** Оковы любви: фактический прирост ОЗ копируется партнёру один раз. */
function copyLoveHeal(unit: BattleUnit, gained: number): void {
  if (loveCopying || gained <= 0) {
    return;
  }
  const link = unit.effects.find((effect) => effect.id === 'LOVE_SHACKLES');
  if (!link?.linkId) {
    return;
  }
  const state = currentEffectState();
  if (!state) {
    return;
  }
  const other = state.units.find((item) => item.id === link.linkId && item.alive);
  const back = other?.effects.find(
    (effect) => effect.id === 'LOVE_SHACKLES' && effect.linkId === unit.id,
  );
  if (!other || !back) {
    return;
  }
  loveCopying = true;
  const before = other.health;
  other.health = Math.min(other.maxHp, other.health + gained);
  const copied = other.health - before;
  loveCopying = false;
  if (copied > 0) {
    state.log.push(`${other.displayName} делит лечение: +${copied} ОЗ.`);
  }
}

/** Смерть любого конца рвёт Оковы любви. */
export function breakLoveLinks(state: BattleState, unit: BattleUnit): void {
  for (const other of [...state.units]) {
    const link = other.effects.find((effect) => effect.id === 'LOVE_SHACKLES');
    if (link && (other.id === unit.id || link.linkId === unit.id)) {
      delEffect(other, 'LOVE_SHACKLES', state);
    }
  }
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
  const shackles = unit.effects.find((effect) => effect.id === 'MAGIC_SHACKLES');
  if (shackles && cost > 0) {
    const casterLvl = shackles.casterLvl ?? 1;
    const raw = shacklesBurnAmount(cost, casterLvl);
    const state = currentEffectState();
    let burn = raw;
    if (state) {
      const resist = applyResistMultiplier(unit, 'DEFAULT');
      if (resist.blocked) {
        burn = 0;
        if (resist.blockReason) {
          state.log.push(resist.blockReason);
        }
      } else {
        burn = Math.max(0, Math.round(raw * resist.multiplier));
      }
      if (burn > 0) {
        state.log.push(
          `${unit.displayName} получает ${formatLogDamage(burn, 'DEFAULT')} от волшебных оков.`,
        );
      }
    }
    if (burn > 0) {
      unit.health -= burn;
    }
  }
  return null;
}

/**
 * Урон от MAGIC_SHACKLES за последнюю трату `cost` МР (для лога).
 */
export function shacklesBurnAmount(cost: number, lvl = 1): number {
  return Math.max(0, cost * (5 + Math.floor(lvl / 4)));
}

/**
 * Воскрешение (строгое): maxHp и инициатива режутся вдвое,
 * повторно воскресить юнита нельзя (forbiddenResurrect всегда).
 */
export function resurrectUnit(
  state: BattleState,
  unit: BattleUnit,
  opts?: { readonly forbiddenResurrect?: boolean }
): void {
  unit.alive = true;
  unit.maxHp = Math.max(1, Math.floor(unit.maxHp / 2));
  unit.health = unit.maxHp;
  unit.initiative = Math.max(1, Math.floor(unit.initiative / 2));
  unit.defending = false;
  unit.forbiddenResurrect = opts?.forbiddenResurrect ?? true;
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
  // CUT-2026-11-09 AC-7: процент STUN работает и без ярмарки.
  if (stunResist && stunResist.value > 0 && randInt(1, 100) <= stunResist.value) {
    state.log.push(`${target.displayName} сопротивляется оглушению.`);
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
    if (effect.id === 'REGENMANA' && unit.alive) {
      const gained = addMana(unit, Math.round(effect.power));
      if (gained > 0) {
        log.push(`${unit.displayName} восполняет ${gained} маны.`);
      }
    }
    if (effect.id === 'KILLMANA' && unit.alive) {
      const loss = Math.max(0, Math.round(effect.power));
      if (loss > 0 && unit.mana > 0) {
        const before = unit.mana;
        unit.mana = Math.max(0, unit.mana - loss);
        const lost = before - unit.mana;
        if (lost > 0) {
          log.push(`${unit.displayName} теряет ${lost} маны.`);
        }
      }
    }
    // FEAR — VOT бота: каждый тик −мораль, без мгновенного −урона.
    if (effect.id === 'FEAR' && unit.alive && !unit.wasEffected) {
      const loss = Math.round((5 + (effect.power || 3)) * mindResistFactor(unit));
      if (loss > 0) {
        unit.morale -= loss;
        log.push(`От магического страха ${unit.displayName} теряет ${loss} единиц боевого духа.`);
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
          `${unit.displayName} получает ${formatLogDamage(dot, dotSource)} урона от ${effectLogLabel(effect.id, effect.power)}.`
        );
      }
      // CUT AC-12: Желчь каждый тик навсегда разъедает броню (даже если вард съел урон).
      if (effect.id === 'GALL') {
        // CUT-2026-11-09 AC-20: тик и срок связаны — end уменьшит rounds только после тика.
        effect.consumeRoundOnEnd = true;
        const strip = gallArmorStrip(effect);
        if (strip > 0) {
          const before = unit.armor;
          unit.armor = Math.max(0, unit.armor - strip);
          const lost = before - unit.armor;
          if (lost > 0) {
            log.push(`${effectLogLabel('GALL')} разъедает броню ${unit.displayName}: −${lost}.`);
          }
        }
      }
    }
  }
  if (fearTicked || [...unit.effects].some((effect) => DOT_SOURCES[effect.id])) {
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
    // CUT-2026-11-09 AC-20: доп. ход («Ждать») без тика Желчи не съедает её раунд.
    if (effect.id === 'GALL') {
      if (!effect.consumeRoundOnEnd) {
        continue;
      }
      effect.consumeRoundOnEnd = undefined;
    }
    effect.rounds -= 1;
    if (effect.rounds <= 0) {
      // Расплата за договор — только по истечении, не при рассеивании.
      if (effect.id === 'IMMOLATION' && unit.alive) {
        const burn = Math.max(1, Math.round(unit.maxHp * 0.75));
        unit.health -= burn;
        log.push(
          `${unit.displayName} расплачивается по нечистому договору: ${formatLogDamage(burn, 'DEFAULT')} урона.`
        );
      }
      delEffect(unit, effect.id, state);
      log.push(`Эффект ${effectLogLabel(effect.id, effect.power)} спадает с ${unit.displayName}.`);
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
      // CUT-2026-11-09 AC-22: пол 0 — normalizeUnit не обрежет мимо applied.
      unit.damage = applyStatShift(effect, unit.damage, Math.round(effect.power), 0);
      break;
    case 'HAPPY':
      // В боте attrs=['morale'], не luck.
      unit.morale = applyStatShift(effect, unit.morale, Math.round(effect.power));
      break;
    case 'ABSOLUTEPOWER': {
      // Доля (0,1] → round(power * frac); иначе абсолютный бонус.
      const bonus =
        effect.power > 0 && effect.power <= 1
          ? Math.max(1, Math.round(unit.power * effect.power))
          : Math.round(effect.power);
      // CUT-2026-11-09 AC-22: пол 0 — normalizeUnit(power) не даёт дрейфа при снятии.
      unit.power = applyStatShift(effect, unit.power, bonus, 0);
      effect.power = bonus;
      break;
    }
    case 'FATMAN':
      unit.dodge = applyStatShift(effect, unit.dodge, -Math.round(effect.power), 0);
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
      unit.initiative = applyStatShift(effect, unit.initiative, Math.round(effect.power || 20));
      break;
    case 'CHAMELEON':
      unit.dodge = applyStatShift(effect, unit.dodge, Math.round(effect.power || 20));
      break;
    case 'PETRIFIED':
      unit.armor = applyStatShift(effect, unit.armor, Math.round(effect.power || 15));
      break;
    case 'SLOW':
      unit.initiative = applyStatShift(
        effect,
        unit.initiative,
        -Math.round(effect.power || 15),
        1,
      );
      break;
    case 'STONEFLESH':
      unit.armor = applyStatShift(effect, unit.armor, Math.max(1, Math.round(effect.power || 20)));
      break;
    case 'DEATHSENTENCE':
      unit.armor = applyStatShift(effect, unit.armor, -Math.round(effect.power || 5), 0);
      break;
    case 'INTERFERENCE':
      unit.power = applyStatShift(effect, unit.power, -Math.round(effect.power || 5), 0);
      break;
    case 'IMPISH':
      // Класс/имя и броня выставляет способность ведьмы; здесь только якорь эффекта.
      break;
    case 'DEFEND':
      unit.defending = true;
      for (const source of DEFEND_RESIST_SOURCES) {
        changeResist(unit, source, 50);
      }
      break;
    case 'LUCKY':
      unit.luck = applyStatShift(effect, unit.luck, Math.round(effect.power || 20));
      break;
    case 'FOCUSED':
      unit.accuracy = applyStatShift(effect, unit.accuracy, Math.round(effect.power || 15));
      break;
    case 'DRUNK':
      unit.accuracy = applyStatShift(effect, unit.accuracy, -Math.round(effect.power));
      break;
    case 'INVISIBLE':
      // CUT-2026-11-09 AC-1: уклонение не растёт. applied=0 — снятие не трогает чужой бонус.
      effect.applied = 0;
      break;
    case 'WEAKNESS':
      unit.damage = applyStatShift(effect, unit.damage, -Math.round(effect.power || 5), 0);
      break;
    case 'UNLUCKY':
      unit.luck = applyStatShift(effect, unit.luck, -Math.round(effect.power || 20), 0);
      break;
    case 'GALL':
      // CUT AC-12: броня снимается только на тиках DoT, навсегда (без отката).
      break;
    case 'ROW_FORTIFY':
      unit.armor = applyStatShift(effect, unit.armor, Math.max(1, Math.round(effect.power || 1)));
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
    case 'BERSERK':
      // Вся броня уходит в атаку; снятое значение запоминаем для точного отката.
      effect.extra = unit.armor;
      unit.armor = 0;
      unit.damage = applyStatShift(effect, unit.damage, Math.round(effect.power));
      break;
    case 'IMAGINARY_HEALTH':
      unit.health = applyStatShift(effect, unit.health, Math.round(effect.power));
      break;
    case 'DEATHWARD':
      changeResist(unit, 'FINALSTRIKE', Math.round(effect.power || 100));
      break;
    case 'IMMOLATION':
    case 'ENSLAVED':
    case 'MAGIC_SHACKLES':
    case 'PAIN_REFLECT':
    case 'LIFE_FETTERS':
    case 'LIFE_THREAD':
    case 'REFLECTION':
    case 'REGENMANA':
    case 'KILLMANA':
    case 'POISONEDWEAPON':
    case 'BREAKWEAPON':
      break;
    case 'ERUPTION':
      // −5 пп Огню навсегда (стакается); откат при спадении не делаем.
      changeResist(unit, 'FIRE', -5);
      break;
    default:
      break;
  }
}

function reverseEffect(unit: BattleUnit, effect: BattleEffect, state?: BattleState): void {
  switch (effect.id) {
    case 'STRENGTH':
      unit.damage = undoStatShift(effect, unit.damage, Math.round(effect.power));
      break;
    case 'HAPPY':
      unit.morale = undoStatShift(effect, unit.morale, Math.round(effect.power));
      break;
    case 'ABSOLUTEPOWER':
      unit.power = undoStatShift(effect, unit.power, Math.round(effect.power));
      break;
    case 'FATMAN':
      unit.dodge = undoStatShift(effect, unit.dodge, -Math.round(effect.power));
      break;
    case 'GUARDED':
      break;
    case 'AIRSHIELD':
      changeResist(unit, 'ARROWS', -Math.max(1, Math.round(effect.power || 33)));
      break;
    case 'FEAR':
      break;
    case 'HASTE':
      unit.initiative = undoStatShift(effect, unit.initiative, Math.round(effect.power || 20));
      break;
    case 'CHAMELEON':
      unit.dodge = undoStatShift(effect, unit.dodge, Math.round(effect.power || 20));
      break;
    case 'PETRIFIED':
      unit.armor = undoStatShift(effect, unit.armor, Math.round(effect.power || 15));
      break;
    case 'SLOW':
      unit.initiative = undoStatShift(effect, unit.initiative, -Math.round(effect.power || 15));
      break;
    case 'STONEFLESH':
      unit.armor = undoStatShift(effect, unit.armor, Math.max(1, Math.round(effect.power || 20)));
      break;
    case 'DEATHSENTENCE':
      unit.armor = undoStatShift(effect, unit.armor, -Math.round(effect.power || 5));
      break;
    case 'INTERFERENCE':
      unit.power = undoStatShift(effect, unit.power, -Math.round(effect.power || 5));
      break;
    case 'IMPISH': {
      if (unit.polymorphSavedArmor >= 0) {
        unit.armor = Math.max(unit.polymorphSavedArmor, unit.armor);
        unit.polymorphSavedArmor = -1;
      }
      const parent = unit.transformParentCode;
      // Не сбрасываем transformParentCode, если ещё висит POLYMORPH / INFECTED.
      const keepParent = unit.effects.some(
        (item) => item.id === 'POLYMORPH' || item.id === 'INFECTED'
      );
      if (!keepParent) {
        unit.transformParentCode = null;
      }
      if (parent && state && unit.heroClassCode === 'Imp') {
        transformClassOnly(state, unit, parent);
        const snap = popResistSnapshot(unit);
        if (snap) {
          unit.resists = snap;
        }
      }
      break;
    }
    case 'DEFEND':
      unit.defending = false;
      for (const source of DEFEND_RESIST_SOURCES) {
        changeResist(unit, source, -50);
      }
      break;
    case 'POLYMORPH':
    case 'INFECTED': {
      const parent = unit.transformParentCode;
      unit.transformParentCode = null;
      if (parent && state) {
        applyCatalogStats(state, unit, parent, { resistMode: 'restore' });
      }
      break;
    }
    case 'LUCKY':
      unit.luck = undoStatShift(effect, unit.luck, Math.round(effect.power || 20));
      break;
    case 'FOCUSED':
      unit.accuracy = undoStatShift(effect, unit.accuracy, Math.round(effect.power || 15));
      break;
    case 'DRUNK':
      unit.accuracy = undoStatShift(effect, unit.accuracy, -Math.round(effect.power));
      break;
    case 'INVISIBLE':
      if (typeof effect.applied === 'number') {
        unit.dodge -= effect.applied;
      } else {
        unit.dodge = Math.max(0, unit.dodge - Math.round(effect.power || 25));
      }
      break;
    case 'WEAKNESS':
      unit.damage = undoStatShift(effect, unit.damage, -Math.round(effect.power || 5));
      break;
    case 'UNLUCKY':
      unit.luck = undoStatShift(effect, unit.luck, -Math.round(effect.power || 20));
      break;
    case 'GALL':
      // CUT AC-12: снятая броня не возвращается.
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
      unit.armor = undoStatShift(effect, unit.armor, Math.max(1, Math.round(effect.power || 1)));
      break;
    case 'ASHILLNESS':
      // Снижение постоянное на время маркера; откат не восстанавливаем (доля от текущего).
      break;
    case 'BERSERK':
      unit.damage = undoStatShift(effect, unit.damage, Math.round(effect.power));
      unit.armor += effect.extra ?? 0;
      break;
    case 'IMAGINARY_HEALTH':
      if (unit.alive) {
        unit.health = undoStatShift(effect, unit.health, Math.round(effect.power));
        if (unit.health < 1) {
          unit.health = 1;
        }
      }
      break;
    case 'DEATHWARD':
      changeResist(unit, 'FINALSTRIKE', -Math.round(effect.power || 100));
      break;
    case 'IMMOLATION':
    case 'MAGIC_SHACKLES':
    case 'PAIN_REFLECT':
    case 'LIFE_THREAD':
    case 'REFLECTION':
    case 'REGENMANA':
    case 'KILLMANA':
    case 'POISONEDWEAPON':
    case 'BREAKWEAPON':
      break;
    case 'LOVE_SHACKLES': {
      const partnerId = effect.linkId;
      if (state && partnerId) {
        const partner = state.units.find((item) => item.id === partnerId);
        const back = partner?.effects.find(
          (item) => item.id === 'LOVE_SHACKLES' && item.linkId === unit.id,
        );
        if (partner && back) {
          delEffect(partner, 'LOVE_SHACKLES', state);
        }
      }
      break;
    }
    case 'LIFE_FETTERS':
      // Снимаем связь у Воина-призрака, который держал оковы на этой цели.
      if (state) {
        for (const other of state.units) {
          if (other.fettersTargetId === unit.id) {
            other.fettersTargetId = null;
          }
        }
      }
      break;
    case 'ERUPTION':
      // Сопротивление Огню не возвращаем.
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
 * Снимает броню с учётом DESTROYARMOR; не ниже 0. Возвращает фактически снятое.
 */
export function destroyArmor(unit: BattleUnit, amount: number): number {
  if (amount <= 0 || unit.armor <= 0) {
    return 0;
  }
  const factor = consumeSrcFactor(unit, 'DESTROYARMOR');
  const loss = Math.max(0, Math.round(Math.min(amount, unit.armor) * factor));
  unit.armor = Math.max(0, unit.armor - loss);
  return loss;
}

function isDebuffId(id: EffectId): boolean {
  return (DEBUFF_EFFECT_IDS as readonly EffectId[]).includes(id);
}

/**
 * Добавляет эффект с applyOnAdd (продлевает, если уже есть).
 * Новый эффект помечается fresh — первый end-тик носителя его пропустит.
 * Дебафф на носителе с REFLECTION уходит случайному живому врагу без REFLECTION.
 */
export function grantEffect(
  unit: BattleUnit,
  id: EffectId,
  rounds: number,
  power = 0,
  opts?: { readonly casterLvl?: number },
): void {
  if (isDebuffId(id) && hasEffect(unit, 'REFLECTION')) {
    const state = currentEffectState();
    if (state) {
      // CUT-2026-11-09 AC-1: отражение не выбирает невидимого.
      const enemies = state.units.filter(
        (other) =>
          other.alive &&
          other.team !== unit.team &&
          !hasEffect(other, 'REFLECTION') &&
          !hasEffect(other, 'INVISIBLE'),
      );
      if (enemies.length > 0) {
        const target = enemies[randInt(0, enemies.length - 1)];
        if (target) {
          state.log.push(
            `Отражение: «${effectLogLabel(id)}» с ${unit.displayName} переходит на ${target.displayName}.`
          );
          grantEffect(target, id, rounds, power, opts);
          return;
        }
      }
    }
  }
  const existing = unit.effects.find((effect) => effect.id === id);
  if (existing) {
    existing.rounds += rounds;
    // CUT-2026-11-09 AC-1: повторный каст невидимости — не снимать в этом же действии.
    if (id === 'INVISIBLE') {
      existing.refreshedThisAction = true;
    }
    return;
  }
  const effect: BattleEffect = { id, rounds, power, fresh: true };
  if (opts && typeof opts.casterLvl === 'number') {
    effect.casterLvl = opts.casterLvl;
  }
  unit.effects.push(effect);
  applyEffectOnAdd(unit, effect);
}

/** Снимает невидимость после активного действия носителя. Защита и ожидание не вызывают. */
export function revealAfterAction(state: BattleState, actor: BattleUnit): void {
  const effect = actor.effects.find((item) => item.id === 'INVISIBLE');
  if (!effect) {
    return;
  }
  // CUT-2026-11-09 AC-1: обновление невидимости этим действием её не снимает.
  if (effect.refreshedThisAction) {
    effect.refreshedThisAction = undefined;
    return;
  }
  delEffect(actor, 'INVISIBLE', state);
  state.log.push(`${actor.displayName} обнаруживает себя.`);
}
