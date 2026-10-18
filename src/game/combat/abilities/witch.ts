import { dealDamage, markDeadIfNeeded, randInt } from '../damage';
import { grantEffect, hasEffect, healUnit, trySpendMana } from '../effects';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { enemiesOf, meleeOrAll } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

function abilityMeta(
  state: BattleState,
  actor: BattleUnit,
  slot: AbilitySlot
): AbilityInfo {
  switch (slot) {
    case 1: {
      const ranged = actor.gun > 0;
      const targets = ranged ? enemiesOf(state, actor) : meleeOrAll(state, actor, false);
      return {
        slot: 1,
        label: ranged ? `Револьвер (${actor.gun})` : 'Каблучок',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const targets = meleeOrAll(state, actor, false);
      return {
        slot: 2,
        label: 'Молочные клыки',
        needsTarget: true,
        disabledReason:
          actor.mana < 3
            ? 'Нужно 3 МР'
            : targets.length === 0
              ? 'Нет целей'
              : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 3,
        label: 'Смертный приговор',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 4: {
      const targets = enemiesOf(state, actor).filter((unit) => !hasEffect(unit, 'GUARDED'));
      return {
        slot: 4,
        label: 'Деградация',
        needsTarget: true,
        disabledReason:
          actor.mana < 4
            ? 'Нужно 4 МР'
            : targets.length === 0
              ? 'Нет целей'
              : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 5: {
      const targets = enemiesOf(state, actor).filter((unit) => !hasEffect(unit, 'GUARDED'));
      return {
        slot: 5,
        label: 'Превращение',
        needsTarget: true,
        disabledReason:
          actor.mana < 4
            ? 'Нужно 4 МР'
            : targets.length === 0
              ? 'Нет целей'
              : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
  }
}

/**
 * Witch: револьвер/каблук, вампиризм, метка, деградация, polymorph-lite.
 */
export const witchAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  apply(state, actor, input): AbilityOutcome {
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      if (actor.gun > 0) {
        const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
        if (!target) {
          return { status: 'reject', message: 'Цель не найдена' };
        }
        const fire = (label: string) => {
          const damage = dealDamage(
            actor,
            target,
            { damageMult: 1, armorIgnore: 0.2, source: 'ARROWS' },
            state
          );
          if (damage === 0) {
            state.log.push(`${actor.displayName}: ${label} — промах.`);
          } else {
            state.log.push(
              `${actor.displayName} стреляет в ${target.displayName} (${damage}).`
            );
            markDeadIfNeeded(state, target);
          }
          actor.gun -= 1;
        };
        fire('Револьвер');
        // AM: lvl>8 && 75%; при actor.lvl=5 — 25% proxy «двойного выстрела»
        if (actor.gun > 0 && target.alive && randInt(1, 100) <= 25) {
          fire('Второй выстрел');
        }
        return { status: 'done' };
      }
      const target = meleeOrAll(state, actor, false).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const damage = dealDamage(
        actor,
        target,
        { damageMult: 1, armorIgnore: 0.5, source: 'WEAPON' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: каблучок — промах.`);
      } else {
        state.log.push(
          `${actor.displayName} бьёт каблучком ${target.displayName} на ${damage}.`
        );
        markDeadIfNeeded(state, target);
      }
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const err = trySpendMana(actor, 3);
      if (err) {
        return { status: 'reject', message: err };
      }
      const target = meleeOrAll(state, actor, false).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const damage = dealDamage(
        actor,
        target,
        { damageMult: 1, armorIgnore: 0.15, source: 'DEATH' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: клыки — промах.`);
      } else {
        const healed = healUnit(
          actor,
          Math.max(1, Math.round(damage / 3 + target.health * 0.12))
        );
        state.log.push(
          `${actor.displayName} кусает ${target.displayName} (${damage}), +${healed} ОЗ.`
        );
        markDeadIfNeeded(state, target);
      }
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      grantEffect(target, 'MARKED', 2 + Math.floor(actor.lvl / 6), 0);
      grantEffect(target, 'DEATHSENTENCE', 2, 5 + Math.floor((25 + actor.lvl * 2) / 10));
      state.log.push(`${actor.displayName} выносит смертный приговор ${target.displayName}.`);
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const err = trySpendMana(actor, 4);
      if (err) {
        return { status: 'reject', message: err };
      }
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target || hasEffect(target, 'GUARDED')) {
        return { status: 'reject', message: 'Цель недоступна' };
      }
      if (randInt(1, 100) <= 70 + actor.lvl * 2) {
        const n = Math.floor(actor.lvl / 6) + 1;
        target.damage = Math.max(1, target.damage - n * 3);
        target.power = Math.max(0, target.power - n * 2);
        state.log.push(
          `${actor.displayName}: деградация ${target.displayName} (−${n} «уровня»).`
        );
      } else {
        state.log.push(`${actor.displayName}: деградация не сработала.`);
      }
      return { status: 'done' };
    }

    // slot 5
    const err = trySpendMana(actor, 4);
    if (err) {
      return { status: 'reject', message: err };
    }
    const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
    if (!target || hasEffect(target, 'GUARDED')) {
      return { status: 'reject', message: 'Цель недоступна' };
    }
    if (randInt(1, 100) <= 65 + actor.lvl) {
      grantEffect(target, 'IMPISH', 2, 5);
      state.log.push(`${actor.displayName} превращает ${target.displayName} в беса.`);
    } else {
      state.log.push(`${actor.displayName}: превращение не удалось.`);
    }
    return { status: 'done' };
  },
};
