import { dealDamage, markDeadIfNeeded, PILOT_LVL, randInt } from '../damage';
import { grantEffect, healUnit } from '../effects';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { alliesOf, enemiesOf, meleeOrAll } from './targets';
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
        label: 'Трёхглавый удар',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const targets = meleeOrAll(state, actor, false);
      return {
        slot: 2,
        label: 'Клинок Бездны',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 3,
        label: 'Плевок кислотой',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 4: {
      const allies = alliesOf(state, actor);
      return {
        slot: 4,
        label: 'Глубинная защита',
        needsTarget: true,
        disabledReason: allies.length === 0 ? 'Нет союзников' : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 5:
      return {
        slot: 5,
        label: `Катавасия (${actor.ultaCharges})`,
        needsTarget: false,
        disabledReason: actor.ultaCharges <= 0 ? 'Нет зарядов' : null,
        legalTargetIds: [],
      };
  }
}

/**
 * DemonLord: AoE ряд, окаменение, кислота, щит/реген, перемешивание рядов.
 */
export const demonLordAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  apply(state, actor, input): AbilityOutcome {
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      const primary = pickMelee(state, actor, input.targetId);
      if (!primary) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const rowTargets = enemiesOf(state, actor).filter((unit) => unit.row === primary.row);
      let killed = false;
      for (const enemy of rowTargets) {
        const damage = dealDamage(actor, enemy, { damageMult: 1.15, armorIgnore: 0 });
        if (damage > 0) {
          state.log.push(
            `${actor.displayName} бьёт ${enemy.displayName} на ${damage} (трёхглавый удар).`
          );
        }
        markDeadIfNeeded(state, enemy);
        if (!enemy.alive) {
          killed = true;
        }
      }
      if (killed) {
        const healed = healUnit(actor, Math.max(1, Math.round(primary.maxHp * 0.25)));
        state.log.push(`${actor.displayName} пожирает труп и восстанавливает ${healed} ОЗ.`);
      }
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const target = pickMelee(state, actor, input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const damage = dealDamage(actor, target, { damageMult: 2, armorIgnore: 0 });
      if (damage === 0) {
        state.log.push(`${actor.displayName}: клинок Бездны — промах.`);
        return { status: 'done' };
      }
      state.log.push(
        `${actor.displayName} обрушивает клинок Бездны на ${target.displayName} (${damage}).`
      );
      markDeadIfNeeded(state, target);
      if (target.alive && randInt(1, 100) <= 70 + PILOT_LVL) {
        grantEffect(target, 'PETRIFIED', 2, 15);
        grantEffect(target, 'CHAINED', 2, 0);
        state.log.push(`${target.displayName} обращается в камень.`);
      }
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const damage = dealDamage(actor, target, { damageMult: 1, armorIgnore: 0.2 });
      if (damage === 0) {
        state.log.push(`${actor.displayName}: кислота — промах.`);
        return { status: 'done' };
      }
      state.log.push(
        `${actor.displayName} плюёт кислотой в ${target.displayName} на ${damage}.`
      );
      markDeadIfNeeded(state, target);
      if (target.alive && randInt(1, 100) <= 75) {
        const strip = Math.max(1, Math.round(damage * 0.4));
        target.armor = Math.max(-15 - PILOT_LVL, target.armor - strip);
        state.log.push(`Доспехи ${target.displayName} уничтожены на ${strip}.`);
      }
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const ally = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!ally) {
        return { status: 'reject', message: 'Нужен союзник' };
      }
      grantEffect(actor, 'GUARDED', 2, 5);
      grantEffect(ally, 'REGENHP', 2 + Math.floor(PILOT_LVL / 5), 1.25);
      state.log.push(
        `${actor.displayName} окутывает себя огненным щитом и дарует регенерацию ${ally.displayName}.`
      );
      return { status: 'done' };
    }

    // slot 5
    actor.ultaCharges -= 1;
    const flat = 15 + PILOT_LVL;
    for (const enemy of enemiesOf(state, actor)) {
      enemy.health -= flat;
      state.log.push(`Катавасия сотрясает ${enemy.displayName} (−${flat} ОЗ).`);
      markDeadIfNeeded(state, enemy);
      if (enemy.alive) {
        enemy.row = randInt(0, 1) as 0 | 1;
      }
    }
    state.log.push(`${actor.displayName} перемешивает ряды противника.`);
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
