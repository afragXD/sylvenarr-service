import { addTeamGold } from '../../economy';
import { dealDamage, formatLastLogDamage, markDeadIfNeeded, randInt } from '../damage';
import { grantEffect } from '../effects';
import { genderForClass } from '../gender';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { alliesOf, enemiesOf } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

/** Штраф морали за каждую женщину в отряде (если F ≥ 1). */
export const BEER_COMPANY_FEMALE_LOSS = 5;
/** Бонус морали за каждого мужчину (только если F = 0). */
export const BEER_COMPANY_MALE_GAIN = 4;

function unitGender(unit: BattleUnit) {
  return unit.gender ?? genderForClass(unit.heroClassCode);
}

/**
 * Пассивка «Компания за кружкой»: в начале раунда.
 * F ≥ 1 → −5·F; F = 0 и M ≥ 1 → +4·M. Себя не считаем.
 */
export function applyBeerCompanyMoraleRoundStart(state: BattleState): void {
  for (const actor of state.units) {
    if (!actor.alive || actor.heroClassCode !== 'BeerElemental') {
      continue;
    }
    let females = 0;
    let males = 0;
    for (const ally of alliesOf(state, actor)) {
      if (ally.id === actor.id) {
        continue;
      }
      const g = unitGender(ally);
      if (g === 'female') {
        females += 1;
      } else if (g === 'male') {
        males += 1;
      }
    }
    if (females >= 1) {
      const loss = BEER_COMPANY_FEMALE_LOSS * females;
      actor.morale -= loss;
      state.log.push(
        `${actor.displayName}: компания давит на дух (−${loss} боевого духа; дам в отряде: ${females}).`
      );
      continue;
    }
    if (males >= 1) {
      const gain = BEER_COMPANY_MALE_GAIN * males;
      actor.morale += gain;
      state.log.push(
        `${actor.displayName}: своя компания бодрит (+${gain} боевого духа; товарищей: ${males}).`
      );
    }
  }
}

function abilityMeta(state: BattleState, actor: BattleUnit, slot: AbilitySlot): AbilityInfo {
  switch (slot) {
    case 1: {
      const allies = alliesOf(state, actor);
      return {
        slot: 1,
        label: 'Homie De Flanders',
        needsTarget: true,
        disabledReason: allies.length === 0 ? 'Нет союзников' : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 2: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 2,
        label: 'МЧС, Классическое',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3: {
      const allies = alliesOf(state, actor).filter((unit) => (unit.critBank ?? 0) < 2);
      return {
        slot: 3,
        label: 'Огуречное',
        needsTarget: true,
        disabledReason: allies.length === 0 ? 'Уже 2 крит-банка' : null,
        legalTargetIds: allies.map((unit) => unit.id),
      };
    }
    case 4: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 4,
        label: `Торпеда (${actor.ultaCharges})`,
        needsTarget: true,
        disabledReason:
          actor.ultaCharges <= 0 ? 'Нет снарядов' : targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 5: {
      // Порт: слот не через Pattern; охрана не блокирует.
      const targets = enemiesOf(state, actor, { ignoreGuard: true });
      return {
        slot: 5,
        label: 'Сливняк',
        needsTarget: true,
        attackKind: 'magic',
        previewSource: 'WATER',
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
  }
}

/**
 * BeerElemental: morale toast, drunk, critBank, poison ulta, water dump; preChoice gold loss.
 */
export const beerElementalAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  preChoice(state, actor) {
    const loss = randInt(10, 80);
    addTeamGold(state, actor.team, -loss);
    state.log.push(`${actor.displayName} просадил ${loss} золота в азартные игры!`);
  },

  apply(state, actor, input): AbilityOutcome {
    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const gain = 7 + actor.lvl * 2;
      target.morale += gain;
      state.log.push('Пиво течёт во мне, я един с пивом');
      state.log.push(`${actor.displayName}: ${target.displayName} получает +${gain} боевого духа.`);
      return { status: 'done' };
    }

    if (input.slot === 2) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      if (randInt(1, 100) <= 70 + actor.lvl * 2) {
        grantEffect(target, 'FATMAN', 2, 20 + actor.lvl);
        state.log.push(`${actor.displayName}: ${target.displayName} пьян и шатается.`);
      } else {
        state.log.push(`${actor.displayName}: опьянение провалилось.`);
      }
      return { status: 'done' };
    }

    if (input.slot === 3) {
      const target = alliesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      if ((target.critBank ?? 0) >= 2) {
        return { status: 'reject', message: 'Уже 2 крит-банка' };
      }
      const bank = 1 + Math.floor(actor.lvl / 6);
      target.critBank = Math.min(2, (target.critBank ?? 0) + bank);
      state.log.push(
        `${actor.displayName}: ${target.displayName} получает ${bank} гарант-крит(а).`
      );
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      actor.ultaCharges -= 1;
      grantEffect(target, 'POISON', 2, 1.5);
      state.log.push(
        `${actor.displayName}: торпеда — ${target.displayName} отравлен (осталось ${actor.ultaCharges}).`
      );
      return { status: 'done' };
    }

    // slot 5 — Сливняк (бывший Homie De Flanders)
    const target = enemiesOf(state, actor, { ignoreGuard: true }).find(
      (unit) => unit.id === input.targetId
    );
    if (!target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }
    const damage = dealDamage(
      actor,
      target,
      { kind: 'magic', damageMult: 1, armorIgnore: 0, source: 'WATER' },
      state
    );
    if (damage === 0) {
      state.log.push(`${actor.displayName}: сливняк — промах.`);
      return { status: 'done' };
    }
    state.log.push(
      `${actor.displayName} обливает ${target.displayName} некачественным пивом ${formatLastLogDamage(damage)}.`
    );
    markDeadIfNeeded(state, target);
    return { status: 'done' };
  },
};
