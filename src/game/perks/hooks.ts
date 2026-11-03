import { randInt } from '../combat/damage';
import type { BattleState, BattleUnit } from '../combat/types';
import { unitHasPerk } from './apply';

function chancePercent(value: number): boolean {
  return randInt(1, 100) <= value;
}

/**
 * LOWHP_EXTRATURN после обычного хода.
 * @returns true — сохранить ход (не пушить doneIds / не advance).
 */
export function tryLowHpExtraTurn(state: BattleState, actor: BattleUnit): boolean {
  if (actor.lowHpExtraTurn) {
    actor.lowHpExtraTurn = false;
    return false;
  }
  if (!unitHasPerk(actor, 'LOWHP_EXTRATURN') || !actor.alive || actor.maxHp <= 0) {
    return false;
  }
  const chance = Math.round((1 - actor.health / actor.maxHp) * 80);
  if (chance <= 0 || !chancePercent(chance)) {
    return false;
  }
  actor.lowHpExtraTurn = true;
  state.log.push(`${actor.displayName}: предсмертный хрип — ещё один ход!`);
  return true;
}

/** BONUS_MOVEMENT после успешного move. */
export function tryBonusMovementKeepTurn(state: BattleState, actor: BattleUnit): boolean {
  if (!unitHasPerk(actor, 'BONUS_MOVEMENT')) {
    return false;
  }
  if (!chancePercent(65)) {
    return false;
  }
  state.log.push(`${actor.displayName}: крылья — ход сохранён.`);
  return true;
}
