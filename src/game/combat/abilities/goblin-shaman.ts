import { dealDamage, formatLastLogDamage, markDeadIfNeeded, randInt } from '../damage';
import { addMana, grantEffect, healUnit, trySpendMana } from '../effects';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { alliesOf, enemiesOf, unitsOnSameRow } from './targets';
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
      return {
        slot: 1,
        label: 'Степная буря (2 МР)',
        needsTarget: true,
        disabledReason:
          actor.mana < 2
            ? 'Нужно 2 МР'
            : targets.length === 0
              ? 'Нет целей'
              : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const allies = alliesOf(state, actor);
      return {
        slot: 2,
        label: 'Кротовый отвар (2 МР)',
        needsTarget: true,
        disabledReason:
          actor.mana < 2
            ? 'Нужно 2 МР'
            : allies.length === 0
              ? 'Нет союзников'
              : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 3: {
      const master = findMaster(state, actor);
      return {
        slot: 3,
        label: 'Отправиться к праотцам',
        needsTarget: false,
        disabledReason: master ? null : 'Нет повелителя',
        legalTargetIds: [],
      };
    }
    case 4: {
      const master = findMaster(state, actor);
      return {
        slot: 4,
        label: 'Поцелуй Лепрекона (3 МР)',
        needsTarget: false,
        disabledReason:
          actor.mana < 3
            ? 'Нужно 3 МР'
            : master
              ? null
              : 'Нет повелителя',
        legalTargetIds: [],
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
 * GoblinShaman: буря по ряду, отвар, жертва, удача хозяину.
 */
export const goblinShamanAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  apply(state, actor, input): AbilityOutcome {
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      const err = trySpendMana(actor, 2);
      if (err) {
        return { status: 'reject', message: err };
      }
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        addMana(actor, 2);
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const row = unitsOnSameRow(state, target).filter((unit) => unit.team !== actor.team);
      for (const enemy of row) {
        const damage = dealDamage(
          actor,
          enemy,
          { damageMult: 1, armorIgnore: 0, source: 'AIR', forceStyle: 'magic' },
          state
        );
        if (damage === 0) {
          state.log.push(`${actor.displayName}: буря — промах по ${enemy.displayName}.`);
        } else {
          state.log.push(
            `Зачарованная гроза нанесла ${formatLastLogDamage(damage)} урона ${enemy.displayName}.`
          );
          markDeadIfNeeded(state, enemy);
        }
      }
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const err = trySpendMana(actor, 2);
      if (err) {
        return { status: 'reject', message: err };
      }
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        addMana(actor, 2);
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const accDelta = randInt(-3, 4 + actor.lvl);
      const luckDelta = randInt(-3, 4 + actor.lvl);
      target.accuracy += accDelta;
      target.luck += luckDelta;
      state.log.push(
        `${actor.displayName}: отвар — ${target.displayName}: точность ${accDelta >= 0 ? '+' : ''}${accDelta}, удача ${luckDelta >= 0 ? '+' : ''}${luckDelta}.`
      );
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const master = findMaster(state, actor);
      if (!master) {
        return { status: 'reject', message: 'Нет повелителя' };
      }
      const healed = healUnit(master, actor.health);
      state.log.push(
        `${actor.displayName} жертвует собой — ${master.displayName} восстанавливает ${healed} ОЗ.`
      );
      actor.health = 0;
      markDeadIfNeeded(state, actor);
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const err = trySpendMana(actor, 3);
      if (err) {
        return { status: 'reject', message: err };
      }
      const master = findMaster(state, actor);
      if (!master) {
        addMana(actor, 3);
        return { status: 'reject', message: 'Нет повелителя' };
      }
      const power = 20 + actor.lvl;
      grantEffect(master, 'LUCKY', 1, power);
      state.log.push(
        `${actor.displayName}: поцелуй лепрекона — удача ${master.displayName} +${power}.`
      );
      return { status: 'done' };
    }

    return { status: 'reject', message: 'Используйте защиту / ожидание' };
  },
};
