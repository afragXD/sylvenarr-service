import { dealDamage, markDeadIfNeeded, randInt } from '../damage';
import { effectLogLabel } from '../effect-labels';
import { delEffect, grantEffect, hasEffect, healUnit, trySpendMana } from '../effects';
import { levelUpUnit } from '../level';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { alliesOf, enemiesOf, ownRowAllies } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

const WISDOM_BUFFS = ['STRENGTH', 'HAPPY', 'HASTE'] as const;

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
        label: 'Шёпот леса',
        needsTarget: true,
        disabledReason: allies.length === 0 ? 'Нет союзников' : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 2: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 2,
        label: 'Опутать корнями',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 3,
        label: 'Запретное слово',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 4: {
      const allies = alliesOf(state, actor);
      return {
        slot: 4,
        label: 'Мудрость',
        needsTarget: true,
        disabledReason:
          actor.mana < 3
            ? 'Нужно 3 МР'
            : allies.length === 0
              ? 'Нет союзников'
              : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 5: {
      const allies = alliesOf(state, actor);
      return {
        slot: 5,
        label: 'Взращивание',
        needsTarget: true,
        disabledReason:
          actor.mana < 4
            ? 'Нужно 4 МР'
            : allies.length === 0
              ? 'Нет союзников'
              : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
  }
}

/**
 * EvilTree: focus+lucky, root heal-share, INTERDICT, random buff, levelup grant; preChoice row armor.
 */
export const evilTreeAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  preChoice(state, actor) {
    const bonus = 2 + Math.floor(actor.lvl / 5);
    for (const ally of ownRowAllies(state, actor)) {
      if (hasEffect(ally, 'ROW_FORTIFY')) {
        delEffect(ally, 'ROW_FORTIFY');
      }
      grantEffect(ally, 'ROW_FORTIFY', 1, bonus);
    }
    state.log.push(`${actor.displayName} укрепляет броню ряда на ${bonus}.`);
  },

  apply(state, actor, input): AbilityOutcome {
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      grantEffect(target, 'FOCUSED', 1 + Math.floor(actor.lvl / 4), 20 + actor.lvl * 2);
      grantEffect(target, 'LUCKY', 1 + Math.floor(actor.lvl / 5), 10 + actor.lvl * 2);
      state.log.push(
        `${actor.displayName}: шёпот леса — ${target.displayName} сосредоточен и удачлив.`
      );
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const damage = dealDamage(
        actor,
        target,
        { damageMult: 1, armorIgnore: 0.1, source: 'EARTH' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: корни — промах.`);
        return { status: 'done' };
      }
      state.log.push(
        `${actor.displayName} опутывает ${target.displayName} (${damage}).`
      );
      markDeadIfNeeded(state, target);
      const row = ownRowAllies(state, actor);
      if (row.length > 0) {
        const share = Math.floor(damage / row.length);
        for (const ally of row) {
          const healed = healUnit(ally, share);
          if (healed > 0) {
            state.log.push(`${ally.displayName} восстанавливает ${healed} ОЗ от корней.`);
          }
        }
      }
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      grantEffect(target, 'INTERDICT', 2 + Math.floor(actor.lvl / 4), 1);
      state.log.push(
        `${actor.displayName}: запретное слово — ${target.displayName} не получает лечения.`
      );
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const err = trySpendMana(actor, 3);
      if (err) {
        return { status: 'reject', message: err };
      }
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        actor.mana += 3;
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const buff = WISDOM_BUFFS[randInt(0, WISDOM_BUFFS.length - 1)]!;
      const power =
        buff === 'STRENGTH'
          ? 20 + actor.lvl * 2
          : buff === 'HAPPY'
            ? 15 + actor.lvl * 2
            : 20;
      grantEffect(target, buff, 2, power);
      state.log.push(
        `${actor.displayName}: мудрость — ${target.displayName} получает «${effectLogLabel(buff)}».`
      );
      return { status: 'done' };
    }

    if (input.slot === 5) {
      const err = trySpendMana(actor, 4);
      if (err) {
        return { status: 'reject', message: err };
      }
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        actor.mana += 4;
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const levels = 2 + actor.lvl;
      levelUpUnit(target, levels, state);
      state.log.push(
        `${actor.displayName}: взращивание — ${target.displayName} получает +${levels} уровней.`
      );
      return { status: 'done' };
    }

    return { status: 'reject', message: 'Используйте защиту / ожидание' };
  },
};
