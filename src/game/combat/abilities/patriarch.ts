import { dealDamage, markDeadIfNeeded, PILOT_LVL, randInt } from '../damage';
import { grantEffect, healUnit, trySpendMana } from '../effects';
import { ROW_BACK } from '../settings';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { alliesOf, enemiesInColumn, enemiesOf } from './targets';
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
        label: 'Гнев богов',
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
        label: 'Изобильный свет',
        needsTarget: true,
        disabledReason:
          actor.mana < 3
            ? 'Нужно 3 МР'
            : allies.length === 0
              ? 'Нет союзников'
              : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 3: {
      const options = state.graveyard.filter((entry) => entry.team === actor.team);
      return {
        slot: 3,
        label: 'Милость Младшего',
        needsTarget: false,
        disabledReason:
          actor.row !== ROW_BACK
            ? 'Нужен задний ряд'
            : actor.mana < 5
              ? 'Нужно 5 МР'
              : options.length === 0
                ? 'Кладбище пусто'
                : null,
        legalTargetIds: [],
      };
    }
    case 4: {
      const allies = alliesOf(state, actor);
      return {
        slot: 4,
        label: `Святилище (${actor.ultaCharges})`,
        needsTarget: true,
        disabledReason:
          actor.ultaCharges <= 0
            ? 'Нет зарядов'
            : allies.length === 0
              ? 'Нет союзников'
              : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 5:
      return {
        slot: 5,
        label: 'Базовые действия',
        needsTarget: false,
        disabledReason: 'Используйте защиту / ожидание',
        legalTargetIds: [],
      };
  }
}

function resolveResurrect(
  state: BattleState,
  actor: BattleUnit,
  choice: string | undefined
): AbilityOutcome {
  const prompt = state.pendingPrompt;
  if (!prompt || !choice) {
    return { status: 'reject', message: 'Нужен выбор' };
  }
  if (choice === 'cancel') {
    state.pendingPrompt = null;
    actor.mana += 5;
    state.log.push(`${actor.displayName} отменяет воскрешение.`);
    return { status: 'done' };
  }
  if (!prompt.options.some((option) => option.id === choice)) {
    return { status: 'reject', message: 'Неверный выбор' };
  }
  const entry = state.graveyard.find((item) => item.unitId === choice);
  state.pendingPrompt = null;
  if (!entry || entry.team !== actor.team) {
    return { status: 'reject', message: 'Нет на кладбище' };
  }
  if (entry.forbiddenResurrect) {
    return { status: 'reject', message: 'Цель нельзя воскресить' };
  }
  const unit = state.units.find((item) => item.id === entry.unitId);
  if (!unit) {
    return { status: 'reject', message: 'Юнит не найден' };
  }
  unit.alive = true;
  unit.health = Math.max(1, Math.floor(unit.maxHp / 2));
  unit.defending = false;
  state.graveyard = state.graveyard.filter((item) => item.unitId !== unit.id);
  if (randInt(1, 100) <= 50) {
    unit.forbiddenResurrect = true;
  }
  state.log.push(`${actor.displayName} воскрешает ${unit.displayName}.`);
  return { status: 'done' };
}

/**
 * Patriarch: колонка, heal, resurrect, SANCTUM.
 */
export const patriarchAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  apply(state, actor, input): AbilityOutcome {
    if (state.pendingPrompt?.unitId === actor.id) {
      return resolveResurrect(state, actor, input.choice);
    }

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
        return { status: 'reject', message: 'Цель не найдена' };
      }
      for (const enemy of enemiesInColumn(state, actor, target)) {
        const damage = dealDamage(actor, enemy, { damageMult: 1, armorIgnore: 0.1 }, state);
        if (damage > 0) {
          state.log.push(
            `${actor.displayName}: гнев богов → ${enemy.displayName} (${damage}).`
          );
          markDeadIfNeeded(state, enemy);
        }
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
        return { status: 'reject', message: 'Нужен союзник' };
      }
      const amount = PILOT_LVL * 7 + Math.floor(actor.power / 3);
      const healed = healUnit(target, amount);
      state.log.push(`${actor.displayName} исцеляет ${target.displayName} (+${healed}).`);
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const err = trySpendMana(actor, 5);
      if (err) {
        return { status: 'reject', message: err };
      }
      const options = state.graveyard
        .filter((entry) => entry.team === actor.team)
        .map((entry) => ({
          id: entry.unitId,
          label: entry.forbiddenResurrect
            ? `${entry.displayName} (нельзя)`
            : entry.displayName,
        }));
      options.push({ id: 'cancel', label: 'Отмена' });
      state.pendingPrompt = {
        unitId: actor.id,
        kind: 'patriarch_resurrect',
        slot: 3,
        options,
        context: {},
      };
      state.log.push(`${actor.displayName}: выберите, кого воскресить.`);
      return { status: 'pending' };
    }

    if (input.slot === 4) {
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Нужен союзник' };
      }
      actor.ultaCharges -= 1;
      grantEffect(target, 'SANCTUM', 2 + Math.floor(PILOT_LVL / 5), 0);
      state.log.push(`${target.displayName} под святилищем.`);
      return { status: 'done' };
    }

    return { status: 'reject', message: 'Используйте защиту / ожидание' };
  },
};
