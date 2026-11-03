import { dealDamage, formatLastLogDamage, markDeadIfNeeded, randInt } from '../damage';
import { delEffect, grantEffect, hasEffect, healUnit, tryStun } from '../effects';
import { rollSrcChance } from '../resists';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { cdReason, setSlotCd, tickSlotCds } from './cooldowns';
import { availableSummonRows, createSummon } from './summon';
import { alliesOf, enemiesInColumn, enemiesOf, meleeOrAll } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

/** Трупы союзников (герои и саммоны) для Тауматургии. */
export function allyCorpseCount(state: BattleState, actor: BattleUnit): number {
  return state.units.filter((unit) => !unit.alive && unit.team === actor.team).length;
}

/**
 * Банк Тауматургии: D × (0.75 + 0.15×трупы + 0.04×lvl). Без предела по трупам (Р-2).
 */
export function thamaturgyBank(dealtSum: number, corpses: number, lvl: number): number {
  return Math.round(dealtSum * (0.75 + 0.15 * corpses + 0.04 * lvl));
}

/** База vamp_cf Чёрной жатвы; +0.15 за труп (саммоны в счёт, без капа). */
export const THAMATURGY_VAMP_BASE = 0;

/**
 * Коэффициент вампиризма Тауматургии: база + 0.15 × трупы.
 */
export function thamaturgyVampCf(corpses: number, base = THAMATURGY_VAMP_BASE): number {
  return base + 0.15 * corpses;
}

/**
 * Распределение банка пропорционально недостающему ОЗ;
 * остаток от округления — самому раненому.
 */
export function distributeHealBank(
  allies: BattleUnit[],
  bank: number
): Array<{ unitId: string; healed: number }> {
  if (bank <= 0 || allies.length === 0) {
    return [];
  }
  const rows = allies.map((unit) => ({
    unit,
    miss: Math.max(0, unit.maxHp - unit.health),
  }));
  const totalMiss = rows.reduce((sum, row) => sum + row.miss, 0);
  if (totalMiss <= 0) {
    return [];
  }
  let spent = 0;
  const parts = rows.map((row) => {
    const share = Math.floor((bank * row.miss) / totalMiss);
    spent += share;
    return { unit: row.unit, miss: row.miss, share };
  });
  let rem = bank - spent;
  parts.sort((a, b) => b.miss - a.miss || a.unit.id.localeCompare(b.unit.id));
  for (const part of parts) {
    if (rem <= 0) {
      break;
    }
    part.share += 1;
    rem -= 1;
  }
  const result: Array<{ unitId: string; healed: number }> = [];
  for (const part of parts) {
    if (part.share <= 0) {
      continue;
    }
    const healed = healUnit(part.unit, part.share);
    if (healed > 0) {
      result.push({ unitId: part.unit.id, healed });
    }
  }
  return result;
}

