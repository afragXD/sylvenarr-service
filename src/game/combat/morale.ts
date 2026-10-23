import { markDeadIfNeeded, randInt } from './damage';
import { grantEffect } from './effects';
import { levelUpUnit } from './level';
import { isArtificialClass, isUndeadClass } from './races';
import type { BattleState, BattleUnit } from './types';

/** Верхняя граница морали (порт normalize). */
export const MORALE_CAP = 65;

/**
 * Cap морали и прочих боевых статов (фрагмент Hero.normalize).
 */
export function normalizeUnit(unit: BattleUnit): void {
  unit.morale = Math.min(MORALE_CAP, unit.morale);
  unit.luck = Math.min(60, unit.luck);
}

/**
 * Шанс % (1..100) — порт Chance(value).__bool__.
 */
export function chancePercent(value: number): boolean {
  return randInt(1, 100) <= value;
}

/**
 * Mental illness при низкой морали (−70…−100). Порт addMentalIllness.
 * Без инвентаря/skills: исход 4 только золото+точность, исход 5 — levelUp −4.
 */
export function addMentalIllness(state: BattleState, unit: BattleUnit, fate: number): void {
  switch (fate) {
    case 1: {
      const summon = state.units.find(
        (other) => other.alive && other.isSummon && other.summonerId === unit.id
      );
      if (summon) {
        state.log.push(
          `${unit.displayName}: паранойя — убивает своего саммона ${summon.displayName}.`
        );
        summon.health = 0;
        markDeadIfNeeded(state, summon);
      } else {
        const loss = Math.floor(unit.maxHp / 4);
        unit.health -= loss;
        state.log.push(
          `${unit.displayName}: паранойя, но саммона нет — теряет ${loss} ОЗ от одиночества.`
        );
        markDeadIfNeeded(state, unit);
      }
      break;
    }
    case 2: {
      const armorHalf = Math.floor(unit.armor / 2);
      unit.damage += armorHalf;
      unit.armor = 0;
      unit.mana = 0;
      unit.accuracy = Math.max(0, unit.accuracy - 20);
      state.log.push(
        `${unit.displayName}: берсерк — броня и мана обнулены, урон +${armorHalf}, точность −20.`
      );
      break;
    }
    case 3: {
      unit.dodge = 0;
      if (unit.luck > 0) {
        unit.luck = 0;
      }
      state.log.push(
        `${unit.displayName}: апатия — уклонение и положительная удача обнулены.`
      );
      break;
    }
    case 4: {
      unit.gold = 0;
      unit.accuracy = Math.max(0, unit.accuracy - 15);
      state.log.push(
        `${unit.displayName}: шизофрения — золото потеряно, точность −15.`
      );
      break;
    }
    case 5: {
      levelUpUnit(unit, -4, state);
      state.log.push(
        `${unit.displayName}: деградация — потеря 4 уровней.`
      );
      break;
    }
    case 6: {
      unit.morale = 0;
      unit.damage += 15;
      unit.power += 15;
      state.log.push(
        `${unit.displayName}: душевный подъём! Мораль обнулена, урон и сила магии +15.`
      );
      break;
    }
    default:
      state.log.push(`${unit.displayName}: неизвестная болезнь разума.`);
      break;
  }
}

/**
 * Психоз в начале хода (порт Hero.psycho).
 * Undead/artificial иммунны. < −100 — смерть; (−100…−70] — illness один раз.
 */
export function applyPsycho(state: BattleState, unit: BattleUnit): void {
  if (isUndeadClass(unit.heroClassCode) || isArtificialClass(unit.heroClassCode)) {
    return;
  }
  if (unit.morale > -70) {
    return;
  }
  if (unit.morale < -100) {
    state.log.push(
      `${unit.displayName} не выдерживает психологической атаки — сердечный приступ.`
    );
    unit.health = 0;
    markDeadIfNeeded(state, unit);
    return;
  }
  if (unit.illness) {
    return;
  }
  const fate = randInt(1, 6);
  addMentalIllness(state, unit, fate);
  unit.illness = true;
}

/**
 * Бонус за высокую мораль после хода (порт rewardForHighMorale).
 * Chance(morale) → STRENGTH 2 раунда на +25% урона.
 */
export function maybeRewardHighMorale(state: BattleState, unit: BattleUnit): void {
  if (!unit.alive || unit.morale <= 0) {
    return;
  }
  if (!chancePercent(unit.morale)) {
    return;
  }
  const bonus = Math.max(1, Math.round(unit.damage * 0.25));
  grantEffect(unit, 'STRENGTH', 2, bonus);
  state.log.push(
    `${unit.displayName}: высокий боевой дух даёт силу (+${bonus} урона на 2 р.).`
  );
}
