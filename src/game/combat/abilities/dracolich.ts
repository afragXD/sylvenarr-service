import { dealDamage, formatLastLogDamage, markDeadIfNeeded, randInt } from '../damage';
import { grantEffect, hasEffect, healUnit, resurrectUnit } from '../effects';
import { levelUpUnit } from '../level';
import { isUndeadClass } from '../races';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { cdReason, setSlotCd, tickSlotCds } from './cooldowns';
import { enemiesOf, meleeTargets } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

const PROMPT_REZ_1 = 'dracolich_resurrect';
const PROMPT_REZ_2 = 'dracolich_resurrect_2';

function lowHpDamageMult(actor: BattleUnit): number {
  return 1 + (1 - actor.health / actor.maxHp) * 0.36;
}

function undeadGraveEntries(state: BattleState, actor: BattleUnit) {
  return state.graveyard.filter(
    (entry) =>
      entry.team === actor.team && !entry.forbiddenResurrect && isUndeadClass(entry.heroClassCode)
  );
}

function undeadAllies(state: BattleState, actor: BattleUnit): BattleUnit[] {
  return state.units.filter(
    (unit) => unit.alive && unit.team === actor.team && isUndeadClass(unit.heroClassCode)
  );
}

function isBelowExecuteThreshold(unit: BattleUnit): boolean {
  return unit.health < unit.maxHp * 0.2;
}

