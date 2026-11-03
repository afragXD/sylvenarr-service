import type { BattleState } from '../types';

/**
 * Модульный контекст текущего боя для эффектов (как lastDealDamageResult).
 * Безопасно, потому что действия обрабатываются синхронно.
 */
let currentState: BattleState | null = null;

export function setEffectState(state: BattleState): void {
  currentState = state;
}

export function currentEffectState(): BattleState | null {
  return currentState;
}
