import { dealDamage, markDeadIfNeeded, randInt } from '../damage';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { createSummon } from './summon';
import { enemiesOf } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

function findMaster(state: BattleState, actor: BattleUnit): BattleUnit | null {
  if (!actor.summonerId) {
    return null;
  }
  return state.units.find((unit) => unit.id === actor.summonerId && unit.alive) ?? null;
}

function countEctoplasmOnTeam(state: BattleState, team: 0 | 1): number {
  return state.units.filter(
    (unit) => unit.alive && unit.team === team && unit.heroClassCode === 'Ectoplasm'
  ).length;
}

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
        label: 'Шлепок слизи',
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
 * Ectoplasm: магический шлепок водой; preChoice — размножение при ранении.
 */
export const ectoplasmAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  preChoice(state, actor) {
    if (actor.health >= actor.maxHp) {
      return;
    }
    const count = countEctoplasmOnTeam(state, actor.team);
    const chance = 65 - 20 * count;
    if (chance <= 0 || randInt(1, 100) > chance) {
      return;
    }
    const master = findMaster(state, actor) ?? actor;
    const prevMax = master.maxSummons;
    master.maxSummons = Math.max(prevMax, 99);
    const child = createSummon(state, {
      summoner: master,
      heroCode: 'Ectoplasm',
      row: actor.row,
    });
    master.maxSummons = prevMax;
    if (child) {
      state.log.push(`Коварная эктоплазма размножилась от удара!`);
    }
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
        { damageMult: 1, armorIgnore: 0, source: 'WATER', forceStyle: 'magic' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: шлепок — промах.`);
        return { status: 'done' };
      }
      state.log.push(
        `${actor.displayName} шлёпает слизью ${target.displayName} (${damage}).`
      );
      markDeadIfNeeded(state, target);
      return { status: 'done' };
    }

    return { status: 'reject', message: 'Используйте защиту / ожидание' };
  },
};
