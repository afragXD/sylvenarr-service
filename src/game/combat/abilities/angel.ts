import {
  dealDamage,
  formatLastLogDamage,
  harmWithSource,
  lastDealDamageResult,
  markDeadIfNeeded,
  randInt,
} from '../damage';
import { formatLogDamage } from '../damageSources';
import { clearBuffs, grantEffect, healUnit } from '../effects';
import { isUnholyClass } from '../races';
import { rollSrcChance } from '../resists';
import { unitChoiceLabel } from '../transform';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { cdReason, resetCooldowns, setSlotCd, tickSlotCds } from './cooldowns';
import { alliesOf, enemiesOf, moveToOtherRow } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

const PROMPT_SECOND_HEAL = 'angel_second_heal';

function isGiant(state: BattleState, unit: BattleUnit): boolean {
  return (state.catalog[unit.heroClassCode]?.size ?? 1) >= 2;
}

/** Процент текущего ОЗ, который снимают «Где твои крылья». */
export function wingsPercent(actor: BattleUnit): number {
  return 15 + actor.lvl;
}

/**
 * Лечение с критом: шанс крита = удача (и банк критов), ×1.5;
 * по нежити и демонам крита нет. Натуральный бросок > 95 — провал, лечение ранит.
 * @returns вылеченные ОЗ (отрицательное значение — урон при провале).
 */
export function healWithCrit(
  state: BattleState,
  healer: BattleUnit,
  target: BattleUnit,
  base: number
): number {
  const unholy = isUnholyClass(target.heroClassCode);
  const roll = randInt(1, 100);
  let crit = false;
  if (!unholy && healer.critBank > 0) {
    healer.critBank -= 1;
    crit = true;
  } else if (!unholy && healer.luck > 0 && roll <= Math.min(40, healer.luck)) {
    crit = true;
  } else if (roll > 95) {
    const dealt = harmWithSource(state, target, base, 'HOLY');
    state.log.push(
      `${healer.displayName}: критический провал — свет обжигает ${target.displayName} ${formatLogDamage(dealt, 'HOLY')}.`
    );
    markDeadIfNeeded(state, target);
    return -dealt;
  }
  const healed = healUnit(target, crit ? Math.round(base * 1.5) : base);
  state.log.push(
    `${healer.displayName}${crit ? ' (критическое лечение)' : ''} исцеляет ${target.displayName} на ${healed} ОЗ.`
  );
  return healed;
}

