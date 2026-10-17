import { markDeadIfNeeded, PILOT_LVL, randInt } from '../damage';
import { grantEffect } from '../effects';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { enemiesOf, enemyTeamLeader } from './targets';
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
        label: 'Паралич разума',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 2,
        label: 'Тёмный ритуал',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 3,
        label: 'Сглаз',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 4: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 4,
        label: 'Кровавая трава',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
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

function ghostParalysis(state: BattleState, actor: BattleUnit, target: BattleUnit): void {
  const chance = Math.min(95, actor.accuracy + PILOT_LVL);
  if (randInt(1, 100) <= chance) {
    grantEffect(target, 'STUNNED', 1, 0);
    state.log.push(`${actor.displayName} парализует ${target.displayName}.`);
  } else {
    const dmg = Math.max(1, Math.round(actor.power * 0.5));
    target.health -= dmg;
    state.log.push(
      `${target.displayName} сопротивляется ужасу и теряет ${dmg} ОЗ.`
    );
    markDeadIfNeeded(state, target);
  }
}

function resolveSecondMind(
  state: BattleState,
  actor: BattleUnit,
  choice: string | undefined
): AbilityOutcome {
  const prompt = state.pendingPrompt;
  if (!prompt || !choice) {
    return { status: 'reject', message: 'Нужен выбор' };
  }
  if (!prompt.options.some((option) => option.id === choice)) {
    return { status: 'reject', message: 'Неверный выбор' };
  }
  const target = enemiesOf(state, actor).find((unit) => unit.id === choice);
  state.pendingPrompt = null;
  if (!target) {
    return { status: 'reject', message: 'Цель не найдена' };
  }
  ghostParalysis(state, actor, target);
  return { status: 'done' };
}

/**
 * Specter: mind stun×2, ritual, mark, bleed; preChoice drains leader mana.
 */
export const specterAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  preChoice(state, actor) {
    const leader = enemyTeamLeader(state, actor);
    if (!leader) {
      return;
    }
    leader.mana = Math.max(0, leader.mana - 2);
    state.log.push(`${actor.displayName} поглощает 2 МР у ${leader.displayName}.`);
  },

  apply(state, actor, input): AbilityOutcome {
    if (state.pendingPrompt?.unitId === actor.id) {
      return resolveSecondMind(state, actor, input.choice);
    }

    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      ghostParalysis(state, actor, target);
      const others = enemiesOf(state, actor).filter((unit) => unit.id !== target.id);
      if (others.length === 0) {
        return { status: 'done' };
      }
      state.pendingPrompt = {
        unitId: actor.id,
        kind: 'specter_second_mind',
        slot: 1,
        options: others.map((unit) => ({ id: unit.id, label: unit.displayName })),
        context: { firstTargetId: target.id },
      };
      state.log.push(`${actor.displayName}: выберите вторую цель паралича.`);
      return { status: 'pending' };
    }

    if (input.slot === 2) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      grantEffect(actor, 'GUARDED', 2, 3);
      const loss = 3 * PILOT_LVL + 15;
      target.health -= loss;
      state.log.push(
        `${actor.displayName}: тёмный ритуал — ${target.displayName} −${loss} ОЗ; вард оружия на себе.`
      );
      markDeadIfNeeded(state, target);
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      grantEffect(target, 'MARKED', 1 + Math.floor(PILOT_LVL / 4), 0);
      grantEffect(target, 'UNLUCKY', 2, PILOT_LVL + 3);
      state.log.push(`${actor.displayName} отмечает ${target.displayName} сглазом.`);
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      if (randInt(1, 100) <= 80) {
        grantEffect(target, 'BLEEDING', 2, Math.max(1, Math.round(1 + PILOT_LVL * 0.06)));
        state.log.push(`${actor.displayName}: кровотечение на ${target.displayName}.`);
      } else {
        state.log.push(`${actor.displayName}: кровавая трава не сработала.`);
      }
      return { status: 'done' };
    }

    return { status: 'reject', message: 'Используйте защиту / ожидание' };
  },
};
