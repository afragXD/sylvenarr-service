import { dealDamage, markDeadIfNeeded, randInt, formatLastLogDamage } from '../damage';
import { DAMAGE_SOURCE_LABELS, type DamageSource } from '../damageSources';
import {
  clearAllEffects,
  grantEffect,
  healUnit,
  trySpendMana,
} from '../effects';
import { setWard } from '../resists';
import { ROW_BACK } from '../settings';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { alliesOf, enemiesOf, unitsOnSameRow } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

function abilityMeta(
  state: BattleState,
  actor: BattleUnit,
  slot: AbilitySlot
): AbilityInfo {
  switch (slot) {
    case 1: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 1,
        label: 'Копьё Солнца',
        needsTarget: true,
        attackKind: 'magic',
        disabledReason:
          actor.mana < 2
            ? 'Нужно 2 МР'
            : targets.length === 0
              ? 'Нет целей'
              : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const allies = alliesOf(state, actor);
      return {
        slot: 2,
        label: 'Божественная длань',
        needsTarget: true,
        disabledReason:
          actor.mana < 3
            ? 'Нужно 3 МР'
            : actor.row !== ROW_BACK
              ? 'Нужен задний ряд'
              : allies.length === 0
                ? 'Нет союзников'
                : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 3: {
      const allies = alliesOf(state, actor);
      return {
        slot: 3,
        label: 'Святая броня',
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
    case 4: {
      const allies = alliesOf(state, actor);
      return {
        slot: 4,
        label: 'Перерождение',
        needsTarget: true,
        disabledReason: allies.length === 0 ? 'Нет союзников' : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 5: {
      const allies = alliesOf(state, actor);
      return {
        slot: 5,
        label: 'Призыв к оружию',
        needsTarget: true,
        disabledReason: allies.length === 0 ? 'Нет союзников' : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
  }
}

/**
 * Abbess: святая магия, массовый heal, броня, dispel ряда, CONTR.
 */
export const abbessAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  apply(state, actor, input): AbilityOutcome {
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      const err = trySpendMana(actor, 2);
      if (err) {
        return { status: 'reject', message: err };
      }
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const damage = dealDamage(
        actor,
        target,
        { kind: 'magic', damageMult: 1, armorIgnore: 0.1, source: 'HOLY' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: Копьё Солнца — промах.`);
      } else {
        state.log.push(
          `${actor.displayName} поражает ${target.displayName} Копьём Солнца ${formatLastLogDamage(damage)}.`
        );
        if (randInt(1, 100) <= 75 + actor.lvl) {
          grantEffect(target, 'SLOW', 2, 15 + actor.lvl);
          state.log.push(`${target.displayName} замедлен.`);
        }
        if (randInt(1, 100) <= 25 + actor.lvl) {
          target.forbiddenResurrect = true;
          state.log.push(`${target.displayName} нельзя воскресить.`);
        }
        markDeadIfNeeded(state, target);
      }
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const err = trySpendMana(actor, 3);
      if (err) {
        return { status: 'reject', message: err };
      }
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      for (const ally of unitsOnSameRow(state, target)) {
        if (ally.team !== actor.team || !ally.alive) {
          continue;
        }
        const amount = actor.power + actor.lvl + randInt(1, 15);
        const healed = healUnit(ally, amount);
        state.log.push(`${ally.displayName} восстанавливает ${healed} ОЗ.`);
      }
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const err = trySpendMana(actor, 3);
      if (err) {
        return { status: 'reject', message: err };
      }
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Нужен союзник' };
      }
      grantEffect(target, 'STONEFLESH', 2 + Math.floor(actor.lvl / 4), 20 + actor.lvl * 2);
      // Как в боте: варды от двух разных случайных источников — себе и цели.
      const pool: DamageSource[] = [
        'FIRE',
        'AIR',
        'WEAPON',
        'ARROWS',
        'WEAPON',
        'EARTH',
        'WATER',
        'MIND',
        'DEATH',
        'STUN',
      ];
      const first = pool.splice(randInt(0, pool.length - 1), 1)[0]!;
      const second = pool.splice(randInt(0, pool.length - 1), 1)[0]!;
      setWard(actor, first, 1);
      setWard(target, second, 1);
      state.log.push(
        `${actor.displayName} дарует святую броню ${target.displayName}: себе — вард от «${DAMAGE_SOURCE_LABELS[first]}», цели — вард от «${DAMAGE_SOURCE_LABELS[second]}».`
      );
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Нужен союзник' };
      }
      for (const unit of unitsOnSameRow(state, target)) {
        clearAllEffects(unit);
      }
      state.log.push(`${actor.displayName}: перерождение — эффекты ряда сняты.`);
      return { status: 'done' };
    }

    // slot 5
    const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
    if (!target) {
      return { status: 'reject', message: 'Нужен союзник' };
    }
    for (const ally of unitsOnSameRow(state, target)) {
      grantEffect(ally, 'CONTR', 2 + Math.floor(actor.lvl / 4), 0);
    }
    state.log.push(`${actor.displayName} призывает ряд к оружию!`);
    return { status: 'done' };
  },
};
