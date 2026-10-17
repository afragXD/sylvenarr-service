import { PILOT_LVL, randInt } from '../damage';
import { grantEffect } from '../effects';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { alliesOf, enemiesOf } from './targets';
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
        label: 'Homie De Flanders',
        needsTarget: true,
        disabledReason: allies.length === 0 ? 'Нет союзников' : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 2: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 2,
        label: 'МЧС, Классическое',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3: {
      const allies = alliesOf(state, actor);
      return {
        slot: 3,
        label: 'Огуречное',
        needsTarget: true,
        disabledReason: allies.length === 0 ? 'Нет союзников' : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 4: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 4,
        label: `Торпеда (${actor.ultaCharges})`,
        needsTarget: true,
        disabledReason:
          actor.ultaCharges <= 0
            ? 'Нет снарядов'
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
 * BeerElemental: happy, drunk, critBank, poison ulta; preChoice gold loss.
 */
export const beerElementalAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  preChoice(state, actor) {
    const loss = randInt(10, 80);
    actor.gold = Math.max(0, actor.gold - loss);
    state.log.push(`${actor.displayName} просадил ${loss} золота в азартные игры!`);
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
      const power = target.luck < 5 ? 10 + PILOT_LVL * 2 : 5;
      grantEffect(target, 'HAPPY', 2, power);
      state.log.push(
        `${actor.displayName}: кружка для ${target.displayName} (+${power} удачи).`
      );
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      if (randInt(1, 100) <= 70 + PILOT_LVL * 2) {
        grantEffect(target, 'FATMAN', 2, 20 + PILOT_LVL);
        state.log.push(`${actor.displayName}: ${target.displayName} пьян и шатается.`);
      } else {
        state.log.push(`${actor.displayName}: опьянение провалилось.`);
      }
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const bank = 1 + Math.floor(PILOT_LVL / 5);
      target.critBank += bank;
      state.log.push(
        `${actor.displayName}: ${target.displayName} получает ${bank} гарант-крит(а).`
      );
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      actor.ultaCharges -= 1;
      grantEffect(target, 'POISON', 2, 1.5);
      state.log.push(
        `${actor.displayName}: торпеда — ${target.displayName} отравлен (осталось ${actor.ultaCharges}).`
      );
      return { status: 'done' };
    }

    return { status: 'reject', message: 'Используйте защиту / ожидание' };
  },
};
