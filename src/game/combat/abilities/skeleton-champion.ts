import { dealDamage, markDeadIfNeeded, randInt, formatLastLogDamage } from '../damage';
import { grantEffect } from '../effects';
import { changeResist } from '../resists';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { enemiesOf, listAttackTargets } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

function findMaster(state: BattleState, actor: BattleUnit): BattleUnit | null {
  if (!actor.summonerId) {
    return null;
  }
  return state.units.find((unit) => unit.id === actor.summonerId && unit.alive) ?? null;
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
        label: 'Боевой молот',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 2,
        label: 'Псалом неупокоенных',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3: {
      const master = findMaster(state, actor);
      return {
        slot: 3,
        label: 'Костяной щит',
        needsTarget: false,
        disabledReason: master ? null : 'Нет хозяина',
        legalTargetIds: [],
      };
    }
    case 4: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 4,
        label: 'Контракт на убийство',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
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
 * SkeletonChampion: молот с разбитием брони, псалом, охрана, метка.
 */
export const skeletonChampionAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
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
      const master = findMaster(state, actor);
      const damage = dealDamage(
        actor,
        target,
        { damageMult: 1, armorIgnore: 0, source: 'WEAPON' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: молот — промах.`);
        return { status: 'done' };
      }
      const masterLvl = master?.lvl ?? actor.lvl;
      const destroyed = Math.min(target.armor, randInt(5, 10 + masterLvl));
      target.armor = Math.max(0, target.armor - destroyed);
      state.log.push(
        `${actor.displayName} бьёт молотом ${target.displayName} ${formatLastLogDamage(damage)}, уничтожено ${destroyed} брони.`
      );
      markDeadIfNeeded(state, target);
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const delta = -randInt(6, 10);
      changeResist(target, 'DEATH', delta);
      const master = findMaster(state, actor);
      const accBonus = (master?.lvl ?? actor.lvl) + 2;
      actor.accuracy += accBonus;
      state.log.push(
        `${actor.displayName}: псалом — ${target.displayName} слабее к смерти (${delta}), +${accBonus} точности.`
      );
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const master = findMaster(state, actor);
      if (!master) {
        return { status: 'reject', message: 'Нет цели для защиты' };
      }
      grantEffect(master, 'GUARDED', 1);
      grantEffect(actor, 'CONTR', 2);
      state.log.push(`${master.displayName} теперь под охраной ${actor.displayName}.`);
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      grantEffect(target, 'MARKED', 3);
      grantEffect(target, 'FATMAN', 2, 20 + actor.lvl);
      state.log.push(
        `${actor.displayName} открывает охоту на ${target.displayName} — метка и слабость в ногах.`
      );
      return { status: 'done' };
    }

    return { status: 'reject', message: 'Используйте защиту / ожидание' };
  },
};
