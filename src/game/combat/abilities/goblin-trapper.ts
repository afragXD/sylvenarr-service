import { dealDamage, markDeadIfNeeded, randInt, formatLastLogDamage } from '../damage';
import { grantEffect } from '../effects';
import { levelUpUnit } from '../level';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { alliesOf, enemiesOf } from './targets';
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
      const targets = enemiesOf(state, actor);
      const poisonChance = 75 + actor.lvl * 2;
      return {
        slot: 1,
        label: `Хитиновый лук | Яд (${poisonChance}%)`,
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 2,
        label: `Кража золота (${65 + actor.lvl * 2}%)`,
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 3,
        label: 'Шпионаж',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 4: {
      const allies = alliesOf(state, actor);
      return {
        slot: 4,
        label: 'Сладкие радости',
        needsTarget: true,
        disabledReason: allies.length === 0 ? 'Нет союзников' : null,
        legalTargetIds: allies.map((unit) => unit.id),
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
 * GoblinTrapper: лук+яд, кража золота, шпионаж, ускорение.
 */
export const goblinTrapperAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  apply(state, actor, input): AbilityOutcome {
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const damage = dealDamage(
        actor,
        target,
        { damageMult: 1, armorIgnore: 0, source: 'ARROWS', forceStyle: 'ranged' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: лук — промах.`);
        return { status: 'done' };
      }
      state.log.push(`${actor.displayName} стреляет в ${target.displayName} ${formatLastLogDamage(damage)}.`);
      if (randInt(1, 100) <= 75 + actor.lvl * 2) {
        grantEffect(target, 'POISON', 1 + Math.floor(actor.lvl / 5), 0.9);
        state.log.push(`${target.displayName} отравлен ядом гоблина.`);
      }
      markDeadIfNeeded(state, target);
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      if (randInt(1, 100) <= 65 + actor.lvl * 2) {
        const master = findMaster(state, actor);
        const masterLvl = master?.lvl ?? actor.lvl;
        const stolen = Math.min(randInt(60, 100 + masterLvl * 15), target.gold);
        if (stolen <= 0) {
          return { status: 'reject', message: 'У цели нет золота' };
        }
        target.gold -= stolen;
        actor.gold += stolen;
        state.log.push(`${actor.displayName} крадёт ${stolen} монет у ${target.displayName}.`);
      } else {
        actor.health = randInt(-3, 0);
        state.log.push(
          `Кража провалилась — ${actor.displayName} едва избежал петли (${actor.health} ОЗ).`
        );
        markDeadIfNeeded(state, actor);
      }
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      state.log.push(
        `Шпионаж: у ${target.displayName} ${target.gold} золота, ${target.health}/${target.maxHp} ОЗ, ур. ${target.lvl}.`
      );
      levelUpUnit(actor, 1, state);
      state.log.push(`${actor.displayName} чувствует себя опытнее (+1 уровень).`);
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      grantEffect(target, 'HASTE', 2, 25);
      state.log.push(`${actor.displayName}: ${target.displayName} ускорен (+25 ини).`);
      return { status: 'done' };
    }

    return { status: 'reject', message: 'Используйте защиту / ожидание' };
  },
};
