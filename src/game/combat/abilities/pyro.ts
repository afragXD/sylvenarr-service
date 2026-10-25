import { dealDamage, markDeadIfNeeded, randInt } from '../damage';
import { grantEffect, hasEffect } from '../effects';
import { ROW_BACK, ROW_FRONT } from '../settings';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { alliesOf, enemiesOf } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

function pickRandom<T>(items: T[], count: number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    const idx = randInt(0, pool.length - 1);
    picked.push(pool.splice(idx, 1)[0]!);
  }
  return picked;
}

function abilityMeta(
  state: BattleState,
  actor: BattleUnit,
  slot: AbilitySlot
): AbilityInfo {
  switch (slot) {
    case 1:
      return {
        slot: 1,
        label: 'Огнемёт',
        needsTarget: false,
        disabledReason: enemiesOf(state, actor).length === 0 ? 'Нет целей' : null,
        legalTargetIds: [],
      };
    case 2: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 2,
        label: 'Паровой арбалет',
        needsTarget: true,
        disabledReason:
          actor.row !== ROW_BACK
            ? 'Нужен задний ряд'
            : targets.length === 0
              ? 'Нет целей'
              : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3:
      return {
        slot: 3,
        label: 'Огненная бомба',
        needsTarget: false,
        disabledReason: null,
        legalTargetIds: [],
      };
    case 4: {
      const allies = alliesOf(state, actor);
      return {
        slot: 4,
        label: 'Смола гномов',
        needsTarget: true,
        disabledReason: allies.length === 0 ? 'Нет союзников' : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 5: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 5,
        label: 'Акт самосожжения',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
  }
}

/**
 * Pyro: flamethrower, crossbow, bomb, fired weapon, self-immolation.
 */
export const pyroAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  apply(state, actor, input): AbilityOutcome {
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      const targets = pickRandom(enemiesOf(state, actor), 2);
      for (const enemy of targets) {
        // Огнемёт бьёт магией огня от power (как MagicPattern в боте), а не от melee-урона.
        const damage = dealDamage(
          actor,
          enemy,
          { damageMult: 1, armorIgnore: 0.1, source: 'FIRE', forceStyle: 'magic' },
          state
        );
        if (damage > 0) {
          state.log.push(`${actor.displayName}: огнемёт → ${enemy.displayName} (${damage}).`);
          if (randInt(1, 100) <= 50) {
            grantEffect(enemy, 'BURNING', 2, 1.3);
          }
          markDeadIfNeeded(state, enemy);
        }
      }
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const bonus = hasEffect(target, 'BURNING') ? 10 + actor.lvl : 0;
      const mult = 1 + bonus / 40;
      const damage = dealDamage(
        actor,
        target,
        { damageMult: mult, armorIgnore: 0.2, source: 'FIRE' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: арбалет — промах.`);
      } else {
        const broken = randInt(2, 6 + actor.lvl);
        target.armor = Math.max(0, target.armor - broken);
        state.log.push(
          `${actor.displayName}: паровой болт → ${target.displayName} (${damage}, −${broken} брони).`
        );
        markDeadIfNeeded(state, target);
      }
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const fronts = state.units.filter(
        (unit) => unit.alive && unit.row === ROW_FRONT
      );
      for (const unit of fronts) {
        grantEffect(unit, 'BURNING', 2 + Math.floor(actor.lvl / 7), 1.3);
      }
      const enemies = state.units.filter(
        (unit) => unit.alive && unit.team !== actor.team
      );
      const columns = enemies.map((unit) => unit.column);
      for (let i = columns.length - 1; i > 0; i -= 1) {
        const j = randInt(0, i);
        const tmp = columns[i]!;
        columns[i] = columns[j]!;
        columns[j] = tmp;
      }
      enemies.forEach((unit, i) => {
        unit.column = columns[i] ?? unit.column;
      });
      state.log.push(
        `${actor.displayName}: огненная бомба поджигает фронты и перемешивает врагов.`
      );
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Нужен союзник' };
      }
      grantEffect(target, 'FIREDWEAPON', Math.min(3, 1 + Math.floor(actor.lvl / 6)), 0);
      state.log.push(
        `${actor.displayName} зачаровывает оружие ${target.displayName} пламенем.`
      );
      return { status: 'done' };
    }

    // slot 5
    const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
    if (!target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }
    actor.health = 0;
    markDeadIfNeeded(state, actor);
    // В боте только −мораль (lvl×6), без FEAR.
    target.morale -= actor.lvl * 6;
    grantEffect(target, 'UNLUCKY', 2, actor.lvl * 2);
    const leader =
      alliesOf(state, actor)
        .filter((unit) => unit.id !== actor.id)
        .sort((a, b) => b.initiative - a.initiative)[0] ?? null;
    if (leader) {
      leader.damage = Math.round(leader.damage * 1.2);
      leader.power = Math.round(leader.power * 1.2);
      state.log.push(
        `${actor.displayName} самосожжением усиливает ${leader.displayName}; ${target.displayName} в ужасе.`
      );
    } else {
      state.log.push(
        `${actor.displayName} самосожжением пугает ${target.displayName}.`
      );
    }
    return { status: 'done' };
  },
};
