import { createSummon } from '../../combat/abilities/summon';
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

/** Живые юниты того же ряда, что и unit. */
export function unitsOnRow(ctx: ItemUsageContext, unit: BattleUnit): BattleUnit[] {
  return ctx.state.units.filter(
    (other) => other.alive && other.team === unit.team && other.row === unit.row
  );
}

/** Живые юниты отряда. */
export function livingTeam(ctx: ItemUsageContext, team: 0 | 1): BattleUnit[] {
  return ctx.state.units.filter((unit) => unit.alive && unit.team === team);
}

/**
 * Призыв через createSummon от invoker (для талисманов/посохов/технологий).
 * Неудача — отказ без расхода предмета.
 */
export function tryItemSummon(
  ctx: ItemUsageContext,
  heroCode: string,
  message: string,
  after?: (summon: BattleUnit) => void
): ItemUsageOutcome {
  const summon = createSummon(ctx.state, {
    summoner: ctx.invoker,
    heroCode,
    row: ctx.invoker.row,
  });
  if (!summon) {
    return reject('Призыв не удался.');
  }
  after?.(summon);
  if (message) {
    log(ctx, message);
  }
  return done();
}
