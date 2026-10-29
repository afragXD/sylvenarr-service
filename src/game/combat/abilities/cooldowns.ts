import type { AbilitySlot, BattleUnit } from '../types';

/** Старые поля кулдаунов отдельных классов. */
const LEGACY_CD_FIELDS = [
  'soulShatterCd',
  'momentPowerCd',
  'deathNoteCd',
  'mindCloudCd',
  'ectoplasmCd',
  'tortureLightningCd',
  'telekinesisCd',
  'crystalCharmsCd',
  'impPolymorphCd',
  'degradationCd',
  'darkRitualCd',
  'darkVeilCd',
] as const satisfies ReadonlyArray<keyof BattleUnit>;

/** Остаток кулдауна слота в раундах. */
export function slotCd(unit: BattleUnit, slot: AbilitySlot): number {
  return unit.abilityCds?.[slot] ?? 0;
}

export function setSlotCd(unit: BattleUnit, slot: AbilitySlot, rounds: number): void {
  unit.abilityCds = { ...unit.abilityCds, [slot]: rounds };
}

/** Тик кулдаунов слотов в начале хода (preChoice). */
export function tickSlotCds(unit: BattleUnit): void {
  if (!unit.abilityCds) {
    return;
  }
  for (const key of Object.keys(unit.abilityCds)) {
    const slot = Number(key) as AbilitySlot;
    const left = unit.abilityCds[slot] ?? 0;
    unit.abilityCds[slot] = Math.max(0, left - 1);
  }
}

/** Подпись блокировки по кулдауну или null. */
export function cdReason(unit: BattleUnit, slot: AbilitySlot): string | null {
  const left = slotCd(unit, slot);
  return left > 0 ? `Кулдаун ${left} р.` : null;
}

/** Сбрасывает все кулдауны юнита (Angel «Минута славы»). */
export function resetCooldowns(unit: BattleUnit): void {
  unit.abilityCds = {};
  for (const field of LEGACY_CD_FIELDS) {
    unit[field] = 0;
  }
}
