import { harmWithSource, markDeadIfNeeded, randInt } from '../damage';
import { formatLogDamage } from '../damageSources';
import { delEffect, grantEffect, healUnit, trySpendMana } from '../effects';
import { levelUpUnit } from '../level';
import { rollMindChance } from '../resists';
import { applyCatalogStats } from '../transform';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { cdReason, setSlotCd, tickSlotCds } from './cooldowns';
import { alliesOf, enemiesOf } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

/** Раунд и уровень, с которых доступно «Рождение Зла». */
export const BIRTH_OF_EVIL_STAGE = 8;
export const BIRTH_OF_EVIL_LVL = 19;

function manaReason(actor: BattleUnit, cost: number): string | null {
  return actor.mana < cost ? `Нужно ${cost} МР` : null;
}

function abilityMeta(state: BattleState, actor: BattleUnit, slot: AbilitySlot): AbilityInfo {
  const allies = alliesOf(state, actor);
  switch (slot) {
    case 1: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 1,
        label: 'Психический шок (ряд)',
        needsTarget: true,
        attackKind: 'magic',
        disabledReason: manaReason(actor, 3) ?? (targets.length === 0 ? 'Нет целей' : null),
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2:
      return {
        slot: 2,
        label: 'Чудесный доктор',
        needsTarget: true,
        disabledReason: cdReason(actor, 2) ?? manaReason(actor, 3),
        legalTargetIds: allies.map((unit) => unit.id),
      };
    case 3:
      return {
        slot: 3,
        label: 'Нечистый договор',
        needsTarget: true,
        disabledReason: manaReason(actor, 3),
        legalTargetIds: allies.map((unit) => unit.id),
      };
    case 4: {
      const targets = allies.filter((unit) => unit.id !== actor.id);
      return {
        slot: 4,
        label: 'Теневой наставник',
        needsTarget: true,
        disabledReason: manaReason(actor, 4) ?? (targets.length === 0 ? 'Нет союзников' : null),
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 5: {
      const ready = state.stage >= BIRTH_OF_EVIL_STAGE || actor.lvl >= BIRTH_OF_EVIL_LVL;
      return {
        slot: 5,
        label: 'Рождение Зла',
        needsTarget: false,
        disabledReason: ready
          ? null
          : `С ${BIRTH_OF_EVIL_STAGE} раунда или ${BIRTH_OF_EVIL_LVL} уровня`,
        legalTargetIds: [],
      };
    }
  }
}

/** Превращение в Демона-принца (DemonLord) с выравниванием уровня. */
function birthOfEvil(state: BattleState, actor: BattleUnit): boolean {
  const oldName = actor.displayName;
  const oldLvl = actor.lvl;
  if (!applyCatalogStats(state, actor, 'DemonLord')) {
    return false;
  }
  actor.lvl = 1;
  actor.hiddenLvl = 1;
  levelUpUnit(actor, Math.round(oldLvl * 0.75), state);
  actor.ultaCharges = 2;
  actor.abilityCds = {};
  if (actor.row !== 0) {
    const front = state.units.filter(
      (unit) => unit.alive && unit.team === actor.team && unit.row === 0
    ).length;
    if (front < state.rules.maxRowSize) {
      actor.row = 0;
      actor.column = front;
    }
  }
  const healed = healUnit(actor, actor.lvl * 5);
  state.log.push(
    `${oldName}, который был всего лишь оболочкой для нечто более страшного, разрывается на части, высвобождая из себя гигантского Демона-принца (+${healed} ОЗ).`
  );
  return true;
}

/**
 * Incub: удар Разумом по ряду, мнимое здоровье, договор, наставник, перерождение в Демона-принца.
 */
export const incubAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  preChoice(state, actor) {
    tickSlotCds(actor);
    const enemies = state.units.filter((unit) => unit.alive && unit.team !== actor.team);
    if (enemies.length === 0) {
      return;
    }
    const lowest = Math.min(...enemies.map((unit) => unit.morale));
    const candidates = enemies.filter((unit) => unit.morale === lowest);
    const victim = candidates[randInt(0, candidates.length - 1)];
    if (!victim || !rollMindChance(state, victim, 60 + actor.lvl)) {
      return;
    }
    const loss = 5 + Math.floor(actor.lvl / 2);
    victim.morale -= loss;
    state.log.push(
      `Прекрасное и ужасающее присутствие ${actor.displayName}: ${victim.displayName} теряет ${loss} боевого духа.`
    );
  },

  apply(state, actor, input): AbilityOutcome {
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 5) {
      if (!birthOfEvil(state, actor)) {
        return { status: 'reject', message: 'Нет статов Демона-принца в каталоге' };
      }
      return { status: 'done' };
    }

    const target = state.units.find(
      (unit) => unit.id === input.targetId && meta.legalTargetIds.includes(unit.id)
    );
    if (!target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }
    const cost = input.slot === 4 ? 4 : 3;

    if (input.slot === 4 && target.isSummon) {
      const difference = actor.lvl - target.lvl;
      if (difference <= 0 && !state.doneIds.includes(target.id)) {
        return { status: 'reject', message: 'Дождитесь хода саммона' };
      }
      const err = trySpendMana(actor, cost);
      if (err) {
        return { status: 'reject', message: err };
      }
      if (difference <= 0) {
        state.log.push(`${actor.displayName} придаёт дополнительные силы ${target.displayName}.`);
        return { status: 'done', extraTurnForUnitId: target.id };
      }
      levelUpUnit(target, Math.floor(difference / 2) + 1, state);
      state.log.push(`${target.displayName} впитывает знания своего наставника.`);
      return { status: 'done' };
    }

    const err = trySpendMana(actor, cost);
    if (err) {
      return { status: 'reject', message: err };
    }

    if (input.slot === 1) {
      const row = state.units.filter(
        (unit) => unit.alive && unit.team === target.team && unit.row === target.row
      );
      const share = Math.floor(actor.power / Math.max(1, row.length));
      for (const enemy of row) {
        const moraleFactor = Math.max(0.1, 1 - enemy.morale / 100);
        const dealt = harmWithSource(state, enemy, Math.max(1, Math.round(share * moraleFactor)), 'MIND');
        if (dealt > 0) {
          state.log.push(
            `Истошный крик выворачивает разум ${enemy.displayName} ${formatLogDamage(dealt, 'MIND')}.`
          );
        }
        markDeadIfNeeded(state, enemy);
        if (enemy.alive && rollMindChance(state, enemy, 70 + actor.lvl)) {
          grantEffect(enemy, 'FATMAN', 1 + Math.floor(actor.lvl / 10), 10 + Math.floor(actor.lvl / 2));
          state.log.push(`У ${enemy.displayName} кружится голова.`);
        }
      }
      return { status: 'done' };
    }

    if (input.slot === 2) {
      setSlotCd(actor, 2, 2);
      const bonus = 50 + actor.lvl * 5;
      grantEffect(target, 'IMAGINARY_HEALTH', 2, bonus);
      state.log.push(
        `${actor.displayName}, чудесный доктор, дарует ${target.displayName} ${bonus} мнимого здоровья.`
      );
      return { status: 'done' };
    }

    if (input.slot === 3) {
      delEffect(target, 'WEAKNESS', state);
      delEffect(target, 'INTERFERENCE', state);
      const bonus = 20 + actor.lvl * 2;
      grantEffect(target, 'STRENGTH', 2, bonus);
      grantEffect(target, 'ABSOLUTEPOWER', 2, bonus);
      grantEffect(target, 'IMMOLATION', 2, 0.75);
      state.log.push(
        `${target.displayName} заключает нечистый договор: +${bonus} атаки и силы магии, но расплата близка.`
      );
      return { status: 'done' };
    }

    const luck = 15 + actor.lvl;
    grantEffect(target, 'LUCKY', 2, luck);
    state.log.push(`${actor.displayName} наставляет ${target.displayName}: +${luck} удачи.`);
    return { status: 'done' };
  },
};
