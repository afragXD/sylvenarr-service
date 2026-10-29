import {
  dealDamage,
  formatLastLogDamage,
  harmWithSource,
  markDeadIfNeeded,
} from '../damage';
import { formatLogDamage } from '../damageSources';
import { grantEffect } from '../effects';
import { isHolyClass } from '../races';
import { rollSrcChance } from '../resists';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { cdReason, setSlotCd, tickSlotCds } from './cooldowns';
import { alliesOf, meleeTargets, neighbourBehind } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

/** Порог шкалы нанесённого урона для «Шквала ударов». */
export const APAL = 200;

function applied(actor: BattleUnit): number {
  return actor.appliedDamage ?? 0;
}

function addApplied(actor: BattleUnit, amount: number): void {
  actor.appliedDamage = applied(actor) + Math.max(0, Math.round(amount));
}

function abilityMeta(state: BattleState, actor: BattleUnit, slot: AbilitySlot): AbilityInfo {
  const melee = meleeTargets(state, actor);
  const noMelee = melee.length === 0 ? 'Нет целей' : null;
  switch (slot) {
    case 1:
      return {
        slot: 1,
        label: 'Чёрная секира',
        needsTarget: true,
        attackKind: 'melee',
        disabledReason: noMelee,
        legalTargetIds: melee.map((unit) => unit.id),
      };
    case 2:
      return {
        slot: 2,
        label: `Шквал ударов (${applied(actor)}/${APAL})`,
        needsTarget: true,
        attackKind: 'melee',
        disabledReason:
          applied(actor) < APAL ? `Нужно ${APAL} нанесённого урона (${applied(actor)})` : noMelee,
        legalTargetIds: melee.map((unit) => unit.id),
      };
    case 3: {
      const targets = state.units.filter((unit) => unit.alive && unit.team !== actor.team);
      return {
        slot: 3,
        label: 'Садист',
        needsTarget: true,
        attackKind: 'ranged',
        disabledReason: cdReason(actor, 3) ?? (targets.length === 0 ? 'Нет целей' : null),
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 4: {
      const allies = alliesOf(state, actor).filter((unit) => unit.id !== actor.id);
      return {
        slot: 4,
        label: 'Руна берсерка',
        needsTarget: true,
        disabledReason: cdReason(actor, 4) ?? (allies.length === 0 ? 'Нет союзников' : null),
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 5:
      return {
        slot: 5,
        label: 'Неумолимый таран',
        needsTarget: true,
        attackKind: 'melee',
        disabledReason: cdReason(actor, 5) ?? noMelee,
        legalTargetIds: melee.map((unit) => unit.id),
      };
  }
}

/** Удар тарана: +20% по святым. */
function ramHit(state: BattleState, actor: BattleUnit, target: BattleUnit): number {
  const damage = dealDamage(
    actor,
    target,
    { kind: 'melee', damageMult: isHolyClass(target.heroClassCode) ? 1.2 : 1 },
    state
  );
  if (damage > 0) {
    state.log.push(
      `${actor.displayName} тараном сминает ${target.displayName} ${formatLastLogDamage(damage)}.`
    );
    addApplied(actor, damage);
    markDeadIfNeeded(state, target);
  }
  return damage;
}

/**
 * Antipaladin: секира с доп. ходом, шкала урона, бомба с гвоздями, руна берсерка, таран.
 */
export const antipaladinAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  preChoice(_state, actor) {
    tickSlotCds(actor);
  },

  apply(state, actor, input): AbilityOutcome {
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }
    const target = state.units.find(
      (unit) => unit.id === input.targetId && meta.legalTargetIds.includes(unit.id)
    );
    if (!target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }

    if (input.slot === 1) {
      const damage = dealDamage(
        actor,
        target,
        { kind: 'melee', armorIgnore: (25 + actor.lvl) / 100 },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: чёрная секира — промах.`);
        return { status: 'done' };
      }
      state.log.push(
        `${actor.displayName} рубит чёрной секирой ${target.displayName} ${formatLastLogDamage(damage)}.`
      );
      addApplied(actor, damage);
      markDeadIfNeeded(state, target);
      if (!target.alive && actor.alive) {
        state.log.push(`${actor.displayName} упивается расправой и ходит ещё раз.`);
        return { status: 'done', keepTurn: true };
      }
      return { status: 'done' };
    }

    if (input.slot === 2) {
      actor.appliedDamage = applied(actor) - APAL;
      const hits = 3 + Math.floor(actor.lvl / 5);
      let landed = 0;
      for (let i = 0; i < hits && target.alive && actor.alive; i += 1) {
        const damage = dealDamage(actor, target, { kind: 'melee', accuracyPenalty: 5 * i }, state);
        if (damage > 0) {
          landed += 1;
          state.log.push(
            `Удар ${i + 1}: ${actor.displayName} бьёт ${target.displayName} ${formatLastLogDamage(damage)}.`
          );
          addApplied(actor, damage / 2);
          markDeadIfNeeded(state, target);
        }
      }
      state.log.push(`${actor.displayName}: шквал ударов — ${landed} из ${hits} попаданий.`);
      return { status: 'done' };
    }

    if (input.slot === 3) {
      setSlotCd(actor, 3, 4);
      const row = state.units.filter(
        (unit) => unit.alive && unit.team === target.team && unit.row === target.row
      );
      const amount = Math.floor(actor.damage / 3) + actor.lvl * 2;
      for (const enemy of row) {
        const dealt = harmWithSource(state, enemy, amount, 'ARROWS');
        if (dealt > 0) {
          state.log.push(
            `Бомба с гвоздями ранит ${enemy.displayName} ${formatLogDamage(dealt, 'ARROWS')}.`
          );
        }
        markDeadIfNeeded(state, enemy);
        if (enemy.alive && rollSrcChance(state, enemy, 50 + actor.lvl * 2, 'DEATH')) {
          grantEffect(enemy, 'BLEEDING', 2, 0.75);
          state.log.push(`${enemy.displayName} истекает кровью.`);
        }
      }
      return { status: 'done' };
    }

    if (input.slot === 4) {
      setSlotCd(actor, 4, 2);
      const bonus = Math.round(target.armor * (1 + 0.01 * actor.lvl));
      grantEffect(target, 'BERSERK', 1, bonus);
      state.log.push(
        `${actor.displayName} чертит руну берсерка: ${target.displayName} сбрасывает броню и получает +${bonus} атаки.`
      );
      return { status: 'done' };
    }

    setSlotCd(actor, 5, 3);
    const behind = neighbourBehind(state, target);
    const first = ramHit(state, actor, target);
    if (first === 0) {
      state.log.push(`${actor.displayName}: таран не достигает ${target.displayName}.`);
    }
    if (behind?.alive && actor.alive) {
      ramHit(state, actor, behind);
    }
    return { status: 'done' };
  },
};
