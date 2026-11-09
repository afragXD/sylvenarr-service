import { dealDamage, formatLastLogDamage, markDeadIfNeeded, randInt } from '../damage';
import { grantEffect, healUnit } from '../effects';
import { rollMindChance } from '../resists';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { cdReason, setSlotCd, tickSlotCds } from './cooldowns';
import { enemiesInColumn, enemiesOf, meleeOrAll, omitConcealed } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

function abilityMeta(state: BattleState, actor: BattleUnit, slot: AbilitySlot): AbilityInfo {
  switch (slot) {
    case 1: {
      const targets = meleeOrAll(state, actor, false);
      return {
        slot: 1,
        label: 'Трёхглавый удар (по ряду)',
        needsTarget: true,
        attackKind: 'melee',
        previewSource: 'WEAPON',
        previewDamageMult: 1.15,
        previewAccuracyPenalty: 5,
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
        disabledReason: cdReason(actor, 2, 2) ?? (targets.length === 0 ? 'Нет целей' : null),
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
    case 4:
      return {
        slot: 4,
        label: 'Рёв королей',
        needsTarget: false,
        disabledReason: cdReason(actor, 4, 3),
        legalTargetIds: [],
      };
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

  preChoice(_state, actor) {
    tickSlotCds(actor);
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
      // Как в боте: все живые враги на ряду цели (без отсечения GUARDED/SANCTUM).
      const rowTargets = omitConcealed(
        actor,
        state.units.filter(
          (unit) => unit.alive && unit.team !== actor.team && unit.row === primary.row,
        ),
      );
      let killed = false;
      for (const enemy of rowTargets) {
        // CUT-2026-11-01c AC-4: встроенный штраф точности −5 пп.
        const damage = dealDamage(
          actor,
          enemy,
          {
            kind: 'melee',
            damageMult: 1.15,
            armorIgnore: 0,
            source: 'WEAPON',
            accuracyPenalty: 5,
          },
          state
        );
        if (damage > 0) {
          state.log.push(
            `${actor.displayName} бьёт ${enemy.displayName} ${formatLastLogDamage(damage)} (трёхглавый удар).`
          );
        }
        markDeadIfNeeded(state, enemy);
        if (!enemy.alive) {
          killed = true;
          healUnit(actor, Math.max(0, Math.round(enemy.maxHp * 0.33)));
        }
      }
      if (killed) {
        state.log.push(`${actor.displayName} пожирает убитых и залечивает раны.`);
      }
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const target = pickMelee(state, actor, input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const column = enemiesInColumn(state, actor, target);
      const second = column.find((unit) => unit.id !== target.id);
      const strikes: Array<readonly [BattleUnit, number]> = [[target, 2]];
      if (second) {
        strikes.push([second, 1]);
      }
      for (const [enemy, mult] of strikes) {
        const damage = dealDamage(
          actor,
          enemy,
          { kind: 'melee', damageMult: mult, armorIgnore: 0, source: 'WEAPON' },
          state,
        );
        if (damage > 0) {
          state.log.push(
            `${actor.displayName} бьёт клинком Бездны ${enemy.displayName} ${formatLastLogDamage(damage)}.`,
          );
        }
        markDeadIfNeeded(state, enemy);
        if (enemy.alive && randInt(1, 100) <= 70 + actor.lvl) {
          grantEffect(enemy, 'PETRIFIED', 2, 15);
          state.log.push(`${enemy.displayName} каменеет.`);
        }
      }
      setSlotCd(actor, 2, 2);
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const damage = dealDamage(
        actor,
        target,
        { kind: 'magic', damageMult: 1, armorIgnore: 0.2, source: 'FIRE' },
        state
      );
      const haste = 15 + Math.floor(actor.lvl / 3);
      grantEffect(actor, 'HASTE', 2, haste);
      if (damage === 0) {
        state.log.push(`${actor.displayName}: кислота — промах, но сам ускоряется (+${haste}).`);
        return { status: 'done' };
      }
      state.log.push(
        `${actor.displayName} плюёт кислотой в ${target.displayName} ${formatLastLogDamage(damage)}.`
      );
      markDeadIfNeeded(state, target);
      if (target.alive && randInt(1, 100) <= 75) {
        const strip = Math.max(1, Math.round(damage * 0.4));
        target.armor = Math.max(-15 - actor.lvl, target.armor - strip);
        state.log.push(`Доспехи ${target.displayName} уничтожены на ${strip}.`);
      }
      return { status: 'done' };
    }

    if (input.slot === 4) {
      setSlotCd(actor, 4, 3);
      if (actor.health * 2 <= actor.maxHp) {
        for (const ally of state.units.filter((unit) => unit.alive && unit.team === actor.team)) {
          const power = Math.round(ally.damage * 0.33);
          if (power > 0) {
            grantEffect(ally, 'STRENGTH', 2, power);
          }
        }
        grantEffect(actor, 'REGENHP', 3, 1.5);
        state.log.push(`${actor.displayName}: рёв королей поднимает союзников.`);
        return { status: 'done' };
      }
      const loss = 8 + randInt(actor.lvl, actor.lvl * 2);
      for (const enemy of enemiesOf(state, actor)) {
        enemy.morale -= loss;
        if (rollMindChance(state, enemy, 75 + actor.lvl)) {
          grantEffect(enemy, 'SLOW', 2, 15 + Math.floor(actor.lvl / 2));
        }
      }
      state.log.push(`${actor.displayName}: рёв королей давит на врагов (−${loss} боевого духа).`);
      return { status: 'done' };
    }

    // slot 5
    actor.ultaCharges -= 1;
    const flat = 15 + actor.lvl;
    const enemies = enemiesOf(state, actor);
    for (const enemy of enemies) {
      enemy.health -= flat;
      state.log.push(`Катавасия сотрясает ${enemy.displayName} (−${flat} ОЗ).`);
      markDeadIfNeeded(state, enemy);
      if (enemy.alive) {
        enemy.row = randInt(0, 1) as 0 | 1;
      }
    }
    // Пересчитать колонны в каждом ряду — иначе «удар по колонне» смотрит на устаревшие номера.
    for (const row of [0, 1] as const) {
      const rowUnits = enemies
        .filter((enemy) => enemy.alive && enemy.row === row)
        .sort((a, b) => a.column - b.column || a.id.localeCompare(b.id));
      rowUnits.forEach((enemy, column) => {
        enemy.column = column;
      });
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
