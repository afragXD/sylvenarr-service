import type { BattleState, BattleUnit } from '../../combat/types';

/** Исход обработчика предмета (порт return codes usages.py). */
export type ItemUsageOutcome =
  | { status: 'reject'; message: string }
  | { status: 'pending' }
  | {
      status: 'done';
      /** Сохранить ход (по умолчанию false). */
      keepTurn?: boolean;
      /** Расход экземпляра (по умолчанию true). */
      consume?: boolean;
    };

export type ItemUsageContext = {
  readonly state: BattleState;
  readonly invoker: BattleUnit;
  readonly target: BattleUnit;
  readonly itemCode: number;
  readonly choice?: string;
};

export type ItemUsageHandler = (ctx: ItemUsageContext) => ItemUsageOutcome;
