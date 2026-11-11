import { claimChargeIfDue } from '../abilities/charge-hints';
import { randInt } from '../damage';
import { addMana, healUnit } from '../effects';
import { bumpLevel } from './bump';
import type { ClassLevelUpFn } from './types';

export const summonLevelUps: Record<string, ClassLevelUpFn> = {
  GoblinShaman(unit, ind, _state) {
    addMana(unit, ind);
    unit.power += 4 * ind;
    unit.maxHp += 4 * ind;
    healUnit(unit, 4 * ind);
    bumpLevel(unit, ind);
  },

  /**
   * Quirk: не вызывает super — lvl += ind, hiddenLvl не растёт.
   */
  GoblinTrapper(unit, ind, _state) {
    unit.lvl = Math.max(1, unit.lvl + ind);
    unit.accuracy += ind * 2;
    unit.damage += 3 * ind;
    unit.luck += 2 * ind;
    unit.maxHp += ind;
    healUnit(unit, ind);
  },

  Ectoplasm(unit, ind, _state) {
    unit.power += 2 * ind;
    bumpLevel(unit, ind);
  },

  Zombie(unit, ind, state) {
    unit.maxHp += 5 * ind;
    healUnit(unit, 3 * ind);
    unit.damage += 4 * ind;
    if (claimChargeIfDue('Zombie', unit, state.stage, ind)) {
      unit.ultaCharges += 1;
    }
    bumpLevel(unit, ind);
  },

  SkeletonChampion(unit, ind, _state) {
    healUnit(unit, 7 * ind);
    unit.damage += randInt(2, 5) * ind;
    unit.luck += 2 * ind;
    // Бот (undeads.py): проверка до super().levelup. Скрытый уровень > 8 —
    // чемпион становится наёмником и не гибнет вместе с хозяином. Во всех матчах.
    if (unit.hiddenLvl > 8 && !unit.isMercenary) {
      unit.isMercenary = true;
    }
    bumpLevel(unit, ind);
  },
};
