import { dealDamage, lastDealDamageResult, markDeadIfNeeded, randInt, formatLastLogDamage } from '../damage';
import { grantEffect, hasEffect, trySpendMana, tryStun } from '../effects';
import { rollMindChance } from '../resists';
import { ROW_BACK, ROW_FRONT } from '../settings';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import {
  createPhantomCopy,
  createSummon,
  preferPhantomRow,
  preferSummonRow,
} from './summon';
import { primaryAttackKind } from './primary-attack';
import { alliesOf, enemiesOf } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

function abilityMeta(
  state: BattleState,
  actor: BattleUnit,
  slot: AbilitySlot
): AbilityInfo {
  switch (slot) {
    case 1: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 1,
        label: 'Цепная молния',
        needsTarget: true,
        attackKind: 'magic',
        disabledReason:
          actor.mana < 3
            ? 'Нужно 3 МР'
            : targets.length === 0
              ? 'Нет целей'
              : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const targets = state.units.filter(
        (unit) => unit.alive && unit.id !== actor.id && !hasEffect(unit, 'SANCTUM')
      );
      return {
        slot: 2,
        label: 'Клоны',
        needsTarget: true,
        disabledReason:
          actor.row !== ROW_BACK
            ? 'Нужен задний ряд'
            : actor.mana < 5
              ? 'Нужно 5 МР'
              : targets.length === 0
                ? 'Нет целей'
                : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 3,
        label: 'Помрачение рассудка',
        needsTarget: true,
        disabledReason:
          actor.mindCloudCd > 0
            ? `Кулдаун ${actor.mindCloudCd} р.`
            : actor.mana < 2
              ? 'Нужно 2 МР'
              : targets.length === 0
                ? 'Нет целей'
                : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 4: {
      const owned = state.units.filter(
        (unit) => unit.alive && unit.isSummon && unit.summonerId === actor.id
      ).length;
      return {
        slot: 4,
        label: 'Призыв эктоплазмы',
        needsTarget: false,
        disabledReason:
          actor.ectoplasmCd > 0
            ? `Кулдаун ${actor.ectoplasmCd} р.`
            : actor.mana < 3
              ? 'Нужно 3 МР'
              : owned >= actor.maxSummons
                ? 'Лимит саммонов'
                : preferSummonRow(state, actor) === null
                  ? 'Нет места'
                  : null,
        legalTargetIds: [],
      };
    }
    case 5:
      return {
        slot: 5,
        label: 'Философский камень',
        needsTarget: false,
        disabledReason: actor.mana < 3 ? 'Нужно 3 МР' : null,
        legalTargetIds: [],
      };
  }
}

function maybeFrontRowStun(
  state: BattleState,
  actor: BattleUnit,
  target: BattleUnit,
  fromFront: boolean
): void {
  if (!fromFront) {
    return;
  }
  const deal = lastDealDamageResult();
  if (deal.missed || deal.damage <= 0) {
    return;
  }
  if (randInt(1, 100) > 50 + actor.lvl) {
    return;
  }
  if (tryStun(state, target, 1)) {
    state.log.push(`${target.displayName} оглушён разрядом.`);
  }
}

/** Союзники жертвы с минимальным (ОЗ − уровень); при ничьей — случайный. */
function pickFragileAlly(allies: BattleUnit[]): BattleUnit {
  let best = Number.POSITIVE_INFINITY;
  const pool: BattleUnit[] = [];
  for (const unit of allies) {
    const score = unit.health - unit.lvl;
    if (score < best) {
      best = score;
      pool.length = 0;
      pool.push(unit);
    } else if (score === best) {
      pool.push(unit);
    }
  }
  return pool[randInt(0, pool.length - 1)]!;
}

/**
 * Demiurge: chain lightning, phantom, mind control, ectoplasm.
 */
export const demiurgeAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  preChoice(state, actor) {
    if (actor.mindCloudCd > 0) {
      actor.mindCloudCd -= 1;
    }
    if (actor.ectoplasmCd > 0) {
      actor.ectoplasmCd -= 1;
    }
    const others = alliesOf(state, actor).filter((unit) => unit.id !== actor.id);
    if (others.length === 0 || randInt(1, 100) > 50) {
      return;
    }
    const ally = others[randInt(0, others.length - 1)]!;
    grantEffect(ally, 'AIRSHIELD', 2, 33);
    state.log.push(
      `${actor.displayName}: воздушный щит → ${ally.displayName}.`
    );
  },

  apply(state, actor, input): AbilityOutcome {
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      const err = trySpendMana(actor, 3);
      if (err) {
        return { status: 'reject', message: err };
      }
      const primary = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!primary) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const fromFront = actor.row === ROW_FRONT;
      const d1 = dealDamage(
        actor,
        primary,
        { kind: 'magic', damageMult: 1, armorIgnore: 0.1, source: 'AIR' },
        state
      );
      if (d1 > 0) {
        state.log.push(`${actor.displayName}: молния → ${primary.displayName} ${formatLastLogDamage(d1)}.`);
        markDeadIfNeeded(state, primary);
      }
      maybeFrontRowStun(state, actor, primary, fromFront);

      const pool = enemiesOf(state, actor).filter((unit) => unit.id !== primary.id);
      for (let i = 0; i < 2 && pool.length > 0; i += 1) {
        const idx = randInt(0, pool.length - 1);
        const next = pool.splice(idx, 1)[0]!;
        const mult = 0.5 ** (i + 1);
        const dmg = dealDamage(
          actor,
          next,
          { kind: 'magic', damageMult: mult, armorIgnore: 0.1, source: 'AIR', evadeCoef: 1.25 },
          state
        );
        if (dmg > 0) {
          state.log.push(
            `${actor.displayName}: разряд → ${next.displayName} ${formatLastLogDamage(dmg)}.`
          );
          markDeadIfNeeded(state, next);
        }
        maybeFrontRowStun(state, actor, next, fromFront);
      }
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const err = trySpendMana(actor, 5);
      if (err) {
        return { status: 'reject', message: err };
      }
      const template = state.units.find(
        (unit) => unit.alive && unit.id === input.targetId && unit.id !== actor.id
      );
      if (!template) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const row = preferPhantomRow(state, actor);
      if (row === null) {
        state.log.push(`${actor.displayName}: нет места для фантома.`);
        return { status: 'done' };
      }
      const phantom = createPhantomCopy(state, actor, template, row);
      if (!phantom) {
        state.log.push(`${actor.displayName}: нет места для фантома.`);
        return { status: 'done' };
      }
      state.log.push(`${actor.displayName} копирует ${template.displayName}.`);
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const err = trySpendMana(actor, 2);
      if (err) {
        return { status: 'reject', message: err };
      }
      const victim = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!victim) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      actor.mindCloudCd = 2;
      if (hasEffect(victim, 'MIND_WARD')) {
        state.log.push(`${victim.displayName} защищён от помрачения.`);
        return { status: 'done' };
      }
      const allies = alliesOf(state, victim).filter((unit) => unit.id !== victim.id);
      if (allies.length === 0) {
        state.log.push(`Для ${victim.displayName} нет целей атаки.`);
        return { status: 'done' };
      }
      const chance = 80 + actor.lvl;
      if (rollMindChance(state, victim, chance)) {
        const target = pickFragileAlly(allies);
        const dmg = dealDamage(
          victim,
          target,
          { kind: primaryAttackKind(state, victim), damageMult: 1, armorIgnore: 0 },
          state
        );
        state.log.push(
          `${actor.displayName} подчиняет ${victim.displayName} → ${target.displayName} ${formatLastLogDamage(dmg)}.`
        );
        markDeadIfNeeded(state, target);
      } else {
        state.log.push(`${actor.displayName}: помрачение не удалось.`);
      }
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const row = preferSummonRow(state, actor);
      if (row === null) {
        return { status: 'reject', message: 'Нет места для эктоплазмы' };
      }
      const owned = state.units.filter(
        (unit) => unit.alive && unit.isSummon && unit.summonerId === actor.id
      ).length;
      if (owned >= actor.maxSummons) {
        return { status: 'reject', message: 'Достигнут лимит саммонов' };
      }
      const manaErr = trySpendMana(actor, 3);
      if (manaErr) {
        return { status: 'reject', message: manaErr };
      }
      const summon = createSummon(state, {
        summoner: actor,
        heroCode: 'Ectoplasm',
        row,
      });
      if (!summon) {
        actor.mana += 3;
        return { status: 'reject', message: 'Не удалось призвать эктоплазму' };
      }
      actor.ectoplasmCd = 2;
      state.log.push(`${actor.displayName} призывает эктоплазму.`);
      return { status: 'done' };
    }

    // slot 5
    const err = trySpendMana(actor, 3);
    if (err) {
      return { status: 'reject', message: err };
    }
    state.log.push(
      `${actor.displayName} творит философский камень (предмет — позже).`
    );
    if (randInt(1, 100) <= 8 * actor.lvl) {
      state.log.push(`${actor.displayName} сохраняет ход.`);
      return { status: 'done', keepTurn: true };
    }
    return { status: 'done' };
  },
};