function abilityMeta(state: BattleState, actor: BattleUnit, slot: AbilitySlot): AbilityInfo {
  switch (slot) {
    case 1: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 1,
        label: 'Дыхание смерти',
        needsTarget: false,
        attackKind: 'magic',
        previewSource: 'DEATH',
        previewDamageMult: lowHpDamageMult(actor),
        previewArmorIgnore: 0.15,
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
      const undead = undeadAllies(state, actor);
      const levels = 1 + Math.floor(actor.lvl / 6);
      return {
        slot: 3,
        label: `Молитва нежити (+${levels} ур.)`,
        needsTarget: false,
        disabledReason: cdReason(actor, 3) ?? (undead.length === 0 ? 'Нет нежити в отряде' : null),
        legalTargetIds: [],
      };
    }
    case 4: {
      const options = undeadGraveEntries(state, actor);
      return {
        slot: 4,
        label: 'Высшая Некромантия ×2',
        needsTarget: false,
        disabledReason: options.length === 0 ? 'Нет нежити на кладбище' : null,
        legalTargetIds: [],
      };
    }
    case 5: {
      const targets = meleeTargets(state, actor);
      const anyLow = targets.some(isBelowExecuteThreshold);
      return {
        slot: 5,
        label: anyLow ? 'Пожирание гада — ЦЕЛЬ НИЖЕ 20 % ОЗ — СОЖРЁТ' : 'Пожирание гада',
        needsTarget: true,
        attackKind: 'melee',
        previewSource: 'WEAPON',
        disabledReason: cdReason(actor, 5) ?? (targets.length === 0 ? 'Нет целей' : null),
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
  }
}

function resurrectUndeadFromGrave(
  state: BattleState,
  actor: BattleUnit,
  unitId: string
): BattleUnit | null {
  const entry = state.graveyard.find((item) => item.unitId === unitId);
  if (!entry || entry.team !== actor.team) {
    return null;
  }
  if (entry.forbiddenResurrect || !isUndeadClass(entry.heroClassCode)) {
    return null;
  }
  const unit = state.units.find((item) => item.id === entry.unitId);
  if (!unit) {
    return null;
  }
  resurrectUnit(state, unit);
  state.log.push(
    `${actor.displayName} поднимает нежить: ${unit.displayName} (½ max ОЗ, ½ инициативы).`
  );
  return unit;
}

function openResurrectPrompt(
  state: BattleState,
  actor: BattleUnit,
  kind: typeof PROMPT_REZ_1 | typeof PROMPT_REZ_2,
  allowSkip: boolean
): AbilityOutcome {
  const options = undeadGraveEntries(state, actor).map((entry) => ({
    id: entry.unitId,
    label: entry.displayName,
  }));
  if (options.length === 0) {
    return { status: 'done' };
  }
  if (allowSkip) {
    options.push({ id: 'skip', label: 'Пропустить' });
  } else {
    options.push({ id: 'cancel', label: 'Отмена' });
  }
  state.pendingPrompt = {
    unitId: actor.id,
    kind,
    slot: 4,
    options,
    context: {},
  };
  state.log.push(
    kind === PROMPT_REZ_1
      ? `${actor.displayName} взывает к нежити на кладбище.`
      : `${actor.displayName}: выберите вторую цель некромантии (или пропустите).`
  );
  return { status: 'pending' };
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
  if (choice === 'skip') {
    state.pendingPrompt = null;
    state.log.push(`${actor.displayName} пропускает вторую цель некромантии.`);
    return { status: 'done' };
  }
  if (!prompt.options.some((option) => option.id === choice)) {
    return { status: 'reject', message: 'Неверный выбор' };
  }

  const isSecond = prompt.kind === PROMPT_REZ_2;
  state.pendingPrompt = null;
  const raised = resurrectUndeadFromGrave(state, actor, choice);
  if (!raised) {
    return { status: 'reject', message: 'Цель нельзя воскресить' };
  }

  if (isSecond) {
    return { status: 'done' };
  }

  // Первая цель поднята — если есть ещё трупы, второй выбор (можно skip).
  if (undeadGraveEntries(state, actor).length === 0) {
    return { status: 'done' };
  }
  return openResurrectPrompt(state, actor, PROMPT_REZ_2, true);
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
 * Dracolich: дыхание, гниль, Молитва нежити, Некромантия ×2, Пожирание гада.
 */
export const dracolichAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  preChoice(state, actor) {
    tickSlotCds(actor);
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
          { kind: 'magic', damageMult: mult, armorIgnore: 0.15, source: 'DEATH' },
          state
        );
        if (damage === 0) {
          state.log.push(`${actor.displayName}: дыхание — промах по ${enemy.displayName}.`);
          continue;
        }
        state.log.push(
          `${actor.displayName}: дыхание смерти → ${enemy.displayName} ${formatLastLogDamage(damage)}.`
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
        (unit) => unit.alive && unit.team === target.team && unit.row === target.row
      );
      const unluckyPower = 7 + actor.lvl * 2;
      for (const enemy of row) {
        grantEffect(enemy, 'UNLUCKY', 2, unluckyPower);
        if (randInt(1, 100) <= 85) {
          grantEffect(enemy, 'WEAKNESS', 2, Math.max(1, Math.round(enemy.damage * 0.5)));
          state.log.push(`${actor.displayName}: ${enemy.displayName} ослаблен гнилью.`);
        } else {
          state.log.push(`${actor.displayName}: ${enemy.displayName} теряет боевой дух.`);
        }
      }
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const levels = 1 + Math.floor(actor.lvl / 6);
      const undead = undeadAllies(state, actor);
      for (const unit of undead) {
        levelUpUnit(unit, levels, state);
      }
      setSlotCd(actor, 3, 4);
      state.log.push(
        `${actor.displayName} читает молитву нежити: +${levels} ур. (${undead.length} цел.).`
      );
      return { status: 'done' };
    }

    if (input.slot === 4) {
      return openResurrectPrompt(state, actor, PROMPT_REZ_1, false);
    }

    if (input.slot === 5) {
      const target = meleeTargets(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const execute = isBelowExecuteThreshold(target);
      const armorIgnore = hasEffect(target, 'MARKED') ? 0.75 : 0;
      const damage = dealDamage(
        actor,
        target,
        { kind: 'melee', damageMult: 1, armorIgnore, source: 'WEAPON' },
        state
      );
      if (damage === 0) {
        // Промах (уворот/блок): казнь <20% HP не срабатывает.
        state.log.push(`${actor.displayName}: пожирание гада — промах.`);
      } else {
        state.log.push(
          `${actor.displayName} пожирает ${target.displayName} ${formatLastLogDamage(damage)}${
            armorIgnore > 0 ? ' (метка: −75% брони)' : ''
          }.`
        );
        markDeadIfNeeded(state, target);
        // Казнь по ОЗ до атаки; только если удар попал.
        if (execute && target.alive) {
          target.health = 0;
          state.log.push(
            `${actor.displayName} сжирает ослабевшего ${target.displayName} (было < 20 % ОЗ).`
          );
          markDeadIfNeeded(state, target);
        }
      }
      setSlotCd(actor, 5, 3);
      return { status: 'done' };
    }

    return { status: 'reject', message: 'Неизвестная способность' };
  },
};
