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

/** Кейсы: LUDOMANIA не тратит ход. */
export const CASE_ITEM_CODES: ReadonlySet<number> = new Set([
  167, 447, 647, 747, 547, 587, 597, 567,
]);

const handlers = new Map<number, ItemUsageHandler>();

function notImplemented(_ctx: ItemUsageContext): ItemUsageOutcome {
  return { status: 'reject', message: 'не реализовано' };
}

/** Обработчик кода или заглушка «не реализовано». */
export function getItemUsage(code: number): ItemUsageHandler {
  return handlers.get(code) ?? notImplemented;
}

/** Регистрация эффекта предмета (T6–T9). */
export function registerItemUsage(code: number, handler: ItemUsageHandler): void {
  handlers.set(code, handler);
}

/** Сброс реестра (тесты). */
export function clearItemUsagesForTests(): void {
  handlers.clear();
}
