import { dealDamage, markDeadIfNeeded, randInt, formatLastLogDamage } from '../damage';
import { delEffect, grantEffect, hasEffect } from '../effects';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { alliesOf, meleeOrAll, neighbourBehind, ownRowAllies } from './targets';
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
        label: 'Копьё',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const targets = meleeOrAll(state, actor, true);
      return {
        slot: 2,
        label: 'Пика',
        needsTarget: true,
        disabledReason: actor.horseIsDead
          ? 'Конь погиб'
          : targets.length === 0
            ? 'Нет целей'
            : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3: {
      const cost = 100 + actor.lvl * 2;
      return {
        slot: 3,
        label: 'Баллада',
        needsTarget: false,
        disabledReason: actor.gold < cost ? `Нужно ${cost} золота` : null,
        legalTargetIds: [],
      };
    }
    case 4: {
      const allies = alliesOf(state, actor).filter((unit) => unit.id !== actor.id);
      return {
        slot: 4,
        label: 'Охрана',
        needsTarget: true,
        disabledReason: allies.length === 0 ? 'Нет союзников' : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 5:
      return {
        slot: 5,
        label: 'Подорожник',
        needsTarget: false,
        disabledReason: null,
        legalTargetIds: [],
      };
  }
}

/**
 * Knight: слоты 1–5 + preChoice броня ряду.
 */
export const knightAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  preChoice(state, actor) {
    const bonus = actor.lvl + 1;
    for (const ally of ownRowAllies(state, actor)) {
      if (hasEffect(ally, 'ROW_FORTIFY')) {
        delEffect(ally, 'ROW_FORTIFY');
      }
      grantEffect(ally, 'ROW_FORTIFY', 1, bonus);
    }
    state.log.push(
      `${actor.displayName} укрепляет доспехи ряда на ${bonus}.`
    );
  },

  apply(state, actor, input): AbilityOutcome {
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      const target = resolveTarget(state, actor, input.targetId, false);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const damage = dealDamage(actor, target, { damageMult: 1.05, armorIgnore: 0 });
      if (damage === 0) {
        state.log.push(`${actor.displayName} промахнулся копьём по ${target.displayName}.`);
      } else {
        state.log.push(
          `${actor.displayName} бьёт копьём ${target.displayName} ${formatLastLogDamage(damage)}.`
        );
        markDeadIfNeeded(state, target);
        maybeKillHorse(actor, state);
        if (target.alive && randInt(1, 100) <= 50 + actor.lvl * 2) {
          const behind = neighbourBehind(state, target);
          if (behind) {
            const splash = dealDamage(actor, behind, { damageMult: 0.6, armorIgnore: 0 });
            if (splash > 0) {
              state.log.push(`Копьё задевает ${behind.displayName} ${formatLastLogDamage(splash)}.`);
              markDeadIfNeeded(state, behind);
            }
          }
        }
      }
      return { status: 'done' };
    }

    if (input.slot === 2) {
      if (actor.horseIsDead) {
        return { status: 'reject', message: 'Конь погиб' };
      }
      const target = resolveTarget(state, actor, input.targetId, true);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const damage = dealDamage(actor, target, { damageMult: 0.75, armorIgnore: 0 });
      if (damage === 0) {
        state.log.push(`${actor.displayName}: удар пикой — промах.`);
      } else {
        state.log.push(
          `${actor.displayName} наносит кавалерийский удар по ${target.displayName} ${formatLastLogDamage(damage)}.`
        );
        markDeadIfNeeded(state, target);
        maybeKillHorse(actor, state);
      }
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const cost = 100 + actor.lvl * 2;
      actor.gold -= cost;
      const atk = 20 + actor.lvl * 2;
      for (const ally of ownRowAllies(state, actor)) {
        grantEffect(ally, 'STRENGTH', 1 + Math.floor(actor.lvl / 5), atk);
        grantEffect(ally, 'BLESSED', 1 + Math.floor(actor.lvl / 6), 0.5);
      }
      state.log.push(
        `${actor.displayName} исполняет боевую балладу (−${cost} золота, +атака ряду).`
      );
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const ally = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!ally || ally.id === actor.id) {
        return { status: 'reject', message: 'Нужен союзник' };
      }
      grantEffect(ally, 'GUARDED', 2);
      state.log.push(`${ally.displayName} под охраной ${actor.displayName}.`);
      return { status: 'done' };
    }

    // slot 5
    delEffect(actor, 'BLEEDING');
    delEffect(actor, 'POISON');
    delEffect(actor, 'BURNING');
    state.log.push(`${actor.displayName} снимает яд, ожог и кровоток.`);
    if (randInt(1, 100) <= 5 * actor.lvl) {
      state.log.push(`${actor.displayName} сохраняет ход!`);
      return { status: 'done', keepTurn: true };
    }
    return { status: 'done' };
  },
};

function resolveTarget(
  state: BattleState,
  actor: BattleUnit,
  targetId: string | undefined,
  ignoreMelee: boolean
): BattleUnit | undefined {
  const targets = meleeOrAll(state, actor, ignoreMelee);
  return (targetId ? targets.find((unit) => unit.id === targetId) : undefined) ?? targets[0];
}

/**
 * Лошадь гибнет при HP ≤ 50%.
 */
export function maybeKillHorse(actor: BattleUnit, state: BattleState): void {
  if (actor.heroClassCode !== 'Knight' || actor.horseIsDead) {
    return;
  }
  if (actor.health <= actor.maxHp * 0.5) {
    actor.horseIsDead = true;
    actor.initiative = Math.max(1, Math.floor(actor.initiative / 2));
    state.log.push(`Конь ${actor.displayName} погибает — пика недоступна.`);
  }
}
