import type { DamageSource } from './damageSources';
import { DAMAGE_SOURCE_LABELS } from './damageSources';
import type { BattleUnit, ResistEntry, ResistMap } from './types';

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
    if (entry.wardCharges <= 0) {
      entry.wardCharges = undefined;
    }
    return {
      multiplier: 0,
      blocked: true,
      blockReason: `${unit.displayName}: вард «${DAMAGE_SOURCE_LABELS[source]}» поглощает удар.`,
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