function graveTargets(state: BattleState): Array<{
  entryId: string;
  label: string;
  unit: BattleUnit;
}> {
  return state.graveyard
    .map((entry) => {
      const unit = state.units.find((item) => item.id === entry.unitId);
      if (!unit || unit.alive) {
        return null;
      }
      return {
        entryId: entry.unitId,
        label: `${entry.displayName} (${entry.team === 0 ? 'свои' : 'враги'})`,
        unit,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function abilityMeta(state: BattleState, actor: BattleUnit, slot: AbilitySlot): AbilityInfo {
  switch (slot) {
    case 1: {
      const targets = meleeOrAll(state, actor, false);
      return {
        slot: 1,
        label: 'Призрачная катана',
        needsTarget: true,
        attackKind: 'melee',
        previewSource: 'WEAPON',
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const targets = enemiesOf(state, actor);
      const cd = cdReason(actor, 2);
      return {
        slot: 2,
        label: 'Чёрная жатва',
        needsTarget: true,
        attackKind: 'melee',
        previewSource: 'WEAPON',
        previewDamageMult: 0.75,
        disabledReason: cd ?? (targets.length === 0 ? 'Нет целей' : null),
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3: {
      const graves = graveTargets(state);
      const rows = availableSummonRows(state, actor);
      return {
        slot: 3,
        label: `Личный слуга (${actor.ultaCharges})`,
        needsTarget: true,
        disabledReason:
          actor.ultaCharges <= 0
            ? 'Нет зарядов'
            : graves.length === 0
              ? 'Нет трупов'
              : rows.length === 0
                ? 'Нет места / лимит саммонов'
                : null,
        legalTargetIds: graves.map((item) => item.entryId),
      };
    }
    case 4: {
      const targets = enemiesOf(state, actor);
      const cd = cdReason(actor, 4);
      return {
        slot: 4,
        label: 'Оковы взаимного терпения',
        needsTarget: true,
        disabledReason: cd ?? (targets.length === 0 ? 'Нет целей' : null),
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 5: {
      const cd = cdReason(actor, 5);
      return {
        slot: 5,
        label: 'Жизнь на нитке',
        needsTarget: false,
        disabledReason: cd,
        legalTargetIds: [],
      };
    }
  }
}

/**
 * GhostWarrior: катана, Чёрная жатва, Личный слуга, Оковы, Жизнь на нитке.
 */
export const ghostWarriorAbilities: AbilityHandler = {
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
      const target = meleeOrAll(state, actor, false).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const damage = dealDamage(
        actor,
        target,
        { kind: 'melee', damageMult: 1, armorIgnore: 0, source: 'WEAPON' },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: катана — промах.`);
        return { status: 'done' };
      }
      state.log.push(
        `${actor.displayName} рубит катаной ${target.displayName} ${formatLastLogDamage(damage)}.`
      );
      // Оглушение источником Смерть; базовый шанс = прежний (65+L) + 10.
      const stunChance = 75 + actor.lvl;
      let stunned = false;
      if (rollSrcChance(state, target, stunChance, 'DEATH')) {
        stunned = tryStun(state, target, 1);
        if (stunned) {
          state.log.push(`${target.displayName} парализован.`);
        }
      }
      if (!stunned) {
        const loss = randInt(5, 8) + actor.lvl;
        target.morale -= loss;
        state.log.push(
          `${target.displayName} теряет ${loss} боевого духа (оглушение не сработало).`
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
      let dealtSum = 0;
      for (const enemy of enemiesInColumn(state, actor, target)) {
        const damage = dealDamage(
          actor,
          enemy,
          { kind: 'melee', damageMult: 0.75, armorIgnore: 0, source: 'WEAPON' },
          state
        );
        if (damage > 0) {
          dealtSum += damage;
          state.log.push(
            `${actor.displayName}: чёрная жатва бьёт ${enemy.displayName} ${formatLastLogDamage(damage)}.`
          );
          markDeadIfNeeded(state, enemy);
        }
      }
      const corpses = allyCorpseCount(state, actor);
      const bank = thamaturgyBank(dealtSum, corpses, actor.lvl);
      const vampCf = thamaturgyVampCf(corpses);
      const selfVamp = Math.round(dealtSum * vampCf);
      if (selfVamp > 0) {
        const sucked = healUnit(actor, selfVamp);
        if (sucked > 0) {
          state.log.push(
            `${actor.displayName}: вампиризм жатвы (cf=${vampCf.toFixed(2)}) +${sucked} ОЗ.`
          );
        }
      }
      const allies = alliesOf(state, actor);
      const healed = distributeHealBank(allies, bank);
      const healLog = healed.length > 0 ? healed.map((item) => `+${item.healed}`).join('/') : '0';
      state.log.push(
        `${actor.displayName}: тауматургия (D=${dealtSum}, трупы=${corpses}) → банк ${bank} ОЗ [${healLog}].`
      );
      // Нерф владельца 2026-11-02: КД 3 (было 2).
      setSlotCd(actor, 2, 3);
      return { status: 'done' };
    }

    if (input.slot === 3) {
      if (actor.ultaCharges <= 0) {
        return { status: 'reject', message: 'Нет зарядов' };
      }
      const grave = graveTargets(state).find((item) => item.entryId === input.targetId);
      if (!grave) {
        return { status: 'reject', message: 'Труп не найден' };
      }
      const rows = availableSummonRows(state, actor);
      const row = rows[0];
      if (row === undefined) {
        return { status: 'reject', message: 'Нет места для слуги' };
      }
      actor.ultaCharges -= 1;
      const desiredLvl = grave.unit.lvl + Math.floor(actor.lvl / 3);
      const summon = createSummon(state, {
        summoner: actor,
        heroCode: 'SkeletonChampion',
        row,
        level: desiredLvl,
      });
      if (!summon) {
        actor.ultaCharges += 1;
        return { status: 'reject', message: 'Не удалось поднять слугу' };
      }
      // Труп израсходован.
      state.graveyard = state.graveyard.filter((entry) => entry.unitId !== grave.entryId);
      grave.unit.forbiddenResurrect = true;
      state.log.push(
        `${actor.displayName} поднимает личного слугу (${summon.displayName}, ур. ${summon.lvl}) из ${grave.unit.displayName} (зарядов ${actor.ultaCharges}).`
      );
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      if (!rollSrcChance(state, target, 100, 'DEATH')) {
        state.log.push(`${actor.displayName}: оковы не взяли ${target.displayName}.`);
        setSlotCd(actor, 4, 3);
        return { status: 'done' };
      }
      // Снимаем прошлую связь.
      if (actor.fettersTargetId) {
        const prev = state.units.find((unit) => unit.id === actor.fettersTargetId);
        if (prev && hasEffect(prev, 'LIFE_FETTERS')) {
          delEffect(prev, 'LIFE_FETTERS', state);
        }
      }
      actor.fettersTargetId = target.id;
      grantEffect(target, 'LIFE_FETTERS', 3);
      state.log.push(
        `${actor.displayName} сковывает ${target.displayName} оковами взаимного терпения (3 р.).`
      );
      setSlotCd(actor, 4, 3);
      return { status: 'done' };
    }

    if (input.slot === 5) {
      const rounds = 2 + Math.floor(actor.lvl / 7);
      grantEffect(actor, 'LIFE_THREAD', rounds);
      state.log.push(
        `${actor.displayName}: жизнь на нитке (${rounds} р.) — урон растёт с потерей ОЗ.`
      );
      setSlotCd(actor, 5, 2);
      return { status: 'done' };
    }

    return { status: 'reject', message: 'Используйте защиту / ожидание' };
  },
};
