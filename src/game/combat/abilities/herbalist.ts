import { dealDamage, formatLastLogDamage, markDeadIfNeeded } from '../damage';
import { clearDebuffs, grantEffect, healUnit, trySpendMana } from '../effects';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { alliesOf, enemiesOf, ownRowAllies } from './targets';
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
    case 5: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 5,
        label: 'Праща',
        needsTarget: true,
        attackKind: 'ranged',
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
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
        const atk = Math.max(1, Math.round(ally.damage * 0.25));
        grantEffect(ally, 'STRENGTH', 1, atk);
        grantEffect(ally, 'FOCUSED', 1, 20 + actor.lvl);
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
      clearDebuffs(actor);
      state.log.push(
        target.id === actor.id
          ? `${actor.displayName} снимает дебаффы с себя.`
          : `${actor.displayName} снимает дебаффы с ${target.displayName} и с себя.`
      );
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const healed = healUnit(actor, 5 + actor.lvl);
      state.log.push(
        `${actor.displayName} варит зелье поддержки (+${healed} ОЗ; инвентарь — позже).`
      );
      return { status: 'done' };
    }

    if (input.slot === 5) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const graves =
        state.graveyard.filter((entry) => entry.team === actor.team).length +
        state.units.filter(
          (unit) => !unit.alive && unit.team === actor.team && unit.isSummon
        ).length;
      const damageMult = 1 + 0.15 * graves;
      const armorIgnore = (50 + actor.lvl) / 100;
      const damage = dealDamage(
        actor,
        target,
        { kind: 'ranged', damageMult, armorIgnore, source: 'ARROWS' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: праща — промах.`);
        return { status: 'done' };
      }
      state.log.push(
        `${actor.displayName} бьёт пращой ${target.displayName} ${formatLastLogDamage(damage)}${graves > 0 ? ` (+${graves * 15}% за могилы)` : ''}.`
      );
      markDeadIfNeeded(state, target);
      return { status: 'done' };
    }

    return { status: 'reject', message: 'Используйте защиту / ожидание' };
  },
};
