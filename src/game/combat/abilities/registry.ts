import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { archlichAbilities } from './archlich';
import { knightAbilities } from './knight';
import { orcKingAbilities } from './orc-king';
import type { AbilityHandler, AbilityOutcome } from './types';

const PILOT_HANDLERS: Record<string, AbilityHandler> = {
  Knight: knightAbilities,
  OrcKing: orcKingAbilities,
  Archlich: archlichAbilities,
};

/**
 * Класс с полным набором слотов 1–5.
 */
export function isPilotClass(code: string): boolean {
  return code in PILOT_HANDLERS;
}

/**
 * Список способностей пилота (или пусто).
 */
export function listPilotAbilities(state: BattleState, actor: BattleUnit): AbilityInfo[] {
  const handler = PILOT_HANDLERS[actor.heroClassCode];
  if (!handler) {
    return [];
  }
  return handler.listAbilities(state, actor);
}

/**
 * preChoice пилота в начале хода.
 */
export function runPreChoice(state: BattleState, actor: BattleUnit): void {
  const handler = PILOT_HANDLERS[actor.heroClassCode];
  handler?.preChoice?.(state, actor);
}

/**
 * Применяет способность пилота. reject = ход не тратится.
 */
export function applyAbility(
  state: BattleState,
  actor: BattleUnit,
  input: {
    readonly slot: AbilitySlot;
    readonly targetId?: string;
    readonly choice?: string;
  }
): AbilityOutcome {
  const handler = PILOT_HANDLERS[actor.heroClassCode];
  if (!handler) {
    return { status: 'reject', message: 'У этого героя нет слотов способностей' };
  }
  if (state.pendingPrompt && state.pendingPrompt.unitId !== actor.id) {
    return { status: 'reject', message: 'Ожидается выбор другого юнита' };
  }
  if (state.pendingPrompt && state.pendingPrompt.unitId === actor.id) {
    return handler.apply(state, actor, {
      slot: state.pendingPrompt.slot,
      targetId: input.targetId,
      choice: input.choice,
    });
  }
  return handler.apply(state, actor, input);
}

/**
 * Инициализация runtime-флагов пилота.
 */
export function initPilotFlags(unit: BattleUnit): void {
  switch (unit.heroClassCode) {
    case 'OrcKing':
      unit.maxSummons = 1;
      unit.authority = 2 + Math.floor(Math.random() * 2);
      break;
    case 'Archlich':
      unit.maxSummons = 2;
      break;
    default:
      break;
  }
}
