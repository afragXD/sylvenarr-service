import { resolveAttackStyle } from '../attack-style';
import { dealDamage, markDeadIfNeeded, randInt } from '../damage';
import { resistsForClass } from '../defaultResists';
import { grantEffect, hasEffect } from '../effects';
import { isArtificialClass, isUndeadClass } from '../races';
import { ROW_FRONT } from '../settings';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { enemiesOf, listAttackTargets } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

/** Множитель резиста к источнику без траты варда (для морали). */
function mindResistFactor(unit: BattleUnit): number {
  const entry = unit.resists.MIND;
  if (!entry) {
    return 1;
  }
  if (entry.immune) {
    return 0;
  }
  const value = entry.value;
  return value > 0 ? Math.max(0, 1 - value / 100) : 1 + Math.abs(value) / 100;
}

function transformToZombie(state: BattleState, target: BattleUnit): boolean {
  const hero = state.catalog.Zombie;
  if (!hero) {
    target.heroClassCode = 'Zombie';
    target.displayName = 'Зомби';
    return false;
  }
  const ratio = target.maxHp > 0 ? target.health / target.maxHp : 1;
  const maxHp = Math.max(1, Math.round(hero.health * state.rules.healthBonus));
  target.heroClassCode = hero.code;
  target.displayName = hero.displayName;
  target.maxHp = maxHp;
  target.health = Math.max(1, Math.min(maxHp, Math.round(maxHp * ratio)));
  target.damage = hero.damage;
  target.armor = hero.armor;
  target.initiative = hero.initiative;
  target.dodge = hero.dodge;
  target.luck = hero.luck;
  target.accuracy = hero.accuracy;
  target.power = hero.power;
  target.attackStyle = resolveAttackStyle(hero.code);
  target.resists = resistsForClass(hero.code);
  target.morale = hero.morale ?? target.morale;
  return true;
}

function abilityMeta(
  state: BattleState,
  actor: BattleUnit,
  slot: AbilitySlot
): AbilityInfo {
  switch (slot) {
    case 1: {
      const targets = listAttackTargets(state, actor);
      return {
        slot: 1,
        label: 'Укус вслепую',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const targets = enemiesOf(state, actor).filter(
        (unit) =>
          unit.row === ROW_FRONT &&
          !isUndeadClass(unit.heroClassCode) &&
          !isArtificialClass(unit.heroClassCode)
      );
      return {
        slot: 2,
        label: `Заразное касание (${60 + actor.lvl * 2}%)`,
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3: {
      const chance = Math.min(60, 22 + actor.lvl * 3);
      const targets = enemiesOf(state, actor).filter(
        (unit) =>
          unit.isSummon &&
          !isUndeadClass(unit.heroClassCode) &&
          !isArtificialClass(unit.heroClassCode)
      );
      return {
        slot: 3,
        label: `Инфицирование (${chance}%)`,
        needsTarget: true,
        disabledReason:
          actor.lvl < 6
            ? 'Нужен 6+ уровень'
            : targets.length === 0
              ? 'Нет целей'
              : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    default:
      return {
        slot,
        label: '—',
        needsTarget: false,
        disabledReason: 'Нет способности',
        legalTargetIds: [],
      };
  }
}

/**
 * Zombie: укус с моралью, пепельная язва, инфицирование саммона.
 */
export const zombieAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  apply(state, actor, input): AbilityOutcome {
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      const target = listAttackTargets(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const marked = hasEffect(target, 'MARKED');
      if (marked) {
        actor.accuracy += 25;
      }
      const damage = dealDamage(
        actor,
        target,
        { damageMult: 1, armorIgnore: 0, source: 'WEAPON' },
        state
      );
      if (marked) {
        actor.accuracy -= 25;
      }
      if (damage === 0) {
        state.log.push(`${actor.displayName}: укус — промах.`);
        return { status: 'done' };
      }
      state.log.push(`${actor.displayName} кусает ${target.displayName} (${damage}).`);
      const cf = target.morale <= 0 ? 1 : 1.5;
      const dirt = Math.round(randInt(3, 4 + actor.lvl) * mindResistFactor(target) * cf);
      if (dirt > 0) {
        target.morale -= dirt;
        state.log.push(
          `${target.displayName} теряет ${dirt} боевого духа от укуса ${actor.displayName}.`
        );
      }
      markDeadIfNeeded(state, target);
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      if (target.row !== ROW_FRONT) {
        return { status: 'reject', message: 'Только передний ряд' };
      }
      if (isUndeadClass(target.heroClassCode) || isArtificialClass(target.heroClassCode)) {
        return { status: 'reject', message: 'Нежить и механизмы невосприимчивы' };
      }
      if (randInt(1, 100) <= 60 + actor.lvl * 2) {
        grantEffect(target, 'ASHILLNESS', 1 + Math.floor(actor.lvl / 5), 0.25);
        state.log.push(`${target.displayName} заражён пепельной язвой.`);
      } else {
        state.log.push(`Спасбросок: ${target.displayName} избежал болезни.`);
      }
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      if (!target.isSummon) {
        return { status: 'reject', message: 'Нужен саммон противника' };
      }
      if (isUndeadClass(target.heroClassCode) || isArtificialClass(target.heroClassCode)) {
        return { status: 'reject', message: 'Нельзя заразить нежить или механизм' };
      }
      if (randInt(1, 100) <= Math.min(60, 22 + actor.lvl * 3)) {
        const oldName = target.displayName;
        transformToZombie(state, target);
        state.log.push(`МОЗГИ! ${actor.displayName} превратил ${oldName} в зомби!`);
      } else {
        target.damage = Math.max(0, target.damage - actor.lvl);
        state.log.push(
          `Заражение не прошло — урон ${target.displayName} снижен на ${actor.lvl}.`
        );
      }
      return { status: 'done' };
    }

    return { status: 'reject', message: 'Используйте защиту / ожидание' };
  },
};
