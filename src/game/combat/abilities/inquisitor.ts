import { dealDamage, markDeadIfNeeded, randInt } from '../damage';
import { grantEffect, trySpendMana, tryStun } from '../effects';
import { isArtificialClass, isUndeadClass } from '../races';
import { ROW_BACK } from '../settings';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { enemiesOf, meleeOrAll, moveToOtherRow } from './targets';
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
        label: 'Булава Порядка',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 2,
        label: 'Пыточная молния',
        needsTarget: true,
        disabledReason:
          actor.tortureLightningCd > 0
            ? `Кулдаун ${actor.tortureLightningCd} р.`
            : actor.mana < 3
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
        label: 'Телекинез',
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
    case 4: {
      const targets = meleeOrAll(state, actor, false);
      return {
        slot: 4,
        label: 'Мощный удар',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 5: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 5,
        label: 'Град кристаллов',
        needsTarget: true,
        disabledReason:
          actor.row !== ROW_BACK
            ? 'Нужен задний ряд'
            : actor.mana < 2
              ? 'Нужно 2 МР'
              : targets.length === 0
                ? 'Нет целей'
                : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
  }
}

/**
 * Inquisitor: булава, молния, телекинез, оглушение, silence.
 */
export const inquisitorAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  preChoice(_state, actor) {
    if (actor.tortureLightningCd > 0) {
      actor.tortureLightningCd -= 1;
    }
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
      const damage = dealDamage(actor, target, { damageMult: 1, armorIgnore: 0 }, state);
      if (damage === 0) {
        state.log.push(`${actor.displayName}: булава — промах.`);
      } else {
        state.log.push(
          `${actor.displayName} бьёт булавой ${target.displayName} на ${damage}.`
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
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      actor.tortureLightningCd = 2;
      const damage = dealDamage(
        actor,
        target,
        { damageMult: 1, armorIgnore: 0.1, source: 'AIR' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: молния — промах.`);
      } else {
        const lose = Math.max(1, Math.round(target.power * (0.25 + 0.02 * actor.lvl)));
        grantEffect(target, 'INTERFERENCE', 1 + Math.floor(actor.lvl / 6), lose);
        state.log.push(
          `${actor.displayName} пыточной молнией бьёт ${target.displayName} (${damage}).`
        );
        if (
          !isUndeadClass(target.heroClassCode) &&
          !isArtificialClass(target.heroClassCode)
        ) {
          const moraleDamage = randInt(3, 6) + actor.lvl;
          target.morale -= moraleDamage;
          state.log.push(
            `${target.displayName} от пыток теряет ${moraleDamage} боевого духа.`
          );
        }
        markDeadIfNeeded(state, target);
      }
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const err = trySpendMana(actor, 3);
      if (err) {
        return { status: 'reject', message: err };
      }
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель недоступна' };
      }
      if (randInt(1, 100) <= 75 + actor.lvl) {
        const before = target.row;
        moveToOtherRow(target);
        state.log.push(
          `${actor.displayName} телекинезом перемещает ${target.displayName} (ряд ${before}→${target.row}).`
        );
      } else {
        state.log.push(`${actor.displayName}: телекинез не сработал.`);
      }
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const target = meleeOrAll(state, actor, false).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const damage = dealDamage(actor, target, { damageMult: 1.25, armorIgnore: 0 }, state);
      if (damage === 0) {
        state.log.push(`${actor.displayName}: мощный удар — промах.`);
      } else {
        state.log.push(
          `${actor.displayName} мощным ударом бьёт ${target.displayName} (${damage}).`
        );
        // options.py: 62+L; fourthAction ошибочно 162+L — берём 62+L×2.
        if (randInt(1, 100) <= 62 + actor.lvl * 2 && tryStun(state, target, 1)) {
          state.log.push(`${target.displayName} оглушён.`);
        } else {
          const broken = Math.max(1, Math.round(damage * 0.25));
          target.armor = Math.max(0, target.armor - broken);
          state.log.push(`${target.displayName} теряет ${broken} брони.`);
        }
        markDeadIfNeeded(state, target);
      }
      return { status: 'done' };
    }

    // slot 5
    const err = trySpendMana(actor, 2);
    if (err) {
      return { status: 'reject', message: err };
    }
    const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
    if (!target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }
    const damage = dealDamage(actor, target, { damageMult: 0.9, armorIgnore: 0.15 }, state);
    if (damage === 0) {
      state.log.push(`${actor.displayName}: град кристаллов — промах.`);
    } else {
      state.log.push(
        `${actor.displayName} обрушивает кристаллы на ${target.displayName} (${damage}).`
      );
      if (randInt(1, 100) <= 50 + actor.lvl * 3) {
        grantEffect(target, 'SILENCE', 2, 0);
        state.log.push(`${target.displayName} нем.`);
      }
      markDeadIfNeeded(state, target);
    }
    return { status: 'done' };
  },
};