function abilityMeta(state: BattleState, actor: BattleUnit, slot: AbilitySlot): AbilityInfo {
  const allies = alliesOf(state, actor);
  switch (slot) {
    case 1:
      return {
        slot: 1,
        label: 'Прикосновение блаженства ×2',
        needsTarget: true,
        disabledReason: allies.length === 0 ? 'Нет союзников' : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    case 2:
      return {
        slot: 2,
        label: 'Оковы войны',
        needsTarget: true,
        disabledReason: cdReason(actor, 2),
        legalTargetIds: allies.map((unit) => unit.id),
      };
    case 3: {
      const targets = [...allies, ...enemiesOf(state, actor)].filter(
        (unit) => !isGiant(state, unit)
      );
      return {
        slot: 3,
        label: `Где твои крылья (${wingsPercent(actor)}% ОЗ)`,
        needsTarget: true,
        disabledReason: cdReason(actor, 3) ?? (targets.length === 0 ? 'Нет целей' : null),
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 4: {
      const targets = allies.filter((unit) => unit.heroClassCode !== 'Angel');
      return {
        slot: 4,
        label: 'Минута славы',
        needsTarget: true,
        disabledReason: cdReason(actor, 4) ?? (targets.length === 0 ? 'Нет союзников' : null),
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 5: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 5,
        label: 'Кровь за Веру',
        needsTarget: true,
        attackKind: 'magic',
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
  }
}

/**
 * Angel: двойное лечение, вард смертельного удара, перенос / кара, сброс КД, святая атака.
 */
export const angelAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  preChoice(state, actor) {
    tickSlotCds(actor);
    const fighters = alliesOf(state, actor).filter(
      (unit) => unit.id !== actor.id && (unit.power > 20 || unit.damage > 20)
    );
    const champion = fighters[randInt(0, fighters.length - 1)];
    if (!champion) {
      return;
    }
    const luck = 15 + actor.lvl;
    grantEffect(champion, 'LUCKY', 1, luck);
    state.log.push(`${actor.displayName} избирает чемпиона: ${champion.displayName} (+${luck} удачи).`);
  },

  apply(state, actor, input): AbilityOutcome {
    if (state.pendingPrompt?.unitId === actor.id) {
      return resolveSecondHeal(state, actor, input.choice);
    }
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }
    const target = state.units.find(
      (unit) => unit.id === input.targetId && meta.legalTargetIds.includes(unit.id)
    );
    if (!target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }

    if (input.slot === 1) {
      healWithCrit(state, actor, target, Math.floor(actor.power / 2));
      const others = alliesOf(state, actor).filter((unit) => unit.id !== target.id);
      if (others.length === 0) {
        return { status: 'done' };
      }
      state.pendingPrompt = {
        unitId: actor.id,
        kind: PROMPT_SECOND_HEAL,
        slot: 1,
        options: others.map((unit) => ({ id: unit.id, label: unitChoiceLabel(unit) })),
        context: { firstTargetId: target.id },
      };
      state.log.push(`${actor.displayName}: выберите вторую цель лечения.`);
      return { status: 'pending' };
    }

    if (input.slot === 2) {
      setSlotCd(actor, 2, 3);
      grantEffect(target, 'DEATHWARD', 2, 100);
      state.log.push(`${actor.displayName} сковывает смерть оковами войны: ${target.displayName} не падёт от смертельного удара.`);
      return { status: 'done' };
    }

    if (input.slot === 3) {
      if (target.team === actor.team) {
        const targetRow = target.row === 0 ? 1 : 0;
        const rowCount = state.units.filter(
          (unit) => unit.alive && unit.team === target.team && unit.row === targetRow
        ).length;
        if (rowCount >= state.rules.maxRowSize) {
          return { status: 'reject', message: 'На другом ряду нет места' };
        }
        setSlotCd(actor, 3, 2);
        moveToOtherRow(target);
        state.log.push(
          `${actor.displayName} переносит ${target.displayName} на ${targetRow === 0 ? 'передний' : 'задний'} ряд.`
        );
        return { status: 'done' };
      }
      setSlotCd(actor, 3, 2);
      const amount = Math.max(1, Math.round((target.health * wingsPercent(actor)) / 100));
      const dealt = harmWithSource(state, target, amount, 'DEFAULT');
      state.log.push(
        `${actor.displayName} спрашивает ${target.displayName}, где его крылья, и отнимает ${formatLogDamage(dealt, 'DEFAULT')} ОЗ.`
      );
      markDeadIfNeeded(state, target);
      return { status: 'done' };
    }

    if (input.slot === 4) {
      setSlotCd(actor, 4, 4);
      resetCooldowns(target);
      const bonus = 5 * actor.lvl + 10;
      grantEffect(target, 'STRENGTH', 1, bonus);
      grantEffect(target, 'ABSOLUTEPOWER', 1, bonus);
      state.log.push(
        `Минута славы: ${target.displayName} готов ко всему (+${bonus} атаки и силы магии, перезарядка сброшена).`
      );
      return { status: 'done' };
    }

    const damage = dealDamage(actor, target, { kind: 'magic', source: 'HOLY' }, state);
    if (damage > 0) {
      state.log.push(
        `${actor.displayName} проливает кровь за Веру: ${target.displayName} ${formatLastLogDamage(damage)}.`
      );
      markDeadIfNeeded(state, target);
    }
    if (target.alive && !lastDealDamageResult().missed && rollSrcChance(state, target, 70 + actor.lvl * 2, 'AIR')) {
      const removed = clearBuffs(target, state);
      if (removed > 0) {
        state.log.push(`С ${target.displayName} рассеяно положительных эффектов: ${removed}.`);
      }
    }
    actor.health -= actor.power;
    state.log.push(
      `${actor.displayName} платит за насилие ${formatLogDamage(actor.power, 'DEFAULT')} ОЗ.`
    );
    markDeadIfNeeded(state, actor);
    return { status: 'done' };
  },
};

function resolveSecondHeal(
  state: BattleState,
  actor: BattleUnit,
  choice: string | undefined
): AbilityOutcome {
  const prompt = state.pendingPrompt;
  if (!prompt || prompt.kind !== PROMPT_SECOND_HEAL || !choice) {
    return { status: 'reject', message: 'Нужен выбор' };
  }
  if (!prompt.options.some((option) => option.id === choice)) {
    return { status: 'reject', message: 'Неверный выбор' };
  }
  const target = alliesOf(state, actor).find((unit) => unit.id === choice);
  state.pendingPrompt = null;
  if (target) {
    healWithCrit(state, actor, target, Math.floor(actor.power / 2));
  }
  return { status: 'done' };
}
