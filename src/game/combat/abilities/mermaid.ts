import { randInt } from '../damage';
import { enslaveUnit, grantEffect, healUnit, trySpendMana } from '../effects';
import { resistsEnslave } from '../races';
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
      const allies = alliesOf(state, actor);
      return {
        slot: 1,
        label: 'Морской бриз',
        needsTarget: true,
        disabledReason: allies.length === 0 ? 'Нет союзников' : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 2: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 2,
        label: 'Обледенение ряда',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 3,
        label: `Песнь сирены (${actor.ultaCharges})`,
        needsTarget: true,
        disabledReason:
          actor.ultaCharges <= 0
            ? 'Нет зарядов'
            : targets.length === 0
              ? 'Нет целей'
              : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 4: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 4,
        label: 'Волшебные оковы',
        needsTarget: true,
        disabledReason:
          actor.mana < 2
            ? 'Нужно 2 МР'
            : targets.length === 0
              ? 'Нет целей'
              : null,
        legalTargetIds: targets.map((unit) => unit.id),
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
 * Mermaid: heal+acc, row stun, enslave ulta, magic shackles.
 */
export const mermaidAbilities: AbilityHandler = {
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
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const bonusForLowHp = Math.round(20 * (2 - target.health / target.maxHp));
      const amount = actor.lvl * 5 + bonusForLowHp;
      const healed = healUnit(target, amount);
      const accGain = actor.lvl * 2 + 2;
      target.accuracy += accGain;
      state.log.push(
        `${actor.displayName}: морской бриз — ${target.displayName} +${healed} ОЗ, +${accGain} точности.`
      );
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const row = unitsOnSameRow(state, target);
      const chance = 38 + actor.lvl;
      for (const enemy of row) {
        if (randInt(1, 100) <= chance) {
          grantEffect(enemy, 'STUNNED', 1, 0);
          state.log.push(`${actor.displayName}: ${enemy.displayName} обращён в лёд.`);
        } else {
          state.log.push(`${enemy.displayName} отразил обледенение.`);
        }
      }
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      actor.ultaCharges -= 1;
      const allies = alliesOf(state, actor);
      if (allies.length > 0) {
        const ally = allies[randInt(0, allies.length - 1)]!;
        grantEffect(ally, 'REGENHP', 2, 1 + actor.lvl * 0.2);
        state.log.push(`${actor.displayName}: регенерация на ${ally.displayName}.`);
      }
      if (resistsEnslave(target.heroClassCode)) {
        state.log.push(
          `${actor.displayName}: ${target.displayName} не поддаётся песне (нежить/механизм).`
        );
        return { status: 'done' };
      }
      enslaveUnit(target, actor);
      state.log.push(
        `${actor.displayName} порабощает ${target.displayName} песнью сирены.`
      );
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const err = trySpendMana(actor, 2);
      if (err) {
        return { status: 'reject', message: err };
      }
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        actor.mana += 2;
        return { status: 'reject', message: 'Цель не найдена' };
      }
      grantEffect(target, 'MAGIC_SHACKLES', 2 + Math.floor(actor.lvl / 6), 0);
      state.log.push(
        `${actor.displayName}: волшебные оковы на ${target.displayName}.`
      );
      return { status: 'done' };
    }

    return { status: 'reject', message: 'Используйте защиту / ожидание' };
  },
};
