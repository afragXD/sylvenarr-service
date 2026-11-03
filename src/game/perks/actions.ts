import { levelUpUnit } from '../combat/level';
import type { BattleState } from '../combat/types';
import { addPerkToUnit, applyPerkInstant, unitHasPerk } from './apply';
import { allPerkOffersDone } from './offers';

export type PerkActionResult = { ok: true } | { ok: false; message: string };

/**
 * Выбор перка в фазе perks. playerId должен владеть unitId.
 */
export function applyPerkPick(
  state: BattleState,
  input: { readonly playerId: string; readonly unitId: string; readonly perkId: string }
): PerkActionResult {
  if (state.phase !== 'perks') {
    return { ok: false, message: 'Сейчас не фаза выбора перков' };
  }
  const offers = state.perkOffers;
  if (!offers) {
    return { ok: false, message: 'Нет предложений перков' };
  }
  const offer = offers.find((o) => o.unitId === input.unitId);
  if (!offer) {
    return { ok: false, message: 'Нет предложения для этого юнита' };
  }
  if (offer.playerId !== input.playerId) {
    return { ok: false, message: 'Это не ваш юнит' };
  }
  if (offer.done) {
    return { ok: false, message: 'Перк уже выбран' };
  }
  const option = offer.options.find((o) => o.id === input.perkId);
  if (!option) {
    return { ok: false, message: 'Такого варианта нет' };
  }
  if (
    option.learned ||
    unitHasPerk(state.units.find((u) => u.id === input.unitId)!, input.perkId)
  ) {
    return { ok: false, message: 'Перк уже изучен' };
  }
  const unit = state.units.find((u) => u.id === input.unitId);
  if (!unit || !unit.alive) {
    return { ok: false, message: 'Юнит недоступен' };
  }
  addPerkToUnit(unit, input.perkId);
  applyPerkInstant(state, unit, input.perkId);
  unit.lastPerkHiddenLvl = unit.hiddenLvl;
  offer.done = true;
  return { ok: true };
}

/** Пропуск предложения = +1 уровень. */
export function applyPerkSkip(
  state: BattleState,
  input: { readonly playerId: string; readonly unitId: string }
): PerkActionResult {
  if (state.phase !== 'perks') {
    return { ok: false, message: 'Сейчас не фаза выбора перков' };
  }
  const offers = state.perkOffers;
  if (!offers) {
    return { ok: false, message: 'Нет предложений перков' };
  }
  const offer = offers.find((o) => o.unitId === input.unitId);
  if (!offer) {
    return { ok: false, message: 'Нет предложения для этого юнита' };
  }
  if (offer.playerId !== input.playerId) {
    return { ok: false, message: 'Это не ваш юнит' };
  }
  if (offer.done) {
    return { ok: false, message: 'Перк уже выбран' };
  }
  const unit = state.units.find((u) => u.id === input.unitId);
  if (!unit || !unit.alive) {
    return { ok: false, message: 'Юнит недоступен' };
  }
  levelUpUnit(unit, 1, state);
  unit.lastPerkHiddenLvl = unit.hiddenLvl;
  offer.done = true;
  state.log.push(`${unit.displayName} пропускает перк (+1 уровень).`);
  return { ok: true };
}

export function perkPhaseFullyResolved(state: BattleState): boolean {
  return allPerkOffersDone(state);
}
