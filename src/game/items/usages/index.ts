import { registerArtifactItemUsages } from './artifacts';
import { registerMiscItemUsages } from './misc';
import { registerOrbItemUsages } from './orbs';
import { registerRelicItemUsages } from './relics';
import { registerScrollItemUsages } from './scrolls';
import type { ItemUsageHandler, ItemUsageOutcome } from './types';

export type { ItemUsageContext, ItemUsageHandler, ItemUsageOutcome } from './types';

/** Кейсы: LUDOMANIA не тратит ход. */
export const CASE_ITEM_CODES: ReadonlySet<number> = new Set([
  167, 447, 647, 747, 547, 587, 597, 567,
]);

const handlers = new Map<number, ItemUsageHandler>();

function notImplemented(_ctx: Parameters<ItemUsageHandler>[0]): ItemUsageOutcome {
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

function registerBuiltinItemUsages(): void {
  registerMiscItemUsages(registerItemUsage);
  registerRelicItemUsages(registerItemUsage);
  registerArtifactItemUsages(registerItemUsage);
  registerOrbItemUsages(registerItemUsage);
  registerScrollItemUsages(registerItemUsage);
}

/** Сброс реестра и повторная установка встроенных обработчиков (тесты). */
export function clearItemUsagesForTests(): void {
  handlers.clear();
  registerBuiltinItemUsages();
}

registerBuiltinItemUsages();
