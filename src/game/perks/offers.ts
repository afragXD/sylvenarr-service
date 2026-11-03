import type { BattleState, BattleUnit, PerkOffer, PerkOfferOption } from '../combat/types';
import { economyOn } from '../economy';
import { PERK_CATALOG, type PerkCatalogEntry } from './catalog';

function unitPerks(unit: BattleUnit): readonly string[] {
  return unit.perks ?? [];
}

function developOf(unit: BattleUnit): number {
  return unit.develop ?? 6;
}

/** Юнит имеет право на предложение перка в этом стыке. */
export function isEligibleForPerkOffer(unit: BattleUnit): boolean {
  if (!unit.alive || unit.isSummon) {
    return false;
  }
  const develop = developOf(unit);
  if (develop <= 0 || unit.hiddenLvl % develop !== 0) {
    return false;
  }
  return unit.hiddenLvl !== (unit.lastPerkHiddenLvl ?? 0);
}

function sampleDistinct(
  pool: ReadonlyArray<PerkCatalogEntry>,
  count: number,
  learned: ReadonlySet<string>
): PerkCatalogEntry[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const picked: PerkCatalogEntry[] = [];
  // Сначала неизученные, затем добиваем изученными (чтобы всегда 4/2).
  for (const preferUnlearned of [true, false]) {
    for (const perk of shuffled) {
      if (picked.length >= count) {
        break;
      }
      if (picked.some((p) => p.id === perk.id)) {
        continue;
      }
      const isLearned = learned.has(perk.id);
      if (preferUnlearned && isLearned) {
        continue;
      }
      picked.push(perk);
    }
  }
  return picked;
}

function toOption(perk: PerkCatalogEntry, learned: ReadonlySet<string>): PerkOfferOption {
  return {
    id: perk.id,
    name: perk.name,
    description: perk.description,
    kind: perk.kind,
    learned: learned.has(perk.id),
  };
}

/** Собрать предложение: 4 item + 2 other. */
export function buildPerkOfferForUnit(unit: BattleUnit): PerkOffer {
  const learned = new Set(unitPerks(unit));
  const items = sampleDistinct(
    PERK_CATALOG.filter((p) => p.kind === 'item'),
    4,
    learned
  );
  const others = sampleDistinct(
    PERK_CATALOG.filter((p) => p.kind === 'other'),
    2,
    learned
  );
  const options = [...items, ...others].map((p) => toOption(p, learned));
  return {
    unitId: unit.id,
    playerId: unit.playerId,
    options,
    done: false,
  };
}

/**
 * Начать фазу перков, если есть eligible юниты.
 * @returns true — фаза perks активна (active/turn сброшены).
 */
export function beginPerkPhase(state: BattleState): boolean {
  if (!economyOn(state)) {
    return false;
  }
  const offers = state.units.filter(isEligibleForPerkOffer).map(buildPerkOfferForUnit);
  if (offers.length === 0) {
    state.perkOffers = null;
    return false;
  }
  state.phase = 'perks';
  state.perkOffers = offers;
  state.activeUnitId = null;
  state.turnPlayerId = null;
  state.pendingPrompt = null;
  state.log.push('Выбор перков.');
  return true;
}

export function allPerkOffersDone(state: BattleState): boolean {
  const offers = state.perkOffers;
  if (!offers || offers.length === 0) {
    return true;
  }
  return offers.every((o) => o.done);
}
