import { randInt } from '../damage';
import { grantEffect, healUnit, trySpendMana, addMana } from '../effects';
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
        label: 'Восстановление ОЗ',
        needsTarget: true,
        disabledReason:
          actor.mana < 2
            ? 'Нужно 2 МР'
            : allies.length === 0
              ? 'Нет союзников'
              : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 2: {
      const allies = alliesOf(state, actor).filter((unit) =>
        state.doneIds.includes(unit.id)
      );
      return {
        slot: 2,
        label: 'Миг могущества',
        needsTarget: true,
        disabledReason:
          actor.mana < 3
            ? 'Нужно 3 МР'
            : allies.length === 0
              ? 'Нет союзника, уже ходившего'
              : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 3: {
      const allies = alliesOf(state, actor);
      return {
        slot: 3,
        label: 'Знамение Галлеана',
        needsTarget: true,
        disabledReason: allies.length === 0 ? 'Нет союзников' : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 4:
      return {
        slot: 4,
        label: `Аркана энергии (${actor.ultaCharges})`,
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
 * Oracle: heal+maxHp, extra turn, mind ward, row mana.
 */
export const oracleAbilities: AbilityHandler = {
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
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Нужен союзник' };
      }
      const amount = randInt(35 + actor.lvl, 50 + actor.lvl * 4);
      const healed = healUnit(target, amount);
      target.maxHp = Math.round(target.maxHp * 1.15);
      target.health = Math.min(target.maxHp, target.health);
      state.log.push(
        `${actor.displayName} восстанавливает ${healed} ОЗ ${target.displayName} (+15% maxHp).`
      );
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const err = trySpendMana(actor, 3);
      if (err) {
        return { status: 'reject', message: err };
      }
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target || !state.doneIds.includes(target.id)) {
        return { status: 'reject', message: 'Цель ещё не ходила' };
      }
      if (randInt(1, 100) <= 70 + actor.lvl * 3) {
        state.log.push(`${actor.displayName} даёт доп. ход ${target.displayName}.`);
        return { status: 'done', extraTurnForUnitId: target.id };
      }
      state.log.push(`${actor.displayName}: миг могущества не сработал.`);
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Нужен союзник' };
      }
      grantEffect(target, 'MIND_WARD', 2, 0);
      const moraleGain = actor.lvl * 2;
      target.morale += moraleGain;
      state.log.push(
        `${actor.displayName}: знамение защищает разум ${target.displayName} (мораль +${moraleGain}).`
      );
      return { status: 'done' };
    }

    if (input.slot === 4) {
      actor.ultaCharges -= 1;
      for (const ally of ownRowAllies(state, actor)) {
        addMana(ally, randInt(4, 8));
      }
      state.log.push(`${actor.displayName}: аркана энергии наполняет ряд маной.`);
      return { status: 'done' };
    }

    return { status: 'reject', message: 'Используйте защиту / ожидание' };
  },
};
