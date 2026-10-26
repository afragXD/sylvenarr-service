import { markDeadIfNeeded, randInt } from '../damage';
import { formatLogDamage } from '../damageSources';
import { grantEffect, tryStun } from '../effects';
import { setWardExact } from '../resists';
import { unitChoiceLabel } from '../transform';
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
      const targets = alliesOf(state, actor);
      return {
        slot: 2,
        label: 'Тёмный ритуал',
        needsTarget: true,
        disabledReason:
          actor.darkRitualCd > 0
            ? `Кулдаун ${actor.darkRitualCd} р.`
            : targets.length === 0
              ? 'Нет союзников'
              : null,
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
    case 5: {
      const targets = alliesOf(state, actor);
      return {
        slot: 5,
        label: 'Покров тьмы',
        needsTarget: true,
        disabledReason:
          actor.darkVeilCd > 0
            ? `Кулдаун ${actor.darkVeilCd} р.`
            : targets.length === 0
              ? 'Нет союзников'
              : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
  }
}

function ghostParalysis(state: BattleState, actor: BattleUnit, target: BattleUnit): void {
  const chance = Math.min(95, actor.accuracy + actor.lvl);
  if (randInt(1, 100) <= chance) {
    if (tryStun(state, target, 1)) {
      state.log.push(`${actor.displayName} парализует ${target.displayName}.`);
    }
    return;
  } else {
    const dmg = Math.max(1, Math.round(actor.power * 0.5));
    target.health -= dmg;
    state.log.push(
      `${target.displayName} сопротивляется ужасу и теряет ${formatLogDamage(dmg, 'MIND')} ОЗ.`
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
 * Specter: mind stun×2, ritual on ally, mark, bleed, dark veil; preChoice drains mage mana.
 */
export const specterAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  preChoice(state, actor) {
    if (actor.darkRitualCd > 0) {
      actor.darkRitualCd -= 1;
    }
    if (actor.darkVeilCd > 0) {
      actor.darkVeilCd -= 1;
    }
    const drain = 1 + Math.floor(actor.lvl / 7);
    const mages = enemiesOf(state, actor).filter((unit) => unit.power > unit.damage);
    for (const mage of mages) {
      const before = mage.mana;
      mage.mana = Math.max(0, mage.mana - drain);
      const taken = before - mage.mana;
      if (taken > 0) {
        state.log.push(
          `${actor.displayName} поглощает ${taken} МР у ${mage.displayName}.`
        );
      }
    }
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
        options: others.map((unit) => ({
          id: unit.id,
          label: unitChoiceLabel(unit),
        })),
        context: { firstTargetId: target.id },
      };
      state.log.push(`${actor.displayName}: выберите вторую цель паралича.`);
      return { status: 'pending' };
    }

    if (input.slot === 2) {
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      actor.darkRitualCd = 2;
      setWardExact(target, 'WEAPON', 1);
      target.morale -= 7;
      grantEffect(target, 'FOCUSED', 2, -17);
      state.log.push(
        `${actor.displayName}: тёмный ритуал — ${target.displayName} получает вард от Оружия, −7 боевого духа и штраф точности.`
      );
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      grantEffect(target, 'MARKED', 1 + Math.floor(actor.lvl / 4), 0);
      const dodgeLoss = 15 + Math.floor(actor.lvl / 2);
      const rounds = 2 + Math.floor(actor.lvl / 7);
      grantEffect(target, 'FATMAN', rounds, dodgeLoss);
      state.log.push(
        `${actor.displayName} отмечает ${target.displayName} сглазом (−${dodgeLoss} уклонения, ${rounds} р.).`
      );
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      if (randInt(1, 100) <= 80) {
        grantEffect(target, 'BLEEDING', 2, 1 + actor.lvl * 0.06);
        state.log.push(`${actor.displayName}: кровотечение на ${target.displayName}.`);
      } else {
        state.log.push(`${actor.displayName}: кровавая трава не сработала.`);
      }
      return { status: 'done' };
    }

    // slot 5 — Покров тьмы
    const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
    if (!target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }
    actor.darkVeilCd = 2;
    const power = 25 + actor.lvl * 2;
    grantEffect(target, 'CHAMELEON', 2, power);
    state.log.push(
      `${actor.displayName} окутывает ${target.displayName} покровом тьмы (+${power} уклонения, 2 р.).`
    );
    return { status: 'done' };
  },
};
