import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';

export type AbilityOutcome =
  | { status: 'reject'; message: string }
  | { status: 'pending' }
  | { status: 'done'; keepTurn?: boolean };

export type AbilityHandler = {
  listAbilities: (state: BattleState, actor: BattleUnit) => AbilityInfo[];
  apply: (
    state: BattleState,
    actor: BattleUnit,
    input: {
      readonly slot: AbilitySlot;
      readonly targetId?: string;
      readonly choice?: string;
    }
  ) => AbilityOutcome;
  preChoice?: (state: BattleState, actor: BattleUnit) => void;
};
