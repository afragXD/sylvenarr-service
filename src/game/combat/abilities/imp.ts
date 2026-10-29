import { dealDamage, markDeadIfNeeded, formatLastLogDamage } from '../damage';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { meleeOrAll } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

function abilityMeta(
  state: BattleState,
  actor: BattleUnit,
  slot: AbilitySlot
): AbilityInfo {
  if (slot !== 1) {
    return {
      slot,
      label: 'Заблокировано',
      needsTarget: false,
      disabledReason: 'В форме беса недоступно',
      legalTargetIds: [],
    };
  }
  const targets = meleeOrAll(state, actor, false);
  return {
    slot: 1,
    label: 'Месть беса',
    needsTarget: true,
    attackKind: 'melee',
    disabledReason: targets.length === 0 ? 'Нет целей' : null,
    legalTargetIds: targets.map((unit) => unit.id),
  };
}

/**
 * Imp (полиморф ведьмы): только ближний удар; слоты 2–5 заблокированы.
 */
export const impAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return [abilityMeta(state, actor, 1)];
  },

  apply(state, actor, input): AbilityOutcome {
    if (input.slot !== 1) {
      return { status: 'reject', message: 'В форме беса вы не способны на это' };
    }
    const meta = abilityMeta(state, actor, 1);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }
    const target = meleeOrAll(state, actor, false).find(
      (unit) => unit.id === input.targetId
    );
    if (!target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }
    const damage = dealDamage(
      actor,
      target,
      { kind: 'melee', damageMult: 1, armorIgnore: 0, source: 'WEAPON' },
      state
    );
    if (damage === 0) {
      state.log.push(`${actor.displayName}: месть беса — промах.`);
    } else {
      state.log.push(
        `${actor.displayName} мстит ${target.displayName} ${formatLastLogDamage(damage)}.`
      );
      markDeadIfNeeded(state, target);
    }
    return { status: 'done' };
  },
};
