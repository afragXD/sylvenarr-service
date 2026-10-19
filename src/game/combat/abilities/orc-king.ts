import { dealDamage, markDeadIfNeeded, randInt } from '../damage';
import { grantEffect } from '../effects';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { availableSummonRows, createSummon } from './summon';
import { enemiesOf, meleeOrAll, moveToOtherRow, ownRowAllies } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

function getRage(actor: BattleUnit): number {
  return Math.round((2 - actor.health / actor.maxHp + actor.cumRage) * 100) / 100;
}

function countOwnedSummons(state: BattleState, actor: BattleUnit): number {
  return state.units.filter(
    (unit) => unit.alive && unit.isSummon && unit.summonerId === actor.id
  ).length;
}

function abilityMeta(
  state: BattleState,
  actor: BattleUnit,
  slot: AbilitySlot
): AbilityInfo {
  switch (slot) {
    case 1: {
      const targets = meleeOrAll(state, actor, false);
      return {
        slot: 1,
        label: `Бердыш ×${getRage(actor)}`,
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const atSummonCap = countOwnedSummons(state, actor) >= actor.maxSummons;
      return {
        slot: 2,
        label: `Гоблины (${actor.authority})`,
        needsTarget: false,
        disabledReason:
          actor.authority <= 0 ? 'Нет вызовов' : atSummonCap ? 'Лимит саммонов' : null,
        legalTargetIds: [],
      };
    }
    case 3: {
      const targets = meleeOrAll(state, actor, false);
      return {
        slot: 3,
        label: 'Кастет',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 4: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 4,
        label: 'Топоры ×2',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 5:
      return {
        slot: 5,
        label: 'Сила семьи',
        needsTarget: false,
        disabledReason: null,
        legalTargetIds: [],
      };
  }
}

/**
 * OrcKing: ярость, призыв гоблина, кастет, топоры, бафф ряду.
 */
export const orcKingAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  preChoice(state, actor) {
    const enemies = enemiesOf(state, actor);
    if (enemies.length === 0) {
      return;
    }
    const delta = actor.luck < -10 ? actor.lvl - 1 : 0;
    if (delta <= 0) {
      return;
    }
    const victim = enemies[randInt(0, enemies.length - 1)];
    if (!victim) {
      return;
    }
    victim.luck -= delta;
    state.log.push(
      `Проклятая аура ${actor.displayName} поглощает ${delta} удачи у ${victim.displayName}.`
    );
  },

  apply(state, actor, input): AbilityOutcome {
    if (state.pendingPrompt?.unitId === actor.id) {
      return resolvePrompt(state, actor, input.choice);
    }

    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      const target = pickEnemy(state, actor, input.targetId, false);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const rage = getRage(actor);
      const damage = dealDamage(actor, target, {
        damageMult: 1.1 * rage,
        armorIgnore: 0.25,
      });
      if (damage === 0) {
        state.log.push(`${actor.displayName} промахнулся бердышом.`);
      } else {
        state.log.push(
          `${actor.displayName} бьёт бердышом ${target.displayName} на ${damage} (ярость ×${rage}).`
        );
        markDeadIfNeeded(state, target);
      }
      return { status: 'done' };
    }

    if (input.slot === 2) {
      actor.authority -= 1;
      state.pendingPrompt = {
        unitId: actor.id,
        kind: 'orc_goblin_type',
        slot: 2,
        options: [
          { id: 'shaman', label: 'Шаман' },
          { id: 'trapper', label: 'Разведчик' },
          { id: 'cancel', label: 'Отмена' },
        ],
        context: {},
      };
      state.log.push(`${actor.displayName}: выберите тип гоблина.`);
      return { status: 'pending' };
    }

    if (input.slot === 3) {
      const target = pickEnemy(state, actor, input.targetId, false);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const damage = dealDamage(actor, target, { damageMult: 0.75, armorIgnore: 0.5 });
      if (damage === 0) {
        state.log.push(`${actor.displayName}: кастет — промах.`);
        return { status: 'done' };
      }
      state.log.push(
        `${actor.displayName} бьёт кастетом ${target.displayName} на ${damage}.`
      );
      markDeadIfNeeded(state, target);
      if (target.alive && randInt(1, 100) <= 60 + actor.lvl) {
        moveToOtherRow(target);
        state.log.push(`${target.displayName} отброшен на другой ряд.`);
      }
      if (target.alive && randInt(1, 100) <= 20 + Math.round(actor.lvl * 1.5)) {
        grantEffect(target, 'CHAINED', 2, 0);
        state.log.push(`${target.displayName} скован.`);
      }
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      throwAxe(state, actor, target);
      const others = enemiesOf(state, actor).filter((unit) => unit.id !== target.id);
      if (others.length === 0) {
        actor.luck -= randInt(1, 5);
        return { status: 'done' };
      }
      state.pendingPrompt = {
        unitId: actor.id,
        kind: 'orc_axe_second',
        slot: 4,
        options: others.map((unit) => ({ id: unit.id, label: unit.displayName })),
        context: { firstTargetId: target.id },
      };
      state.log.push(`${actor.displayName}: выберите цель второго топора.`);
      return { status: 'pending' };
    }

    // slot 5
    for (const ally of ownRowAllies(state, actor)) {
      grantEffect(ally, 'HAPPY', 2, 15 + actor.lvl * 2);
    }
    const armorDelta = randInt(2 * actor.lvl, 3 * actor.lvl + 7);
    actor.armor += armorDelta;
    actor.cumRage = Math.max(-0.5, actor.cumRage - 0.06);
    state.log.push(
      `${actor.displayName} укрепляет броню (+${armorDelta}) и вселяет радость в ряд.`
    );
    return { status: 'done' };
  },
};

function resolvePrompt(
  state: BattleState,
  actor: BattleUnit,
  choice: string | undefined
): AbilityOutcome {
  const prompt = state.pendingPrompt;
  if (!prompt || !choice) {
    return { status: 'reject', message: 'Нужен выбор' };
  }

  if (
    choice === 'cancel' &&
    (prompt.kind === 'orc_goblin_type' || prompt.kind === 'orc_goblin_row')
  ) {
    state.pendingPrompt = null;
    actor.authority += 1;
    state.log.push(`${actor.displayName} отменяет призыв.`);
    return { status: 'done', keepTurn: true };
  }

  if (!prompt.options.some((option) => option.id === choice)) {
    return { status: 'reject', message: 'Неверный выбор' };
  }

  if (prompt.kind === 'orc_goblin_type') {
    const code = choice === 'shaman' ? 'GoblinShaman' : 'GoblinTrapper';
    const rows = availableSummonRows(state, actor);
    if (rows.length === 0) {
      state.pendingPrompt = null;
      actor.authority += 1;
      state.log.push(`${actor.displayName}: нет места для саммона.`);
      return { status: 'done', keepTurn: true };
    }
    state.pendingPrompt = {
      unitId: actor.id,
      kind: 'orc_goblin_row',
      slot: 2,
      options: [
        ...rows.map((row) => ({
          id: String(row),
          label: row === 0 ? 'Передний ряд' : 'Задний ряд',
        })),
        { id: 'cancel', label: 'Отмена' },
      ],
      context: { summonCode: code },
    };
    state.log.push(`${actor.displayName}: выберите ряд для гоблина.`);
    return { status: 'pending' };
  }

  if (prompt.kind === 'orc_goblin_row') {
    const code = prompt.context.summonCode;
    if (!code) {
      state.pendingPrompt = null;
      actor.authority += 1;
      state.log.push(`${actor.displayName}: призыв сорвался.`);
      return { status: 'done', keepTurn: true };
    }
    const row = Number(choice);
    const summon = createSummon(state, { summoner: actor, heroCode: code, row });
    state.pendingPrompt = null;
    if (!summon) {
      actor.authority += 1;
      state.log.push(`${actor.displayName}: не удалось призвать.`);
      return { status: 'done', keepTurn: true };
    }
    state.log.push(`${actor.displayName} призывает ${summon.displayName}.`);
    return { status: 'done' };
  }

  if (prompt.kind === 'orc_axe_second') {
    const target = enemiesOf(state, actor).find((unit) => unit.id === choice);
    state.pendingPrompt = null;
    if (!target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }
    throwAxe(state, actor, target);
    actor.luck -= randInt(1, 5);
    return { status: 'done' };
  }

  return { status: 'reject', message: 'Неизвестный prompt' };
}

function throwAxe(state: BattleState, actor: BattleUnit, target: BattleUnit): void {
  const damage = dealDamage(actor, target, { damageMult: 0.5, armorIgnore: 0 });
  if (damage === 0) {
    state.log.push(`Топор ${actor.displayName} промахивается мимо ${target.displayName}.`);
    return;
  }
  state.log.push(
    `Метательный топор ${actor.displayName} попадает в ${target.displayName} на ${damage}.`
  );
  markDeadIfNeeded(state, target);
  if (target.alive && randInt(1, 100) <= 60 + actor.lvl) {
    grantEffect(target, 'FATMAN', 2, 15 + actor.lvl);
  }
}

function pickEnemy(
  state: BattleState,
  actor: BattleUnit,
  targetId: string | undefined,
  ignoreMelee: boolean
): BattleUnit | undefined {
  const targets = meleeOrAll(state, actor, ignoreMelee);
  return (targetId ? targets.find((unit) => unit.id === targetId) : undefined) ?? targets[0];
}
