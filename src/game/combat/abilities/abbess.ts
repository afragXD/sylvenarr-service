import { dealDamage, formatLastLogDamage, markDeadIfNeeded, randInt } from '../damage';
import { DAMAGE_SOURCE_LABELS, type DamageSource } from '../damageSources';
import { clearAllEffects, grantEffect, healUnit, trySpendMana } from '../effects';
import { levelUpUnit } from '../level';
import { setWard, rollSrcChance } from '../resists';
import { ROW_BACK } from '../settings';
import { reduceMaxHp } from '../transform';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { cdReason, setSlotCd, tickSlotCds } from './cooldowns';
import { alliesOf, enemiesOf, unitsOnSameRow, withoutHiddenEnemies } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

/** Python 3 round: halfway cases round to even. */
export function pyRound(value: number): number {
  const floor = Math.floor(value);
  const frac = value - floor;
  if (frac < 0.5) {
    return floor;
  }
  if (frac > 0.5) {
    return floor + 1;
  }
  return floor % 2 === 0 ? floor : floor + 1;
}

function abilityMeta(state: BattleState, actor: BattleUnit, slot: AbilitySlot): AbilityInfo {
  switch (slot) {
    case 1: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 1,
        label: 'Копьё Солнца',
        needsTarget: true,
        attackKind: 'magic',
        previewSource: 'HOLY',
        previewArmorIgnore: 0.1,
        disabledReason: actor.mana < 3 ? 'Нужно 3 МР' : targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const allies = alliesOf(state, actor);
      const healLo = pyRound(actor.power * 0.6);
      const healHi = pyRound(actor.power * 0.85);
      return {
        slot: 2,
        label: 'Божественная длань',
        needsTarget: true,
        previewHealMin: Math.min(healLo, healHi),
        previewHealMax: Math.max(healLo, healHi),
        disabledReason:
          actor.mana < 3
            ? 'Нужно 3 МР'
            : actor.row !== ROW_BACK
              ? 'Нужен задний ряд'
              : allies.length === 0
                ? 'Нет союзников'
                : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 3: {
      const allies = alliesOf(state, actor);
      return {
        slot: 3,
        label: 'Святая броня',
        needsTarget: true,
        disabledReason:
          cdReason(actor, 3, 2) ??
          (actor.mana < 3 ? 'Нужно 3 МР' : allies.length === 0 ? 'Нет союзников' : null),
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 4: {
      const targets = state.units.filter((unit) => unit.alive);
      return {
        slot: 4,
        label: 'Перерождение (2 МР)',
        needsTarget: true,
        disabledReason:
          cdReason(actor, 4, 3) ??
          (actor.mana < 2 ? 'Нужно 2 МР' : targets.length === 0 ? 'Нет целей' : null),
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 5: {
      const allies = alliesOf(state, actor);
      return {
        slot: 5,
        label: 'Призыв к оружию (3 МР)',
        needsTarget: true,
        disabledReason:
          cdReason(actor, 5, 4) ??
          (actor.mana < 3 ? 'Нужно 3 МР' : allies.length === 0 ? 'Нет союзников' : null),
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
  }
}

/**
 * Abbess: святая магия, массовый heal, броня, dispel ряда, CONTR.
 */
export const abbessAbilities: AbilityHandler = {
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
      const err = trySpendMana(actor, 3);
      if (err) {
        return { status: 'reject', message: err };
      }
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const damage = dealDamage(
        actor,
        target,
        { kind: 'magic', damageMult: 1, armorIgnore: 0.1, source: 'HOLY' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: Копьё Солнца — промах.`);
      } else {
        state.log.push(
          `${actor.displayName} поражает ${target.displayName} Копьём Солнца ${formatLastLogDamage(damage)}.`
        );
        if (randInt(1, 100) <= 75 + actor.lvl) {
          grantEffect(target, 'SLOW', 2, 15 + actor.lvl);
          state.log.push(`${target.displayName} замедлен.`);
        }
        if (randInt(1, 100) <= 25 + actor.lvl) {
          target.forbiddenResurrect = true;
          state.log.push(`${target.displayName} нельзя воскресить.`);
        }
        markDeadIfNeeded(state, target);
      }
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const err = trySpendMana(actor, 3);
      if (err) {
        return { status: 'reject', message: err };
      }
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      for (const ally of unitsOnSameRow(state, target)) {
        if (ally.team !== actor.team || !ally.alive) {
          continue;
        }
        const lo = pyRound(actor.power * 0.6);
        const hi = pyRound(actor.power * 0.85);
        const amount = randInt(Math.min(lo, hi), Math.max(lo, hi));
        const healed = healUnit(ally, amount);
        state.log.push(`${ally.displayName} восстанавливает ${healed} ОЗ.`);
      }
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const err = trySpendMana(actor, 3);
      if (err) {
        return { status: 'reject', message: err };
      }
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Нужен союзник' };
      }
      setSlotCd(actor, 3, 2);
      grantEffect(target, 'STONEFLESH', 2 + Math.floor(actor.lvl / 4), 20 + actor.lvl * 2);
      // Как в боте: варды от двух разных случайных источников — себе и цели.
      const pool: DamageSource[] = [
        'FIRE',
        'AIR',
        'WEAPON',
        'ARROWS',
        'WEAPON',
        'EARTH',
        'WATER',
        'MIND',
        'DEATH',
        'STUN',
      ];
      const first = pool.splice(randInt(0, pool.length - 1), 1)[0]!;
      const second = pool.splice(randInt(0, pool.length - 1), 1)[0]!;
      setWard(actor, first, 1);
      setWard(target, second, 1);
      state.log.push(
        `${actor.displayName} дарует святую броню ${target.displayName}: себе — вард от «${DAMAGE_SOURCE_LABELS[first]}», цели — вард от «${DAMAGE_SOURCE_LABELS[second]}».`
      );
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const target = state.units.find((unit) => unit.alive && unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const err = trySpendMana(actor, 2);
      if (err) {
        return { status: 'reject', message: err };
      }
      for (const unit of withoutHiddenEnemies(actor, unitsOnSameRow(state, target))) {
        clearAllEffects(unit, state);
      }
      setSlotCd(actor, 4, 3);
      const ally = target.team === actor.team;
      if (ally && randInt(1, 100) <= 50 + actor.lvl) {
        const levels = 1 + Math.floor(target.lvl / 6);
        levelUpUnit(target, levels, state);
        state.log.push(`${actor.displayName}: перерождение поднимает ${target.displayName} на ${levels} ур.`);
      } else if (!ally && rollSrcChance(state, target, 58 + actor.lvl, 'LOWERINGLEVEL')) {
        reduceMaxHp(target, 0.85);
        state.log.push(
          `${actor.displayName}: перерождение ужимает ${target.displayName} до ${target.maxHp} ОЗ.`,
        );
      } else {
        state.log.push(`${actor.displayName}: перерождение снимает эффекты ряда ${target.displayName}.`);
      }
      return { status: 'done' };
    }

    const err = trySpendMana(actor, 3);
    if (err) {
      return { status: 'reject', message: err };
    }
    const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
    if (!target) {
      return { status: 'reject', message: 'Нужен союзник' };
    }
    for (const ally of unitsOnSameRow(state, target)) {
      grantEffect(ally, 'CONTR', 2 + Math.floor(actor.lvl / 4), 0);
    }
    setSlotCd(actor, 5, 4);
    state.log.push(`${actor.displayName} призывает ряд к оружию!`);
    return { status: 'done' };
  },
};
