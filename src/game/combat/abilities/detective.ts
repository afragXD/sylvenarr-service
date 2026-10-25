import { dealDamage, formatLastLogDamage, markDeadIfNeeded, randInt } from '../damage';
import { formatLogDamage } from '../damageSources';
import { grantEffect, hasEffect } from '../effects';
import { ROW_BACK, ROW_FRONT } from '../settings';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { enemiesOf, meleeOrAll, moveToOtherRow } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

const IGNORE_GUARD = { ignoreGuard: true } as const;

/** Под INVISIBLE — как дальник; иначе melee. GUARDED не блокирует (ignoreGuard). */
function rapierTargets(state: BattleState, actor: BattleUnit): BattleUnit[] {
  return meleeOrAll(state, actor, hasEffect(actor, 'INVISIBLE'), IGNORE_GUARD);
}

function abilityMeta(
  state: BattleState,
  actor: BattleUnit,
  slot: AbilitySlot
): AbilityInfo {
  switch (slot) {
    case 1: {
      const targets = rapierTargets(state, actor);
      return {
        slot: 1,
        label: 'Короткая рапира',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2:
      return {
        slot: 2,
        label: `Диверсия — яд (${actor.ultaCharges})`,
        needsTarget: false,
        disabledReason:
          actor.ultaCharges <= 0
            ? 'Нет яда'
            : enemiesOf(state, actor, IGNORE_GUARD).length === 0
              ? 'Нет врагов'
              : null,
        legalTargetIds: [],
      };
    case 3:
      return {
        slot: 3,
        label: `Зелье невидимости (${actor.ultaCharges})`,
        needsTarget: false,
        disabledReason: actor.ultaCharges <= 0 ? 'Нет зелий' : null,
        legalTargetIds: [],
      };
    case 4: {
      const targets = enemiesOf(state, actor, IGNORE_GUARD);
      return {
        slot: 4,
        label: 'Выпад дуэлянта',
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
    case 5: {
      if (actor.gun <= 0) {
        return {
          slot: 5,
          label: 'Перезарядка',
          needsTarget: false,
          disabledReason: actor.row !== ROW_FRONT ? 'Нужен передний ряд' : null,
          legalTargetIds: [],
        };
      }
      const targets = enemiesOf(state, actor, IGNORE_GUARD);
      return {
        slot: 5,
        label: 'Выстрел в упор',
        needsTarget: true,
        disabledReason:
          actor.row !== ROW_FRONT
            ? 'Нужен передний ряд'
            : targets.length === 0
              ? 'Нет целей'
              : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
  }
}

/**
 * Detective: rapier, poison diversion, invisible, lunge, gun.
 */
export const detectiveAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  apply(state, actor, input): AbilityOutcome {
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      const target = rapierTargets(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const savedLuck = actor.luck;
      if (hasEffect(target, 'MARKED')) {
        actor.luck = Math.min(80, actor.luck * 2);
      }
      const damage = dealDamage(actor, target, { damageMult: 1.1, armorIgnore: 0.25 }, state);
      actor.luck = savedLuck;
      if (damage === 0) {
        state.log.push(`${actor.displayName}: рапира — промах.`);
      } else {
        state.log.push(`${actor.displayName} бьёт рапирой ${target.displayName} ${formatLastLogDamage(damage)}.`);
        markDeadIfNeeded(state, target);
      }
      return { status: 'done' };
    }

    if (input.slot === 2) {
      actor.ultaCharges -= 1;
      for (const enemy of enemiesOf(state, actor, IGNORE_GUARD)) {
        grantEffect(enemy, 'POISON', 2, 0.8);
      }
      state.log.push(`${actor.displayName} отравляет вражеский отряд.`);
      return { status: 'done' };
    }

    if (input.slot === 3) {
      actor.ultaCharges -= 1;
      grantEffect(actor, 'INVISIBLE', 2, 25);
      state.log.push(`${actor.displayName} становится невидимым.`);
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const target = enemiesOf(state, actor, IGNORE_GUARD).find(
        (unit) => unit.id === input.targetId
      );
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      moveToOtherRow(actor);
      const damage = dealDamage(actor, target, { damageMult: 0.5, armorIgnore: 0.1 }, state);
      if (damage === 0) {
        state.log.push(`${actor.displayName}: выпад — промах.`);
      } else {
        grantEffect(actor, 'CONTR', 2 + Math.floor(actor.lvl / 6), 0);
        state.log.push(
          `${actor.displayName}: выпад дуэлянта → ${target.displayName} ${formatLastLogDamage(damage)}.`
        );
        markDeadIfNeeded(state, target);
      }
      return { status: 'done' };
    }

    // slot 5
    if (actor.gun <= 0) {
      const bonus = randInt(1, 4) + Math.floor(actor.lvl / 4);
      actor.luck += bonus;
      actor.gun = 1;
      state.log.push(`${actor.displayName} перезаряжает оружие (+${bonus} удачи).`);
      return { status: 'done' };
    }

    const target = enemiesOf(state, actor, IGNORE_GUARD).find(
      (unit) => unit.id === input.targetId
    );
    if (!target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }
    const rowMult = target.row === 1 ? 0.5 : 1;
    const shotgun = Math.max(
      0,
      Math.round((actor.damage * 1.25 - target.armor * 1.5) * rowMult) + randInt(10, 15)
    );
    target.health -= shotgun;
    actor.gun = 0;
    state.log.push(
      `${actor.displayName} стреляет в упор в ${target.displayName} ${formatLogDamage(shotgun, 'WEAPON')}.`
    );
    if (randInt(1, 100) <= 50) {
      moveToOtherRow(actor);
    }
    markDeadIfNeeded(state, target);
    return { status: 'done' };
  },
};
