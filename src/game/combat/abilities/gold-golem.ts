import { dealDamage, markDeadIfNeeded, randInt } from '../damage';
import { grantEffect, tryStun } from '../effects';
import { setWard } from '../resists';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { alliesOf, enemiesOf, meleeOrAll } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

function abilityMeta(
  state: BattleState,
  actor: BattleUnit,
  slot: AbilitySlot
): AbilityInfo {
  switch (slot) {
    case 1: {
      const targets = meleeOrAll(state, actor, false);
      return {
        slot: 1,
        label: 'Апперкот машины',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 2,
        label: 'Загадки во тьме',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3: {
      const allies = alliesOf(state, actor);
      return {
        slot: 3,
        label: 'Блестящее покрытие',
        needsTarget: true,
        disabledReason: allies.length === 0 ? 'Нет союзников' : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 4: {
      const allies = alliesOf(state, actor).filter((unit) => unit.id !== actor.id);
      return {
        slot: 4,
        label: 'Резонанс силы',
        needsTarget: false,
        disabledReason: allies.length === 0 ? 'Нет союзников' : null,
        legalTargetIds: [],
      };
    }
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
 * GoldGolem: stun punch, mind riddle, stoneflesh, power buff; preChoice mind ward.
 */
export const goldGolemAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  preChoice(state, actor) {
    const allies = alliesOf(state, actor).filter((unit) => unit.id !== actor.id);
    if (allies.length === 0 || randInt(1, 100) > 50) {
      return;
    }
    const ally = allies[randInt(0, allies.length - 1)]!;
    // Как в боте: вард от понижения уровня случайному союзнику (не себе).
    setWard(ally, 'LOWERINGLEVEL', 1);
    state.log.push(`${actor.displayName}: вард от понижения уровня на ${ally.displayName}.`);
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
      const damage = dealDamage(actor, target, { damageMult: 0.9, armorIgnore: 0.2 }, state);
      if (damage === 0) {
        state.log.push(`${actor.displayName}: апперкот — промах.`);
      } else {
        state.log.push(
          `${actor.displayName} бьёт апперкотом ${target.displayName} (${damage}).`
        );
        if (randInt(1, 100) <= 20 + actor.lvl && tryStun(state, target, 1)) {
          state.log.push(`${target.displayName} в нокауте.`);
        }
        markDeadIfNeeded(state, target);
      }
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      if (randInt(1, 100) <= 70) {
        const drained = randInt(2, 3);
        target.mana = Math.max(0, target.mana - drained);
        actor.mana += drained;
        const lose = Math.max(1, Math.round(target.power * (0.25 + actor.lvl * 0.05)));
        grantEffect(target, 'INTERFERENCE', 1, lose);
        state.log.push(
          `${actor.displayName}: загадки — ${target.displayName} −${drained} МР и помехи.`
        );
      } else {
        grantEffect(target, 'HAPPY', 2, 10 + actor.lvl);
        state.log.push(
          `${actor.displayName}: загадки провалены — ${target.displayName} в радости.`
        );
      }
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      grantEffect(target, 'STONEFLESH', 2 + Math.floor(actor.lvl / 4), 40 + actor.lvl);
      state.log.push(`${actor.displayName}: блестящее покрытие на ${target.displayName}.`);
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const allies = alliesOf(state, actor).filter((unit) => unit.id !== actor.id);
      const frac = 0.25 + actor.lvl * 0.05;
      for (const ally of allies) {
        const bonus = Math.max(1, Math.round(ally.power * frac));
        ally.power += bonus;
      }
      state.log.push(`${actor.displayName}: резонанс силы усиливает отряд.`);
      return { status: 'done' };
    }

    return { status: 'reject', message: 'Используйте защиту / ожидание' };
  },
};
