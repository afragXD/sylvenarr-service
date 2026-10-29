import { dealDamage, markDeadIfNeeded, randInt, formatLastLogDamage } from '../damage';
import { grantEffect, hasEffect } from '../effects';
import { ROW_BACK, ROW_FRONT } from '../settings';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { alliesOf, enemiesOf, moveToOtherRow } from './targets';
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

function flamethrowerTargetCount(actor: BattleUnit): number {
  return 2 + Math.floor(actor.lvl / 7) + Math.floor(Math.max(0, actor.morale) / 30);
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
        attackKind: 'magic',
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
        label: `Огненная бомба (${actor.ultaCharges})`,
        needsTarget: false,
        disabledReason: actor.ultaCharges <= 0 ? 'Нет бутылок' : null,
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
      const halfHp = actor.maxHp / 2;
      return {
        slot: 5,
        label: 'Самосожжение',
        needsTarget: false,
        disabledReason: hasEffect(actor, 'ENSLAVED')
          ? 'Нельзя под порабощением'
          : actor.health < halfHp
            ? 'Нужно ≥ половины ОЗ'
            : alliesOf(state, actor).filter((unit) => unit.id !== actor.id).length === 0
              ? 'Нет союзников'
              : null,
        legalTargetIds: [],
      };
    }
  }
}

/**
 * Pyro: flamethrower, crossbow, bomb bottles, fired weapon, self-immolation.
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
      // Дальний: любой ряд (не melee-reach). Урон — магия огня.
      const targets = pickRandom(enemiesOf(state, actor), flamethrowerTargetCount(actor));
      for (const enemy of targets) {
        const damage = dealDamage(
          actor,
          enemy,
          { kind: 'magic', damageMult: 1, armorIgnore: 0.1, source: 'FIRE' },
          state
        );
        if (damage > 0) {
          state.log.push(
            `${actor.displayName}: огнемёт → ${enemy.displayName} ${formatLastLogDamage(damage)}.`
          );
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
        { kind: 'ranged', damageMult: mult, armorIgnore: 0.2, source: 'FIRE' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: арбалет — промах.`);
      } else {
        const broken = randInt(2, 6 + actor.lvl);
        target.armor = Math.max(0, target.armor - broken);
        state.log.push(
          `${actor.displayName}: паровой болт → ${target.displayName} ${formatLastLogDamage(damage)} (−${broken} брони).`
        );
        markDeadIfNeeded(state, target);
      }
      return { status: 'done' };
    }

    if (input.slot === 3) {
      actor.ultaCharges -= 1;
      const burnPower = (80 + actor.lvl) / 100;
      const fronts = enemiesOf(state, actor).filter((unit) => unit.row === ROW_FRONT);
      const retreatChance = 35 + actor.lvl;
      for (const unit of fronts) {
        grantEffect(unit, 'BURNING', 2, burnPower);
        if (unit.row === ROW_FRONT && randInt(1, 100) <= retreatChance) {
          moveToOtherRow(unit);
          state.log.push(`${unit.displayName} отступает назад от огненной бомбы.`);
        }
      }
      state.log.push(
        `${actor.displayName}: огненная бомба (${actor.ultaCharges} бут. осталось) поджигает передний ряд врага.`
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

    // slot 5 — самосожжение
    const allies = alliesOf(state, actor).filter((unit) => unit.id !== actor.id);
    actor.health = 0;
    markDeadIfNeeded(state, actor);
    for (const ally of allies) {
      grantEffect(ally, 'FOCUSED', 2, 15 + actor.lvl);
      ally.critBank += 1;
    }
    state.log.push(
      `${actor.displayName} приносит себя в жертву — союзники вдохновлены (+точность, крит-банк).`
    );
    return { status: 'done' };
  },
};
