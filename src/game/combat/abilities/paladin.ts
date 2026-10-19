import { dealDamage, markDeadIfNeeded, randInt } from '../damage';
import { grantEffect, healUnit, tryLevelDrain } from '../effects';
import { levelUpUnit } from '../level';
import { setWard } from '../resists';
import { ROW_BACK, ROW_FRONT } from '../settings';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { enemiesOf, meleeOrAll, moveToOtherRow } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

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
        label: 'Парные клинки',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2:
      return {
        slot: 2,
        label: `Разжечь пламя (${actor.ultaCharges})`,
        needsTarget: false,
        disabledReason: actor.ultaCharges <= 0 ? 'Нет зарядов' : null,
        legalTargetIds: [],
      };
    case 3: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 3,
        label: 'Разбить душу',
        needsTarget: true,
        disabledReason:
          actor.mana < 2 ? 'Нужно 2 МР' : targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 4: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 4,
        label: 'Святое копьё',
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
    case 5:
      return {
        slot: 5,
        label: 'Военная молитва',
        needsTarget: false,
        disabledReason: actor.mana < 3 ? 'Нужно 3 МР' : null,
        legalTargetIds: [],
      };
  }
}

/**
 * Paladin: двойной удар, пылающие мечи, святая магия, заряд, молитва.
 */
export const paladinAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  apply(state, actor, input): AbilityOutcome {
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      const target = pickMelee(state, actor, input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      for (let i = 0; i < 2; i += 1) {
        if (!target.alive) {
          break;
        }
        const damage = dealDamage(
          actor,
          target,
          { damageMult: 1.05, armorIgnore: 0, source: 'WEAPON' },
          state
        );
        if (damage === 0) {
          state.log.push(`${actor.displayName}: клинок ${i + 1} — промах.`);
        } else {
          state.log.push(
            `${actor.displayName} бьёт парным клинком (${i + 1}) ${target.displayName} на ${damage}.`
          );
          markDeadIfNeeded(state, target);
        }
      }
      return { status: 'done' };
    }

    if (input.slot === 2) {
      actor.ultaCharges -= 1;
      // Как в боте: пылающие мечи и вард от Огня на себя.
      setWard(actor, 'FIRE', 1);
      grantEffect(actor, 'FIREDWEAPON', 2 + Math.floor(actor.lvl / 5), 0);
      state.log.push(`${actor.displayName}: клинки окутаны святым пламенем; вард от Огня.`);
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      if (actor.mana < 2) {
        return { status: 'reject', message: 'Нужно 2 МР' };
      }
      actor.mana -= 2;
      const damage = dealDamage(
        actor,
        target,
        { damageMult: 1.1, armorIgnore: 0.15, source: 'HOLY' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: разбить душу — промах.`);
        return { status: 'done' };
      }
      state.log.push(
        `${actor.displayName} разбивает душу ${target.displayName} (${damage}).`
      );
      markDeadIfNeeded(state, target);
      if (target.alive && randInt(1, 100) <= 70 && tryLevelDrain(state, target)) {
        const n = 1 + Math.floor(actor.lvl / 5);
        levelUpUnit(target, -n, state);
        levelUpUnit(actor, n, state);
        state.log.push(`${actor.displayName} поглощает ${n} уровней у ${target.displayName}.`);
      }
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      actor.row = ROW_FRONT;
      grantEffect(actor, 'HASTE', 2, 20);
      const undeadBonus =
        target.heroClassCode === 'Archlich' ||
        target.heroClassCode === 'Zombie' ||
        target.heroClassCode === 'SkeletonChampion' ||
        target.heroClassCode === 'GhostWarrior' ||
        target.heroClassCode === 'Dracolich' ||
        target.isLichSummon
          ? 1.25
          : 1;
      const damage = dealDamage(
        actor,
        target,
        { damageMult: undeadBonus, armorIgnore: 0, source: 'HOLY' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: святое копьё — промах.`);
      } else {
        state.log.push(
          `${actor.displayName} вырывается вперёд копьём по ${target.displayName} (${damage}).`
        );
        markDeadIfNeeded(state, target);
      }
      return { status: 'done' };
    }

    // slot 5
    if (actor.mana < 3) {
      return { status: 'reject', message: 'Нужно 3 МР' };
    }
    actor.mana -= 3;
    grantEffect(actor, 'REGENHP', 2 + Math.floor(actor.lvl / 5), 1.1);
    // Как в боте: STUNRESIST 3 р. power 50 — 50% сопротивление оглушению.
    grantEffect(actor, 'STUN_IMMUNE', 3, 50);
    moveToOtherRow(actor);
    const hush = healUnit(actor, randInt(5, 12));
    state.log.push(
      `${actor.displayName} читает молитву (регенерация, защита от оглушения${hush > 0 ? `, +${hush} ОЗ` : ''}).`
    );
    return { status: 'done' };
  },
};

function pickMelee(
  state: BattleState,
  actor: BattleUnit,
  targetId: string | undefined
): BattleUnit | undefined {
  const targets = meleeOrAll(state, actor, false);
  return (targetId ? targets.find((unit) => unit.id === targetId) : undefined) ?? targets[0];
}
