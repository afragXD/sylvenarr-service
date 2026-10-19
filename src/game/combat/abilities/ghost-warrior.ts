import { dealDamage, markDeadIfNeeded, randInt } from '../damage';
import { grantEffect, healUnit, tryStun } from '../effects';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { meleeOrAll, ownRowAllies } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

function hungerMult(state: BattleState, actor: BattleUnit): number {
  const graves = state.graveyard.filter((entry) => entry.team === actor.team).length;
  return Math.round((1 + 0.15 * graves) * 100) / 100;
}

function abilityMeta(
  state: BattleState,
  actor: BattleUnit,
  slot: AbilitySlot
): AbilityInfo {
  switch (slot) {
    case 1: {
      const targets = meleeOrAll(state, actor, false);
      const hunger = hungerMult(state, actor);
      return {
        slot: 1,
        label: `Призрачная катана ×${hunger}`,
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2:
      return {
        slot: 2,
        label: 'Сэппуку',
        needsTarget: false,
        disabledReason: null,
        legalTargetIds: [],
      };
    case 3:
      return {
        slot: 3,
        label: 'Горн мертвецов',
        needsTarget: false,
        disabledReason: null,
        legalTargetIds: [],
      };
    case 4:
      return {
        slot: 4,
        label: `Примирение (${actor.ultaCharges})`,
        needsTarget: false,
        disabledReason: actor.ultaCharges <= 0 ? 'Нет зарядов' : null,
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
 * GhostWarrior: hunger katana, vamp, row strength, self heal.
 */
export const ghostWarriorAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  apply(state, actor, input): AbilityOutcome {
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      const target = meleeOrAll(state, actor, false).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const mult = hungerMult(state, actor);
      const damage = dealDamage(
        actor,
        target,
        { damageMult: mult, armorIgnore: 0, source: 'WEAPON' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: катана — промах.`);
      } else {
        state.log.push(
          `${actor.displayName} рубит катаной ${target.displayName} (${damage}, ×${mult}).`
        );
        if (randInt(1, 100) <= 65 + actor.lvl && tryStun(state, target, 1)) {
          state.log.push(`${target.displayName} парализован.`);
        }
        markDeadIfNeeded(state, target);
      }
      return { status: 'done' };
    }

    if (input.slot === 2) {
      grantEffect(actor, 'VAMPWEAPON', 2 + Math.floor(actor.lvl / 5), 0.5 + 0.08 * actor.lvl);
      state.log.push(`${actor.displayName}: катана вампиризирует удары.`);
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const power = 3 + Math.floor(actor.lvl / 4);
      for (const ally of ownRowAllies(state, actor)) {
        grantEffect(ally, 'STRENGTH', 2, power);
      }
      state.log.push(`${actor.displayName}: горн мертвецов усиливает ряд.`);
      return { status: 'done' };
    }

    if (input.slot === 4) {
      actor.ultaCharges -= 1;
      actor.maxHp = Math.round(actor.maxHp * 1.25);
      const healed = healUnit(actor, Math.floor(actor.maxHp / 4));
      state.log.push(`${actor.displayName}: примирение (+${healed} ОЗ, +maxHp).`);
      return { status: 'done' };
    }

    return { status: 'reject', message: 'Используйте защиту / ожидание' };
  },
};
