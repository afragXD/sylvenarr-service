import type { BattleUnit } from '../../combat/types';
import type { ItemUsageContext, ItemUsageOutcome } from './types';

export function log(ctx: ItemUsageContext, message: string): void {
  ctx.state.log.push(message);
}

export function done(opts?: { keepTurn?: boolean; consume?: boolean }): ItemUsageOutcome {
  return { status: 'done', ...opts };
}

export function reject(message: string): ItemUsageOutcome {
  return { status: 'reject', message };
}

/** Уровень в формулах предметов — invoker.lvl (CUT). */
export function invokerLvl(ctx: ItemUsageContext): number {
  return ctx.invoker.lvl;
}

export function addPerk(unit: BattleUnit, perkId: string): void {
  unit.perks = unit.perks ?? [];
  if (!unit.perks.includes(perkId)) {
    unit.perks.push(perkId);
  }
}
