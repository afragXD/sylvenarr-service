import { resolveAttackStyle } from '../attack-style';
import { dealDamage, markDeadIfNeeded, randInt, formatLastLogDamage } from '../damage';
import { formatLogDamage } from '../damageSources';
import { resistsForClass } from '../defaultResists';
import { grantEffect, hasEffect } from '../effects';
import { applyResistMultiplier, mindResistFactor, rollSrcChance } from '../resists';
import { isArtificialClass, isUndeadClass } from '../races';
import { ROW_FRONT } from '../settings';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { alliesOf, enemiesOf, listAttackTargets, unitsOnSameRow } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

function transformToZombie(state: BattleState, target: BattleUnit): boolean {
  const hero = state.catalog.Zombie;
  if (!hero) {
    target.heroClassCode = 'Zombie';
    target.displayName = 'Зомби';
    return false;
  }
  const ratio = target.maxHp > 0 ? target.health / target.maxHp : 1;
  const maxHp = Math.max(1, Math.round(hero.health * state.rules.healthBonus));
  target.heroClassCode = hero.code;
  target.displayName = hero.displayName;
  target.maxHp = maxHp;
  target.health = Math.max(1, Math.min(maxHp, Math.round(maxHp * ratio)));
  target.damage = hero.damage;
  target.armor = hero.armor;
  target.initiative = hero.initiative;
  target.dodge = hero.dodge;
  target.luck = hero.luck;
  target.accuracy = hero.accuracy;
  target.power = hero.power;
  target.attackStyle = resolveAttackStyle(hero.code);
  target.resists = resistsForClass(hero.code);
  target.morale = hero.morale ?? target.morale;
  return true;
}

function isZombieUnit(unit: BattleUnit): boolean {
  return unit.heroClassCode === 'Zombie';
}

function countZombies(units: BattleUnit[]): number {
  return units.filter((unit) => unit.alive && isZombieUnit(unit)).length;
}

function infectChance(state: BattleState, actor: BattleUnit): number {
  const allyZombies = countZombies(alliesOf(state, actor));
  const enemyZombies = countZombies(enemiesOf(state, actor));
  return 50 + actor.lvl * 2 + allyZombies * 10 - enemyZombies * 10;
}

function harmWithDeath(state: BattleState, target: BattleUnit, raw: number): number {
  const amount = Math.max(0, Math.round(raw));
  if (amount <= 0) {
    return 0;
  }
  const resist = applyResistMultiplier(target, 'DEATH');
  if (resist.blocked) {
    if (resist.blockReason) {
      state.log.push(resist.blockReason);
    }
    return 0;
  }
  const dealt = Math.max(1, Math.round(amount * resist.multiplier));
  target.health -= dealt;
  return dealt;
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
        label: 'Укус вслепую',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const targets = enemiesOf(state, actor).filter((unit) => unit.row === ROW_FRONT);
      return {
        slot: 2,
        label: `Взрыв блевотины (${actor.ultaCharges})`,
        needsTarget: true,
        disabledReason:
          actor.ultaCharges <= 0
            ? 'Нет зарядов'
            : targets.length === 0
              ? 'Нет целей'
              : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3: {
      const chance = infectChance(state, actor);
      const targets = enemiesOf(state, actor).filter(
        (unit) =>
          !isUndeadClass(unit.heroClassCode) && !isArtificialClass(unit.heroClassCode)
      );
      return {
        slot: 3,
        label: `Инфицирование (${chance}%)`,
        needsTarget: true,
        disabledReason:
          actor.lvl < 5
            ? 'Нужен 5+ уровень'
            : targets.length === 0
              ? 'Нет целей'
              : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 4: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 4,
        label: 'Камикадзе',
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
 * Zombie: укус, взрыв блевотины, инфицирование, камикадзе.
 */
export const zombieAbilities: AbilityHandler = {
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
      const marked = hasEffect(target, 'MARKED');
      if (marked) {
        actor.accuracy += 25;
      }
      const damage = dealDamage(
        actor,
        target,
        { damageMult: 1, armorIgnore: 0, source: 'WEAPON' },
        state
      );
      if (marked) {
        actor.accuracy -= 25;
      }
      if (damage === 0) {
        state.log.push(`${actor.displayName}: укус — промах.`);
        return { status: 'done' };
      }
      state.log.push(`${actor.displayName} кусает ${target.displayName} ${formatLastLogDamage(damage)}.`);
      const cf = target.morale <= 0 ? 1 : 1.5;
      const dirt = Math.round(randInt(3, 4 + actor.lvl) * mindResistFactor(target) * cf);
      if (dirt > 0) {
        target.morale -= dirt;
        state.log.push(
          `${target.displayName} теряет ${dirt} боевого духа от укуса ${actor.displayName}.`
        );
      }
      markDeadIfNeeded(state, target);
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      if (target.row !== ROW_FRONT) {
        return { status: 'reject', message: 'Только передний ряд' };
      }
      actor.ultaCharges -= 1;
      const raw = randInt(actor.lvl * 3, actor.lvl * 4) + 4;
      const dealt = harmWithDeath(state, target, raw);
      if (dealt > 0) {
        state.log.push(
          `${actor.displayName}: взрыв блевотины → ${target.displayName} ${formatLogDamage(dealt, 'DEATH')}.`
        );
        grantEffect(target, 'FOCUSED', 2, -(10 + actor.lvl));
        grantEffect(target, 'FATMAN', 2, 10 + actor.lvl * 2);
        markDeadIfNeeded(state, target);
      }
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      if (isUndeadClass(target.heroClassCode) || isArtificialClass(target.heroClassCode)) {
        return { status: 'reject', message: 'Нельзя заразить нежить или механизм' };
      }
      const chance = infectChance(state, actor);
      if (rollSrcChance(state, target, chance, 'POLYMORPH')) {
        const oldName = target.displayName;
        transformToZombie(state, target);
        state.log.push(`МОЗГИ! ${actor.displayName} превратил ${oldName} в зомби!`);
      } else {
        state.log.push(`Заражение не прошло — ${target.displayName} устоял.`);
      }
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const row = unitsOnSameRow(state, target);
      const share = actor.health / Math.max(3, row.length);
      state.log.push(
        'Зомби бомбочкой бросается в толпу врагов - его омерзительное, сгнившее тело пульсирует и, наконец, взрывается кровавым фонтаном.'
      );
      for (const enemy of row) {
        const dealt = harmWithDeath(state, enemy, share);
        if (dealt > 0) {
          state.log.push(
            `${enemy.displayName} получает ${formatLogDamage(dealt, 'DEATH')} от взрыва.`
          );
          markDeadIfNeeded(state, enemy);
        }
      }
      actor.health = 0;
      markDeadIfNeeded(state, actor);
      return { status: 'done' };
    }

    return { status: 'reject', message: 'Используйте защиту / ожидание' };
  },
};
