import { dealDamage, formatLastLogDamage, markDeadIfNeeded, randInt } from '../damage';
import { delEffect, grantEffect, hasEffect, healUnit, trySpendMana } from '../effects';
import { levelUpUnit } from '../level';
import { rollSrcChance } from '../resists';
import { transformClassOnly } from '../transform';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { cdReason, setSlotCd, tickSlotCds } from './cooldowns';
import { degradationSquareTargets, enemiesOf, meleeOrAll } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

/** Базовый шанс Массовой деградации (CUT AC-9). */
export function massDegradationBaseChance(lvl: number): number {
  return Math.min(95, 85 + lvl);
}

/** Потеря уровней: основная цель L//5+1, остальные L//6+1. */
export function massDegradationLevelLoss(lvl: number, isPrimary: boolean): number {
  return isPrimary ? Math.floor(lvl / 5) + 1 : Math.floor(lvl / 6) + 1;
}

function abilityMeta(state: BattleState, actor: BattleUnit, slot: AbilitySlot): AbilityInfo {
  switch (slot) {
    case 1: {
      const ranged = actor.gun > 0;
      const targets = ranged ? enemiesOf(state, actor) : meleeOrAll(state, actor, false);
      return {
        slot: 1,
        label: ranged ? `Револьвер (${actor.gun})` : 'Каблучок',
        needsTarget: true,
        attackKind: ranged ? 'ranged' : 'melee',
        previewSource: ranged ? 'ARROWS' : 'WEAPON',
        previewArmorIgnore: ranged ? 0.2 : 0.5,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const targets = meleeOrAll(state, actor, false);
      return {
        slot: 2,
        label: 'Молочные клыки',
        needsTarget: true,
        attackKind: 'magic',
        previewSource: 'DEATH',
        previewArmorIgnore: 0.15,
        disabledReason: actor.mana < 3 ? 'Нужно 3 МР' : targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 3,
        label: 'Смертный приговор',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 4: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 4,
        label: 'Массовая деградация',
        needsTarget: true,
        disabledReason:
          cdReason(actor, 4, 3) ??
          (actor.mana < 5 ? 'Нужно 5 МР' : targets.length === 0 ? 'Нет целей' : null),
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 5: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 5,
        label: 'Превращение',
        needsTarget: true,
        disabledReason:
          cdReason(actor, 5, 3) ??
          (actor.mana < 4 ? 'Нужно 4 МР' : targets.length === 0 ? 'Нет целей' : null),
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
  }
}

/**
 * Witch: револьвер/каблук, вампиризм, метка, деградация, превращение в беса.
 */
export const witchAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  preChoice(_state, actor) {
    tickSlotCds(actor);
  },

  apply(state, actor, input): AbilityOutcome {
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      if (actor.gun > 0) {
        const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
        if (!target) {
          return { status: 'reject', message: 'Цель не найдена' };
        }
        const fire = (label: string) => {
          const damage = dealDamage(
            actor,
            target,
            { kind: 'ranged', damageMult: 1, armorIgnore: 0.2, source: 'ARROWS' },
            state
          );
          if (damage === 0) {
            state.log.push(`${actor.displayName}: ${label} — промах.`);
          } else {
            state.log.push(
              `${actor.displayName} стреляет в ${target.displayName} ${formatLastLogDamage(damage)}.`
            );
            markDeadIfNeeded(state, target);
          }
          actor.gun -= 1;
        };
        fire('Револьвер');
        // AM: lvl>8 && 75%; при actor.lvl=5 — 25% proxy «двойного выстрела»
        if (actor.gun > 0 && target.alive && randInt(1, 100) <= 25) {
          fire('Второй выстрел');
          actor.morale += 5;
        }
        return { status: 'done' };
      }
      const target = meleeOrAll(state, actor, false).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const damage = dealDamage(
        actor,
        target,
        { kind: 'melee', damageMult: 1, armorIgnore: 0.5, source: 'WEAPON' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: каблучок — промах.`);
      } else {
        state.log.push(
          `${actor.displayName} бьёт каблучком ${target.displayName} ${formatLastLogDamage(damage)}.`
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
      const target = meleeOrAll(state, actor, false).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const damage = dealDamage(
        actor,
        target,
        { kind: 'magic', damageMult: 1, armorIgnore: 0.15, source: 'DEATH' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: клыки — промах.`);
      } else {
        const healed = healUnit(actor, Math.max(1, Math.round(damage / 3 + target.health * 0.12)));
        state.log.push(
          `${actor.displayName} кусает ${target.displayName} ${formatLastLogDamage(damage)}, +${healed} ОЗ.`
        );
        markDeadIfNeeded(state, target);
      }
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      grantEffect(target, 'MARKED', 2 + Math.floor(actor.lvl / 6), 0);
      grantEffect(target, 'DEATHSENTENCE', 2, 5 + Math.floor((25 + actor.lvl * 2) / 10));
      state.log.push(`${actor.displayName} выносит смертный приговор ${target.displayName}.`);
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const err = trySpendMana(actor, 5);
      if (err) {
        return { status: 'reject', message: err };
      }
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель недоступна' };
      }
      setSlotCd(actor, 4, 3);
      const square = degradationSquareTargets(state, actor, target);
      let chance = massDegradationBaseChance(actor.lvl);
      state.log.push(
        `${actor.displayName}: массовая деградация по квадрату (${square.length} цел., старт ${chance}%).`
      );
      for (const unit of square) {
        const isPrimary = unit.id === target.id;
        // Chance через MIND + LOWERINGLEVEL; успех −15 п.п. к следующей, провал — шанс не падает.
        if (rollSrcChance(state, unit, chance, 'MIND', 'LOWERINGLEVEL')) {
          const n = massDegradationLevelLoss(actor.lvl, isPrimary);
          const before = unit.lvl;
          levelUpUnit(unit, -n, state);
          state.log.push(
            `${actor.displayName}: деградация ${unit.displayName} (−${before - unit.lvl} ур., шанс был ${chance}%).`
          );
          chance = Math.max(0, chance - 15);
        } else {
          state.log.push(
            `${actor.displayName}: деградация ${unit.displayName} не сработала (шанс ${chance}% сохранён).`
          );
        }
      }
      return { status: 'done' };
    }

    // slot 5 — порт fifthAction: transformToAnotherClass(Imp) + arm=0 + IMPISH 2
    const err = trySpendMana(actor, 4);
    if (err) {
      return { status: 'reject', message: err };
    }
    const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
    if (!target) {
      return { status: 'reject', message: 'Цель недоступна' };
    }
    setSlotCd(actor, 5, 3);
    if (rollSrcChance(state, target, 100, 'EARTH', 'POLYMORPH')) {
      if (hasEffect(target, 'IMPISH')) {
        delEffect(target, 'IMPISH', state);
      }
      const victimName = target.displayName;
      if (!target.transformParentCode) {
        target.transformParentCode = target.heroClassCode;
      }
      target.polymorphSavedArmor = target.armor;
      target.armor = 0;
      if (!transformClassOnly(state, target, 'Imp')) {
        target.armor = target.polymorphSavedArmor;
        target.polymorphSavedArmor = -1;
        if (target.transformParentCode === target.heroClassCode) {
          target.transformParentCode = null;
        }
        state.log.push(`${actor.displayName}: в каталоге нет беса — превращение сорвалось.`);
        return { status: 'done' };
      }
      // CUT-2026-11-01c AC-4: Форма беса 1 раунд (было 2), шанс 100%.
      grantEffect(target, 'IMPISH', 1, 0);
      state.log.push(
        `${actor.displayName} обращает ${victimName} в жалкого беса (без особых атак и брони).`
      );
    } else {
      state.log.push(`${actor.displayName}: превращение заблокировано сопротивлением.`);
    }
    return { status: 'done' };
  },
};
