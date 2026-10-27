import { dealDamage, formatLastLogDamage, markDeadIfNeeded, randInt } from '../damage';
import { formatLogDamage } from '../damageSources';
import { delEffect, grantEffect, hasEffect } from '../effects';
import { levelUpUnit } from '../level';
import { applyCatalogStats } from '../transform';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { enemiesOf, meleeOrAll } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

function mimicTargets(state: BattleState, actor: BattleUnit): BattleUnit[] {
  return state.units.filter((unit) => {
    if (!unit.alive || unit.id === actor.id) {
      return false;
    }
    const size = state.catalog[unit.heroClassCode]?.size ?? 1;
    if (size >= 2 && actor.lvl < 10) {
      return false;
    }
    return true;
  });
}

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
        label: 'Стилет',
        needsTarget: true,
        attackKind: 'melee',
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const targets = mimicTargets(state, actor);
      return {
        slot: 2,
        label: 'Звон смерти',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей для облика' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3:
      return {
        slot: 3,
        label: `Приговор (${actor.deathNote}%)`,
        needsTarget: true,
        disabledReason:
          actor.deathNoteCd > 0
            ? `Кулдаун ${actor.deathNoteCd} р.`
            : enemiesOf(state, actor).length === 0
              ? 'Нет целей'
              : null,
        legalTargetIds: enemiesOf(state, actor).map((unit) => unit.id),
      };
    case 4: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 4,
        label: `Дротик (${actor.darts})`,
        needsTarget: true,
        disabledReason:
          actor.darts <= 0 ? 'Нет дротиков' : targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 5:
      return {
        slot: 5,
        label: 'Злобный хохот',
        needsTarget: false,
        disabledReason: null,
        legalTargetIds: [],
      };
  }
}

/**
 * Assassin: стилет, полиморф, тетрадь, яд, хамелеон.
 */
export const assassinAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  preChoice(_state, actor) {
    if (actor.deathNoteCd > 0) {
      actor.deathNoteCd -= 1;
    }
  },

  apply(state, actor, input): AbilityOutcome {
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      const target = pickMelee(state, actor, input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const damage = dealDamage(
        actor,
        target,
        { kind: 'melee', damageMult: 1.15, armorIgnore: 0.35 },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName} промахивается стилетом.`);
      } else {
        state.log.push(
          `${actor.displayName} бьёт стилетом ${target.displayName} ${formatLastLogDamage(damage)}.`
        );
        markDeadIfNeeded(state, target);
      }
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const target = mimicTargets(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const code = target.heroClassCode;
      const size = state.catalog[code]?.size ?? 1;
      if (size >= 2 && actor.lvl < 10) {
        return { status: 'reject', message: 'Гигант с 10 уровня' };
      }
      if (hasEffect(actor, 'POLYMORPH')) {
        delEffect(actor, 'POLYMORPH', state);
      }
      actor.transformParentCode = 'Assassin';
      if (!applyCatalogStats(state, actor, code)) {
        actor.transformParentCode = null;
        return { status: 'reject', message: 'Не удалось принять облик' };
      }
      const formName = actor.displayName;
      actor.displayName = `Мимик ${formName}`;
      actor.ultaCharges += 1;
      const moraleGain = actor.lvl + 3;
      actor.morale += moraleGain;
      grantEffect(actor, 'POLYMORPH', 2, 0);
      levelUpUnit(actor, 1, state);
      state.log.push(
        `Мимик принимает облик ${formName} (+1 ур., мораль +${moraleGain}).`
      );
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      actor.deathNoteCd = 3;
      if (randInt(1, 100) <= Math.min(95, actor.deathNote)) {
        target.health = 1;
        actor.morale += 15;
        actor.deathNote = Math.max(0, actor.deathNote - 10);
        state.log.push(
          `${actor.displayName} вписывает имя ${target.displayName} — остаётся 1 ОЗ.`
        );
      } else {
        actor.morale -= 14;
        actor.deathNote += 7;
        grantEffect(actor, 'FATMAN', 3, 10);
        state.log.push(
          `${actor.displayName} проваливает приговор и временно ослаблен.`
        );
      }
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      actor.darts -= 1;
      const poke = randInt(1, 5) + actor.lvl;
      target.health -= poke;
      grantEffect(target, 'POISON', 2, 1.2);
      state.log.push(
        `${actor.displayName} бросает дротик в ${target.displayName} ${formatLogDamage(poke, 'WEAPON')} (+ яд).`
      );
      markDeadIfNeeded(state, target);
      return { status: 'done' };
    }

    // slot 5
    const moraleLoss = randInt(4, 8);
    const noteGain = randInt(3, 6);
    actor.morale -= moraleLoss;
    grantEffect(actor, 'CHAMELEON', 1, 20);
    actor.deathNote += noteGain;
    state.log.push(
      `${actor.displayName} хохочет: хамелеон, тетрадь +${noteGain}%, мораль −${moraleLoss}.`
    );
    return { status: 'done' };
  },
};

function pickMelee(
  state: BattleState,
  actor: BattleUnit,
  targetId: string | undefined
): BattleUnit | undefined {
  const targets = meleeOrAll(state, actor, false);
  return (targetId ? targets.find((unit) => unit.id === targetId) : undefined) ?? targets[0];
}
