import { dealDamage, formatLastLogDamage, markDeadIfNeeded, randInt } from '../damage';
import { delEffect, grantEffect, hasEffect, healUnit, trySpendMana } from '../effects';
import { consumeSrcFactor, rollSrcChance } from '../resists';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { alliesOf, enemiesOf, meleeTargets, ownRowAllies } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

function manaReason(actor: BattleUnit, cost: number): string | null {
  return actor.mana < cost ? `Нужно ${cost} МР` : null;
}

/** Заряд ульты за каждое убийство способностью Титана. */
function rewardKill(state: BattleState, actor: BattleUnit, target: BattleUnit): void {
  if (!target.alive) {
    actor.ultaCharges += 1;
    state.log.push(`${actor.displayName} получает заряд исцеляющей волны (${actor.ultaCharges}).`);
  }
}

/** Цели квадрата 2×2: оба ряда, колонка цели и соседняя справа. */
function squareTargets(state: BattleState, actor: BattleUnit, anchor: BattleUnit): BattleUnit[] {
  return enemiesOf(state, actor, { ignoreGuard: true }).filter(
    (unit) => unit.column === anchor.column || unit.column === anchor.column + 1
  );
}

function abilityMeta(state: BattleState, actor: BattleUnit, slot: AbilitySlot): AbilityInfo {
  switch (slot) {
    case 1: {
      const targets = enemiesOf(state, actor, { ignoreGuard: true });
      return {
        slot: 1,
        label: 'Обрушение валуна',
        needsTarget: true,
        attackKind: 'ranged',
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const targets = enemiesOf(state, actor, { ignoreGuard: true });
      return {
        slot: 2,
        label: 'Метеоритный дождь (2×2)',
        needsTarget: true,
        attackKind: 'magic',
        disabledReason: manaReason(actor, 3) ?? (targets.length === 0 ? 'Нет целей' : null),
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3: {
      const targets = meleeTargets(state, actor);
      return {
        slot: 3,
        label: 'Могучий кулак',
        needsTarget: true,
        attackKind: 'melee',
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 4:
      return {
        slot: 4,
        label: `Исцеляющая волна (${actor.ultaCharges})`,
        needsTarget: false,
        disabledReason: actor.ultaCharges <= 0 ? 'Нет зарядов' : manaReason(actor, 2),
        legalTargetIds: [],
      };
    case 5: {
      const allies = alliesOf(state, actor);
      return {
        slot: 5,
        label: 'Восточный ветер (ряд)',
        needsTarget: true,
        disabledReason: manaReason(actor, 2),
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
  }
}

/**
 * Titan: валун в обход охраны, метеоритный дождь, кулак, исцеляющая волна за убийства, ускорение ряда.
 */
export const titanAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  preChoice(state, actor) {
    if (actor.passiveUsed) {
      return;
    }
    actor.passiveUsed = true;
    const warriors = alliesOf(state, actor).filter(
      (unit) => unit.heroClassCode !== 'Titan' && unit.damage > unit.power
    );
    const pupil = warriors[randInt(0, warriors.length - 1)];
    if (!pupil) {
      return;
    }
    const bonus = 2 + actor.lvl;
    pupil.damage += bonus;
    state.log.push(`${actor.displayName} наставляет ${pupil.displayName}: +${bonus} атаки навсегда.`);
  },

  apply(state, actor, input): AbilityOutcome {
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }
    const target = meta.needsTarget
      ? state.units.find(
          (unit) => unit.id === input.targetId && meta.legalTargetIds.includes(unit.id)
        )
      : undefined;
    if (meta.needsTarget && !target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }

    if (input.slot === 1 && target) {
      const damage = dealDamage(actor, target, { kind: 'ranged', source: 'ARROWS' }, state);
      if (damage === 0) {
        state.log.push(`${actor.displayName}: валун пролетает мимо.`);
        return { status: 'done' };
      }
      state.log.push(
        `${actor.displayName} обрушивает валун на ${target.displayName} ${formatLastLogDamage(damage)}.`
      );
      markDeadIfNeeded(state, target);
      rewardKill(state, actor, target);
      return { status: 'done' };
    }

    if (input.slot === 2 && target) {
      const err = trySpendMana(actor, 3);
      if (err) {
        return { status: 'reject', message: err };
      }
      const strip = Math.floor(actor.lvl / 2) + 4;
      for (const enemy of squareTargets(state, actor, target)) {
        const damage = dealDamage(
          actor,
          enemy,
          { kind: 'magic', damageMult: 0.5, source: 'EARTH' },
          state
        );
        const armorLoss = enemy.alive
          ? Math.min(Math.max(0, enemy.armor), Math.round(strip * consumeSrcFactor(enemy, 'DESTROYARMOR')))
          : 0;
        enemy.armor -= armorLoss;
        state.log.push(
          `${enemy.displayName} завален камнями${damage > 0 ? `, теряя ${formatLastLogDamage(damage)} ОЗ` : ''} и ${armorLoss} брони.`
        );
        markDeadIfNeeded(state, enemy);
        rewardKill(state, actor, enemy);
      }
      return { status: 'done' };
    }

    if (input.slot === 3 && target) {
      const damage = dealDamage(actor, target, { kind: 'melee' }, state);
      if (damage === 0) {
        state.log.push(`${actor.displayName}: могучий кулак — промах.`);
        return { status: 'done' };
      }
      state.log.push(
        `Удар титана впечатывает в землю ${target.displayName}, нанося ${formatLastLogDamage(damage)} урона!`
      );
      markDeadIfNeeded(state, target);
      if (target.alive && rollSrcChance(state, target, 50 + actor.lvl * 2, 'LOWERINGLEVEL')) {
        target.maxHp = Math.max(1, Math.round(target.maxHp * 0.85));
        target.health = Math.min(target.health, target.maxHp);
        state.log.push(`Максимальное здоровье ${target.displayName} снижено до ${target.maxHp}.`);
      }
      rewardKill(state, actor, target);
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const err = trySpendMana(actor, 2);
      if (err) {
        return { status: 'reject', message: err };
      }
      actor.ultaCharges -= 1;
      const armor = 15 + actor.lvl * 2;
      for (const ally of ownRowAllies(state, actor)) {
        grantEffect(ally, 'STONEFLESH', 2, armor);
      }
      for (const ally of alliesOf(state, actor)) {
        const healed = healUnit(ally, Math.floor(actor.power / 2) + ally.lvl * 2);
        state.log.push(`${ally.displayName} восстанавливает ${healed} здоровья.`);
      }
      state.log.push(`${actor.displayName}: каменная кожа (+${armor} брони) на свой ряд.`);
      return { status: 'done' };
    }

    if (input.slot === 5 && target) {
      const err = trySpendMana(actor, 2);
      if (err) {
        return { status: 'reject', message: err };
      }
      const haste = 15 + actor.lvl;
      const row = alliesOf(state, actor).filter((unit) => unit.row === target.row);
      for (const ally of row) {
        if (hasEffect(ally, 'SLOW')) {
          delEffect(ally, 'SLOW', state);
        }
        grantEffect(ally, 'HASTE', 2, haste);
      }
      state.log.push(
        `${actor.displayName} призывает восточный ветер: ${target.row === 0 ? 'передний' : 'задний'} ряд ускоряется (+${haste} инициативы).`
      );
      return { status: 'done' };
    }

    return { status: 'reject', message: 'Способность недоступна' };
  },
};
