import { clearDebuffs, grantEffect, healUnit, trySpendMana } from '../effects';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { alliesOf, ownRowAllies } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

function abilityMeta(
  state: BattleState,
  actor: BattleUnit,
  slot: AbilitySlot
): AbilityInfo {
  switch (slot) {
    case 1: {
      const allies = alliesOf(state, actor);
      return {
        slot: 1,
        label: 'Бодрящий эликсир',
        needsTarget: true,
        disabledReason: allies.length === 0 ? 'Нет союзников' : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 2:
      return {
        slot: 2,
        label: 'Укрепляющие пары',
        needsTarget: false,
        disabledReason: actor.mana < 1 ? 'Нужно 1 МР' : null,
        legalTargetIds: [],
      };
    case 3: {
      const allies = alliesOf(state, actor);
      return {
        slot: 3,
        label: 'Компот гномов',
        needsTarget: true,
        disabledReason: allies.length === 0 ? 'Нет союзников' : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 4:
      return {
        slot: 4,
        label: 'Зелье поддержки',
        needsTarget: false,
        disabledReason: null,
        legalTargetIds: [],
      };
    case 5:
      return {
        slot: 5,
        label: 'Базовые действия',
        needsTarget: false,
        disabledReason: 'Используйте защиту / ожидание',
        legalTargetIds: [],
      };
  }
}

/**
 * Herbalist: баффы, cleanse, заглушка крафта.
 */
export const herbalistAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  apply(state, actor, input): AbilityOutcome {
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Нужен союзник' };
      }
      const atk = Math.max(1, Math.round(target.damage * (0.5 + 0.05 * actor.lvl)));
      grantEffect(target, 'STRENGTH', 1 + Math.floor(actor.lvl / 6), atk);
      state.log.push(`${actor.displayName} усиливает ${target.displayName}.`);
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const err = trySpendMana(actor, 1);
      if (err) {
        return { status: 'reject', message: err };
      }
      for (const ally of ownRowAllies(state, actor)) {
        const atk = Math.max(1, Math.round(ally.damage * 0.2));
        grantEffect(ally, 'STRENGTH', 2, atk);
        grantEffect(ally, 'FOCUSED', 2, 20 + actor.lvl);
      }
      state.log.push(`${actor.displayName}: укрепляющие пары на ряд.`);
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Нужен союзник' };
      }
      clearDebuffs(target);
      state.log.push(`${actor.displayName} снимает дебаффы с ${target.displayName}.`);
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const healed = healUnit(actor, 5 + actor.lvl);
      state.log.push(
        `${actor.displayName} варит зелье поддержки (+${healed} ОЗ; инвентарь — позже).`
      );
      return { status: 'done' };
    }

    return { status: 'reject', message: 'Используйте защиту / ожидание' };
  },
};
