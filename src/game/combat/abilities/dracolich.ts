import { dealDamage, markDeadIfNeeded, randInt } from '../damage';
import { grantEffect, hasEffect, healUnit, resurrectUnit } from '../effects';
import { isUndeadClass } from '../races';
import { ROW_FRONT } from '../settings';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { enemiesOf } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

function lowHpDamageMult(actor: BattleUnit): number {
  return 1 + (1 - actor.health / actor.maxHp) * 0.36;
}

function meleeTargets(state: BattleState, actor: BattleUnit): BattleUnit[] {
  const enemies = enemiesOf(state, actor);
  const frontAlive = state.units.filter(
    (unit) => unit.alive && unit.team !== actor.team && unit.row === ROW_FRONT
  );
  if (frontAlive.length > 0) {
    return enemies.filter((unit) => unit.row === ROW_FRONT);
  }
  return enemies;
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
        label: 'Дыхание смерти',
        needsTarget: false,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: [],
      };
    }
    case 2: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 2,
        label: 'Гнилые испарения',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3: {
      const targets = enemiesOf(state, actor).filter(
        (unit) => unit.health < unit.maxHp * 0.2
      );
      return {
        slot: 3,
        label: 'Пожирание',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет ослабленных целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 4: {
      const options = state.graveyard.filter(
        (entry) =>
          entry.team === actor.team &&
          !entry.forbiddenResurrect &&
          isUndeadClass(entry.heroClassCode)
      );
      return {
        slot: 4,
        label: 'Высшая Некромантия',
        needsTarget: false,
        disabledReason: options.length === 0 ? 'Нет нежити на кладбище' : null,
        legalTargetIds: [],
      };
    }
    case 5: {
      const targets = meleeTargets(state, actor);
      return {
        slot: 5,
        label: 'Удар хвостом',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
  }
}

function resolveUndeadResurrect(
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
    state.log.push(`${actor.displayName} отменяет некромантию.`);
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
  if (entry.forbiddenResurrect || !isUndeadClass(entry.heroClassCode)) {
    return { status: 'reject', message: 'Цель нельзя воскресить' };
  }
  const unit = state.units.find((item) => item.id === entry.unitId);
  if (!unit) {
    return { status: 'reject', message: 'Юнит не найден' };
  }
  resurrectUnit(state, unit);
  state.log.push(
    `${actor.displayName} поднимает нежить: ${unit.displayName} (½ max ОЗ, ½ инициативы).`
  );
  return { status: 'done' };
}

function shuffleEnemyColumns(state: BattleState, actor: BattleUnit): void {
  for (const row of [0, 1]) {
    const rowUnits = state.units.filter(
      (unit) => unit.alive && unit.team !== actor.team && unit.row === row
    );
    if (rowUnits.length < 2) {
      continue;
    }
    const columns = rowUnits.map((unit) => unit.column);
    for (let i = columns.length - 1; i > 0; i -= 1) {
      const j = randInt(0, i);
      const tmp = columns[i]!;
      columns[i] = columns[j]!;
      columns[j] = tmp;
    }
    rowUnits.forEach((unit, index) => {
      unit.column = columns[index]!;
    });
  }
}

/**
 * Dracolich: breath AoE, shuffle+weak, execute, undead rez, marked tail; preChoice regen.
 */
export const dracolichAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  preChoice(state, actor) {
    const healed = healUnit(actor, Math.floor(actor.maxHp / 6));
    if (healed > 0) {
      state.log.push(`${actor.displayName} регенерирует ${healed} ОЗ.`);
    }
  },

  apply(state, actor, input): AbilityOutcome {
    if (state.pendingPrompt?.unitId === actor.id) {
      return resolveUndeadResurrect(state, actor, input.choice);
    }

    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      const mult = lowHpDamageMult(actor);
      for (const enemy of enemiesOf(state, actor)) {
        const damage = dealDamage(
          actor,
          enemy,
          { damageMult: mult, armorIgnore: 0.15, source: 'DEATH' },
          state
        );
        if (damage === 0) {
          state.log.push(`${actor.displayName}: дыхание — промах по ${enemy.displayName}.`);
          continue;
        }
        state.log.push(
          `${actor.displayName}: дыхание смерти → ${enemy.displayName} (${damage}).`
        );
        if (randInt(1, 100) <= 70 + actor.lvl) {
          grantEffect(enemy, 'POISON', 2, 1.3 + actor.lvl * 0.03);
        }
        markDeadIfNeeded(state, enemy);
      }
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      shuffleEnemyColumns(state, actor);
      const row = state.units.filter(
        (unit) =>
          unit.alive && unit.team === target.team && unit.row === target.row
      );
      const unluckyPower = 7 + actor.lvl * 2;
      for (const enemy of row) {
        grantEffect(enemy, 'UNLUCKY', 2, unluckyPower);
        if (randInt(1, 100) <= 85) {
          grantEffect(enemy, 'WEAKNESS', 2, Math.max(1, Math.round(enemy.damage * 0.5)));
          state.log.push(
            `${actor.displayName}: ${enemy.displayName} ослаблен гнилью.`
          );
        } else {
          state.log.push(
            `${actor.displayName}: ${enemy.displayName} теряет боевой дух.`
          );
        }
      }
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      if (target.health >= target.maxHp * 0.2) {
        return { status: 'reject', message: 'Слишком много жизненных сил' };
      }
      target.health = 0;
      markDeadIfNeeded(state, target);
      state.log.push(
        `${actor.displayName} пожирает ослабевшего ${target.displayName}.`
      );
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const options = state.graveyard
        .filter(
          (entry) =>
            entry.team === actor.team &&
            !entry.forbiddenResurrect &&
            isUndeadClass(entry.heroClassCode)
        )
        .map((entry) => ({
          id: entry.unitId,
          label: entry.displayName,
        }));
      options.push({ id: 'cancel', label: 'Отмена' });
      state.pendingPrompt = {
        unitId: actor.id,
        kind: 'dracolich_resurrect',
        slot: 4,
        options,
        context: {},
      };
      state.log.push(`${actor.displayName} взывает к нежити на кладбище.`);
      return { status: 'pending' };
    }

    if (input.slot === 5) {
      const target = meleeTargets(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const armorIgnore = hasEffect(target, 'MARKED') ? 0.75 : 0;
      const damage = dealDamage(
        actor,
        target,
        { damageMult: 1, armorIgnore, source: 'WEAPON' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: хвост — промах.`);
      } else {
        state.log.push(
          `${actor.displayName} бьёт хвостом ${target.displayName} (${damage}).`
        );
        markDeadIfNeeded(state, target);
      }
      return { status: 'done' };
    }

    return { status: 'reject', message: 'Неизвестная способность' };
  },
};
