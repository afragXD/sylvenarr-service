import { dealDamage, markDeadIfNeeded, randInt, formatLastLogDamage } from '../damage';
import { grantEffect, trySpendMana, tryStun } from '../effects';
import { isArtificialClass, isUndeadClass } from '../races';
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
        attackKind: 'melee',
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
          actor.telekinesisCd > 0
            ? `Кулдаун ${actor.telekinesisCd} р.`
            : actor.mana < 3
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
        label: 'Любитель кристальных чар',
        needsTarget: true,
        disabledReason:
          actor.crystalCharmsCd > 0
            ? `Кулдаун ${actor.crystalCharmsCd} р.`
            : actor.mana < 3
              ? 'Нужно 3 МР'
              : targets.length === 0
                ? 'Нет целей'
                : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
  }
}

/**
 * Inquisitor: булава, молния, телекинез, оглушение, кристальные чары.
 */
export const inquisitorAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  preChoice(_state, actor) {
    if (actor.tortureLightningCd > 0) {
      actor.tortureLightningCd -= 1;
    }
    if (actor.telekinesisCd > 0) {
      actor.telekinesisCd -= 1;
    }
    if (actor.crystalCharmsCd > 0) {
      actor.crystalCharmsCd -= 1;
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
      const damage = dealDamage(
        actor,
        target,
        { kind: 'melee', damageMult: 1, armorIgnore: 0 },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: булава — промах.`);
      } else {
        state.log.push(
          `${actor.displayName} бьёт булавой ${target.displayName} ${formatLastLogDamage(damage)}.`
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
        { kind: 'magic', damageMult: 1, armorIgnore: 0.1, source: 'AIR' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: молния — промах.`);
      } else {
        const lose = Math.max(1, Math.round(target.power * (0.25 + 0.02 * actor.lvl)));
        grantEffect(target, 'INTERFERENCE', 1 + Math.floor(actor.lvl / 6), lose);
        state.log.push(
          `${actor.displayName} пыточной молнией бьёт ${target.displayName} ${formatLastLogDamage(damage)}.`
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
      actor.telekinesisCd = 2;
      if (randInt(1, 100) <= 85 + actor.lvl) {
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
      const damage = dealDamage(
        actor,
        target,
        { kind: 'melee', damageMult: 1.25, armorIgnore: 0 },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: мощный удар — промах.`);
      } else {
        state.log.push(
          `${actor.displayName} мощным ударом бьёт ${target.displayName} ${formatLastLogDamage(damage)}.`
        );
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

    // slot 5 — Любитель кристальных чар
    const err = trySpendMana(actor, 3);
    if (err) {
      return { status: 'reject', message: err };
    }
    const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
    if (!target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }
    actor.crystalCharmsCd = 2;
    const damage = dealDamage(
      actor,
      target,
      { kind: 'magic', damageMult: 0.9, armorIgnore: 0.15, source: 'EARTH' },
      state
    );
    if (damage === 0) {
      state.log.push(`${actor.displayName}: кристальные чары — промах.`);
    } else {
      state.log.push(
        `${actor.displayName} обрушивает кристаллы на ${target.displayName} ${formatLastLogDamage(damage)}.`
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
