import type { BattleState, BattleUnit, PerkOffer, PerkOfferOption } from '../combat/types';
import { economyOn } from '../economy';
import { PERK_CATALOG, type PerkCatalogEntry } from './catalog';

function unitPerks(unit: BattleUnit): readonly string[] {
  return unit.perks ?? [];
}

function fairFrequencyOf(state: BattleState): number {
  return state.rules.fairFrequency ?? 5;
}

/** Живой герой (не саммон) — кандидат на предложение в день перков. */
export function isEligibleForPerkOffer(unit: BattleUnit): boolean {
  return unit.alive && !unit.isSummon;
}

/**
 * День перков: за раунд до ярмарки.
 * После завершённого раунда `s = stage − 1`: `s % fairFrequency === fairFrequency − 1`
 * (при N=5 → раунды 4, 9, 14…).
 */
export function shouldBeginPerks(state: BattleState): boolean {
  if (!economyOn(state)) {
    return false;
  }
  const freq = fairFrequencyOf(state);
  if (freq <= 0) {
    return false;
  }
  const s = state.stage - 1;
  if (s <= 0) {
    return false;
  }
  return s % freq === freq - 1;
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
 * Начать фазу перков в «день перков», если есть eligible юниты.
 * @returns true — фаза perks активна (active/turn сброшены).
 */
export function beginPerkPhase(state: BattleState): boolean {
  if (!shouldBeginPerks(state)) {
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
