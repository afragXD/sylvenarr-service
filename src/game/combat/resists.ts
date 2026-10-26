import type { DamageSource } from './damageSources';
import { DAMAGE_SOURCE_LABELS } from './damageSources';
import type { BattleState, BattleUnit, ResistEntry, ResistMap } from './types';

const randInt = (min: number, max: number): number =>
  min + Math.floor(Math.random() * (max - min + 1));

/** Множитель шанса/эффекта по резисту MIND без траты варда. */
export function mindResistFactor(unit: BattleUnit): number {
  const entry = unit.resists.MIND;
  if (!entry) {
    return 1;
  }
  if (entry.immune) {
    return 0;
  }
  const value = entry.value;
  return value > 0 ? Math.max(0, 1 - value / 100) : 1 + Math.abs(value) / 100;
}

/**
 * Множитель Chance по источнику (порт getSRCFactor): иммун/вард → 0 и тратят заряд;
 * value% режет/усиливает. Без лога — для цепочки из нескольких SRC.
 */
export function consumeSrcFactor(unit: BattleUnit, source: DamageSource): number {
  const entry = unit.resists[source];
  if (!entry) {
    return 1;
  }
  if (entry.immune) {
    return 0;
  }
  if ((entry.wardCharges ?? 0) > 0) {
    entry.wardCharges = (entry.wardCharges ?? 1) - 1;
    if ((entry.wardCharges ?? 0) <= 0) {
      entry.wardCharges = undefined;
    }
    return 0;
  }
  const value = entry.value;
  return value > 0 ? Math.max(0, 1 - value / 100) : 1 + Math.abs(value) / 100;
}

/**
 * Chance(base, ...sources).roll — произведение множителей источников.
 */
export function rollSrcChance(
  state: BattleState,
  target: BattleUnit,
  baseChance: number,
  ...sources: DamageSource[]
): boolean {
  let factor = 1;
  for (const source of sources) {
    const next = consumeSrcFactor(target, source);
    if (next <= 0) {
      state.log.push(
        `${target.displayName}: «${DAMAGE_SOURCE_LABELS[source]}» блокирует воздействие.`
      );
      return false;
    }
    factor *= next;
  }
  const effective = Math.round(baseChance * factor);
  return randInt(1, 100) <= effective;
}

/**
 * Бросок шанса с источником Разум: иммун/вард MIND блокируют, value режет шанс.
 * @returns true при успехе.
 */
export function rollMindChance(
  state: BattleState,
  target: BattleUnit,
  baseChance: number
): boolean {
  return rollSrcChance(state, target, baseChance, 'MIND');
}

export type ResistApplyResult = {
  /** Множитель урона (0 = полный блок). */
  multiplier: number;
  /** Удар поглощён вардом или иммунитетом. */
  blocked: boolean;
  /** RU-причина блока для лога. */
  blockReason: string | null;
};

/**
 * Глубокая копия карты резистов.
 */
export function cloneResists(source: ResistMap): ResistMap {
  const next: ResistMap = {};
  for (const [key, entry] of Object.entries(source) as Array<[DamageSource, ResistEntry]>) {
    next[key] = {
      value: entry.value,
      immune: entry.immune,
      wardCharges: entry.wardCharges,
    };
  }
  return next;
}

export function getOrCreateResist(unit: BattleUnit, source: DamageSource): ResistEntry {
  const existing = unit.resists[source];
  if (existing) {
    return existing;
  }
  const created: ResistEntry = { value: 0 };
  unit.resists[source] = created;
  return created;
}

export function changeResist(unit: BattleUnit, source: DamageSource, delta: number): void {
  const entry = getOrCreateResist(unit, source);
  entry.value += delta;
}

export function setWard(unit: BattleUnit, source: DamageSource, charges = 1): void {
  const entry = getOrCreateResist(unit, source);
  entry.immune = false;
  entry.wardCharges = (entry.wardCharges ?? 0) + charges;
}

/** Выставляет число зарядов варда без накопления. */
export function setWardExact(unit: BattleUnit, source: DamageSource, charges = 1): void {
  const entry = getOrCreateResist(unit, source);
  entry.immune = false;
  entry.wardCharges = charges;
}

export function setImmunity(unit: BattleUnit, source: DamageSource): void {
  const entry = getOrCreateResist(unit, source);
  entry.immune = true;
  entry.wardCharges = undefined;
}

/**
 * Множитель урона по источнику. Ward/Immunity → 0; ward тратит заряд.
 */
export function applyResistMultiplier(
  unit: BattleUnit,
  source: DamageSource
): ResistApplyResult {
  const entry = unit.resists[source];
  if (!entry) {
    return { multiplier: 1, blocked: false, blockReason: null };
  }
  if (entry.immune) {
    return {
      multiplier: 0,
      blocked: true,
      blockReason: `${unit.displayName} иммунен к «${DAMAGE_SOURCE_LABELS[source]}».`,
    };
  }
  if ((entry.wardCharges ?? 0) > 0) {
    entry.wardCharges = (entry.wardCharges ?? 1) - 1;
    const dissipated = entry.wardCharges <= 0;
    if (dissipated) {
      entry.wardCharges = undefined;
    }
    return {
      multiplier: 0,
      blocked: true,
      blockReason: `${unit.displayName}: вард «${DAMAGE_SOURCE_LABELS[source]}» поглощает удар.${dissipated ? ' Вард рассеивается.' : ''}`,
    };
  }
  const value = entry.value;
  const multiplier =
    value > 0 ? Math.max(0, 1 - value / 100) : 1 + Math.abs(value) / 100;
  return { multiplier, blocked: false, blockReason: null };
}

/** Ненулевые / ward / immune для API. */
export function summarizeResists(unit: BattleUnit): Array<{
  source: DamageSource;
  label: string;
  value: number;
  wardCharges: number | null;
  immune: boolean;
}> {
  const rows: Array<{
    source: DamageSource;
    label: string;
    value: number;
    wardCharges: number | null;
    immune: boolean;
  }> = [];
  for (const [source, entry] of Object.entries(unit.resists) as Array<
    [DamageSource, ResistEntry]
  >) {
    const ward = entry.wardCharges ?? 0;
    if (entry.value === 0 && ward <= 0 && !entry.immune) {
      continue;
    }
    rows.push({
      source,
      label: DAMAGE_SOURCE_LABELS[source],
      value: entry.value,
      wardCharges: ward > 0 ? ward : null,
      immune: Boolean(entry.immune),
    });
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
}
