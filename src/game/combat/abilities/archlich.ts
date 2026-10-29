import { dealDamage, markDeadIfNeeded, randInt, formatLastLogDamage } from '../damage';
import { addMana, delEffect, grantEffect, healUnit } from '../effects';
import { levelUpUnit } from '../level';
import { rollMindChance } from '../resists';
import { pushSfx } from '../sfx';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { availableSummonRows, createSummon } from './summon';
import { alliesOf, enemiesOf } from './targets';
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
        label: 'Облако смерти',
        needsTarget: true,
        attackKind: 'magic',
        disabledReason:
          actor.mana < 3 ? 'Нужно 3 МР' : targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const lichSummons = alliesOf(state, actor).filter((unit) => unit.isLichSummon);
      const selfAndSummons = [actor, ...lichSummons];
      return {
        slot: 2,
        label: 'Нежить / эволюция',
        needsTarget: true,
        disabledReason: actor.mana < 3 ? 'Нужно 3 МР' : null,
        legalTargetIds: selfAndSummons.map((unit) => unit.id),
      };
    }
    case 3: {
      const allies = alliesOf(state, actor);
      return {
        slot: 3,
        label: 'Ритуал / вампир',
        needsTarget: true,
        disabledReason: actor.mana < 2 ? 'Нужно 2 МР' : allies.length === 0 ? 'Нет целей' : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 4: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 4,
        label: 'Ужас',
        needsTarget: true,
        disabledReason:
          actor.mana < 3 ? 'Нужно 3 МР' : targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 5: {
      const allies = alliesOf(state, actor).filter((unit) => unit.id !== actor.id);
      return {
        slot: 5,
        label: 'Поглотить душу',
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
  }
}

/**
 * Archlich: death AoE, summons/evolution, heal/vamp, fear, soul absorb.
 */
export const archlichAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
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
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      if (!spendMana(actor, 3, state)) {
        return { status: 'reject', message: 'Нужно 3 МР' };
      }
      const damage = dealDamage(
        actor,
        target,
        { kind: 'magic', damageMult: 1.1, armorIgnore: 0.15, source: 'DEATH' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: облако смерти — промах.`);
      } else {
        state.log.push(
          `${actor.displayName} насылает смерть на ${target.displayName} ${formatLastLogDamage(damage)}.`
        );
        markDeadIfNeeded(state, target);
      }
      const extras = enemiesOf(state, actor)
        .filter((unit) => unit.id !== target.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.max(1, Math.floor(actor.lvl / 5) + 1));
      for (const extra of extras) {
        if (!spendMana(actor, 1, state, true)) {
          break;
        }
        const splash = dealDamage(
          actor,
          extra,
          { kind: 'magic', damageMult: 0.55, armorIgnore: 0.1, source: 'DEATH' },
          state
        );
        if (splash > 0) {
          state.log.push(`Облако задевает ${extra.displayName} ${formatLastLogDamage(splash)}.`);
          markDeadIfNeeded(state, extra);
        }
      }
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const target =
        alliesOf(state, actor).find((unit) => unit.id === input.targetId) ??
        (input.targetId === actor.id ? actor : undefined);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      if (target.id !== actor.id && !target.isLichSummon) {
        return { status: 'reject', message: 'Нужна своя нежить или сам лич' };
      }
      if (!spendMana(actor, 3, state)) {
        return { status: 'reject', message: 'Нужно 3 МР' };
      }

      if (target.id === actor.id) {
        const rows = availableSummonRows(state, actor);
        if (rows.length === 0) {
          addMana(actor, 3);
          return { status: 'reject', message: 'Нет места для саммона' };
        }
        if (rows.length === 1) {
          const summon = createSummon(state, {
            summoner: actor,
            heroCode: 'Zombie',
            row: rows[0] ?? 0,
            isLichSummon: true,
          });
          if (!summon) {
            addMana(actor, 3);
            return { status: 'reject', message: 'Не удалось призвать' };
          }
          state.log.push(`${actor.displayName} призывает зомби.`);
          return { status: 'done' };
        }
        state.pendingPrompt = {
          unitId: actor.id,
          kind: 'lich_zombie_row',
          slot: 2,
          options: rows.map((row) => ({
            id: String(row),
            label: row === 0 ? 'Передний ряд' : 'Задний ряд',
          })),
          context: {},
        };
        state.log.push(`${actor.displayName}: выберите ряд для зомби.`);
        return { status: 'pending' };
      }

      target.lichGrade += 1;
      state.log.push(`${target.displayName}: эволюция (${target.lichGrade}).`);

      // Было 3 применения; −1 → скелет-чемпион на 2-м.
      if (target.lichGrade === 2) {
        const ratio = Math.min(1, target.health / target.maxHp + 0.2);
        const summon = createSummon(state, {
          summoner: actor,
          heroCode: 'SkeletonChampion',
          row: target.row,
          column: target.column,
          isLichSummon: true,
          replaceUnitId: target.id,
        });
        if (!summon) {
          return { status: 'reject', message: 'Эволюция не удалась' };
        }
        summon.health = Math.max(1, Math.round(ratio * summon.maxHp));
        summon.lichGrade = target.lichGrade;
        state.log.push(`${target.displayName} становится скелетом-чемпионом.`);
        return { status: 'done' };
      }

      if (target.lichGrade >= 5) {
        state.pendingPrompt = {
          unitId: actor.id,
          kind: 'lich_final_form',
          slot: 2,
          options: [
            {
              id: 'ghost',
              label: 'Воин-призрак',
              description:
                'Сопротивление оружию, парализующий клинок, вампиризм; урон растёт со смертями союзников.',
            },
            {
              id: 'tree',
              label: 'Злое дерево',
              description:
                'Хуорн / злое древо: поддержка точности и критов, корни, сопротивление оружию ряду, обучение перку.',
            },
          ],
          context: {
            targetId: target.id,
            ratio: String(Math.min(1, target.health / target.maxHp + 0.2)),
          },
        };
        state.log.push(`${actor.displayName}: выберите финальную форму.`);
        return { status: 'pending' };
      }

      return { status: 'done' };
    }

    if (input.slot === 3) {
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      if (!spendMana(actor, 2, state)) {
        return { status: 'reject', message: 'Нужно 2 МР' };
      }
      if (target.isSummon) {
        const levels = 1 + Math.floor(actor.lvl / 4);
        levelUpUnit(target, levels, state);
        if (target.isLichSummon) {
          const heal = healUnit(target, actor.lvl * 5 + 10);
          state.log.push(
            `${actor.displayName} проводит ритуал над ${target.displayName}: +${levels} ур.${heal > 0 ? `, лечение ${heal}` : ''}.`,
          );
        } else {
          state.log.push(
            `${actor.displayName} проводит ритуал над ${target.displayName}: +${levels} ур.`,
          );
        }
      } else {
        grantEffect(target, 'VAMPWEAPON', 1 + Math.floor(actor.lvl / 7), 0.5 + actor.lvl / 25);
        state.log.push(`${actor.displayName} накладывает вампиризм на ${target.displayName}.`);
      }
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      if (!spendMana(actor, 3, state)) {
        return { status: 'reject', message: 'Нужно 3 МР' };
      }
      // Порт evade(other, 1) из бота.
      // Порт evade(): miss = dodge + 1 + 95 − accuracy.
      if (randInt(1, 100) <= target.dodge + 1 + 95 - actor.accuracy) {
        state.log.push(`${target.displayName} сопротивляется ужасу.`);
        return { status: 'done' };
      }
      // Chance(80, SRC.MIND) → FEAR 2р power=3 + снять CONTR.
      if (rollMindChance(state, target, 80)) {
        grantEffect(target, 'FEAR', 2, 3);
        delEffect(target, 'CONTR');
        state.log.push(
          `${actor.displayName} проводит экскурсию по коллекции — ${target.displayName} охвачен ужасом.`
        );
      } else {
        state.log.push(`${target.displayName} не поддаётся провокациям лича.`);
      }
      return { status: 'done' };
    }

    // slot 5
    const victim = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
    if (!victim || victim.id === actor.id) {
      return { status: 'reject', message: 'Нужен союзник' };
    }
    if (!spendMana(actor, 3, state)) {
      return { status: 'reject', message: 'Нужно 3 МР' };
    }
    const manaBoost = Math.max(1, Math.round(victim.health / 30));
    addMana(actor, manaBoost);
    actor.power += Math.max(1, Math.round(actor.lvl * 0.75));
    actor.damage += 2;
    const levels = Math.max(1, Math.round(victim.lvl * 0.5));
    levelUpUnit(actor, levels, state);
    victim.alive = false;
    victim.health = 0;
    pushSfx(state, victim, 'death');
    state.log.push(
      `${actor.displayName} поглощает душу ${victim.displayName} (+${manaBoost} МР, +${levels} ур.).`
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
  if (!prompt.options.some((option) => option.id === choice)) {
    return { status: 'reject', message: 'Неверный выбор' };
  }

  if (prompt.kind === 'lich_zombie_row') {
    const summon = createSummon(state, {
      summoner: actor,
      heroCode: 'Zombie',
      row: Number(choice),
      isLichSummon: true,
    });
    state.pendingPrompt = null;
    if (!summon) {
      addMana(actor, 3);
      return { status: 'reject', message: 'Не удалось призвать' };
    }
    state.log.push(`${actor.displayName} призывает зомби.`);
    return { status: 'done' };
  }

  if (prompt.kind === 'lich_final_form') {
    const targetId = prompt.context.targetId;
    const ratio = Number(prompt.context.ratio ?? '1');
    const target = state.units.find((unit) => unit.id === targetId);
    state.pendingPrompt = null;
    if (!target) {
      return { status: 'reject', message: 'Цель эволюции потеряна' };
    }
    const code = choice === 'ghost' ? 'GhostWarrior' : 'EvilTree';
    const summon = createSummon(state, {
      summoner: actor,
      heroCode: code,
      row: target.row,
      column: target.column,
      isLichSummon: true,
      replaceUnitId: target.id,
    });
    if (!summon) {
      return { status: 'reject', message: 'Эволюция не удалась' };
    }
    summon.health = Math.max(1, Math.round(ratio * summon.maxHp));
    summon.lichGrade = target.lichGrade;
    state.log.push(`${target.displayName} становится ${summon.displayName}.`);
    return { status: 'done' };
  }

  return { status: 'reject', message: 'Неизвестный prompt' };
}

function spendMana(
  actor: BattleUnit,
  amount: number,
  state: BattleState,
  silent = false
): boolean {
  if (actor.mana < amount) {
    if (!silent) {
      state.log.push(`Недостаточно маны (${amount}).`);
    }
    return false;
  }
  actor.mana -= amount;
  return true;
}
