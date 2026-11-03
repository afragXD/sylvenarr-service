import { chancePercent } from '../combat/morale';
import { isDemonClass, isUndeadClass } from '../combat/races';
import type { BattleState, BattleUnit } from '../combat/types';
import { economyOn } from '../economy';
import { getPerk, ITEM_PERK_BY_CATEGORY } from '../perks/catalog';
import { getItem, type ItemTarget } from './catalog';
import { itemCount, removeItem } from './inventory';
import { CASE_ITEM_CODES, getItemUsage, type ItemUsageOutcome } from './usages';

export type ApplyItemResult =
  | { ok: true; keepTurn: boolean; pending: boolean }
  | { ok: false; message: string };

function unitPerks(unit: BattleUnit): readonly string[] {
  return unit.perks ?? [];
}

export function unitHasPerk(unit: BattleUnit, perkId: string): boolean {
  return unitPerks(unit).includes(perkId);
}

function isValidTarget(
  _state: BattleState,
  invoker: BattleUnit,
  target: BattleUnit,
  group: ItemTarget
): boolean {
  if (!target.alive) {
    return false;
  }
  switch (group) {
    case 'self':
      return target.id === invoker.id;
    case 'ally':
      return target.team === invoker.team;
    case 'allySummon':
      return target.team === invoker.team && target.isSummon;
    case 'enemy':
      return target.team !== invoker.team;
    case 'enemySummon':
      return (
        target.team !== invoker.team &&
        target.isSummon &&
        (isUndeadClass(target.heroClassCode) || isDemonClass(target.heroClassCode))
      );
    case 'sellOnly':
      return false;
    default:
      return false;
  }
}

function resolveTarget(
  state: BattleState,
  invoker: BattleUnit,
  group: ItemTarget,
  targetId: string | undefined
): BattleUnit | { error: string } {
  if (group === 'sellOnly') {
    return { error: 'Этот предмет только для продажи' };
  }
  if (group === 'self') {
    if (targetId && targetId !== invoker.id) {
      return { error: 'Цель недоступна' };
    }
    return invoker;
  }
  if (!targetId) {
    return { error: 'Нужна цель' };
  }
  const target = state.units.find((unit) => unit.id === targetId);
  if (!target || !isValidTarget(state, invoker, target, group)) {
    return { error: 'Цель недоступна' };
  }
  return target;
}

/**
 * Применение предмета из инвентаря отряда.
 * При pendingPrompt.source === 'item' передаётся choice; itemCode берётся из промпта снаружи.
 */
export function applyItemAction(
  state: BattleState,
  invoker: BattleUnit,
  input: {
    readonly itemCode: number;
    readonly targetId?: string;
    readonly choice?: string;
    /** Повторный вызов после pending — не проверять наличие/перк заново до handler. */
    readonly continuingPrompt?: boolean;
  }
): ApplyItemResult {
  if (!economyOn(state)) {
    return { ok: false, message: 'Ярмарка, перки и предметы выключены' };
  }

  const item = getItem(input.itemCode);
  if (!item) {
    return { ok: false, message: 'Неизвестный предмет' };
  }

  if (item.sellOnly || item.target === 'sellOnly') {
    return { ok: false, message: 'Этот предмет только для продажи' };
  }

  if (!input.continuingPrompt) {
    if (itemCount(state, invoker.team, item.code) < 1) {
      return { ok: false, message: 'Предмета нет в инвентаре' };
    }
    const needed = ITEM_PERK_BY_CATEGORY.get(item.category);
    if (!needed || !unitHasPerk(invoker, needed.id)) {
      const name = needed?.name ?? getPerk(`cat-${item.category}`)?.name ?? 'неизвестный';
      return { ok: false, message: `Нужен навык: ${name}` };
    }
  }

  const targetOrErr = resolveTarget(state, invoker, item.target, input.targetId);
  if ('error' in targetOrErr) {
    return { ok: false, message: targetOrErr.error };
  }
  const target = targetOrErr;

  const outcome: ItemUsageOutcome = getItemUsage(item.code)({
    state,
    invoker,
    target,
    itemCode: item.code,
    choice: input.choice,
  });

  if (outcome.status === 'reject') {
    return { ok: false, message: outcome.message };
  }

  if (outcome.status === 'pending') {
    return { ok: true, keepTurn: true, pending: true };
  }

  const consume = outcome.consume !== false;
  if (consume && !removeItem(state, invoker.team, item.code, 1)) {
    return { ok: false, message: 'Предмета нет в инвентаре' };
  }

  let keepTurn = outcome.keepTurn === true;
  if (!keepTurn && CASE_ITEM_CODES.has(item.code) && unitHasPerk(invoker, 'LUDOMANIA')) {
    keepTurn = true;
  } else if (!keepTurn && unitHasPerk(invoker, 'DOUBLE_USING_INVENTORY') && chancePercent(50)) {
    state.log.push('Перк на быструю упаковку позволяет сделать еще один ход!');
    keepTurn = true;
  }

  return { ok: true, keepTurn, pending: false };
}
