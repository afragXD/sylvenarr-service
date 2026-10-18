import { randInt } from '../damage';
import { healUnit } from '../effects';
import { changeResist, setWard } from '../resists';
import type { BattleUnit } from '../types';
import { bumpLevel } from './bump';
import type { ClassLevelUpFn } from './types';

function werewolfRage(unit: BattleUnit): number {
  return Math.round((2 - unit.health / unit.maxHp) * 100) / 100;
}

export const pilotLevelUps: Record<string, ClassLevelUpFn> = {
  Assassin(unit, ind, state) {
    if (state.stage % 4 === 0 && ind > 0) {
      unit.darts += randInt(1, 2);
      // Item(107) — вне скоупа до ярмарки 4.1
    }
    unit.deathNote += 3 * ind;
    unit.luck += randInt(1, 3) * ind;
    unit.damage += unit.lvl * ind;
    bumpLevel(unit, ind);
    // kira cooldown — вне скоупа (поле не портировано)
  },

  Paladin(unit, ind, _state) {
    if (unit.hiddenLvl % 7 === 0) {
      unit.ultaCharges += 1;
      unit.mana += 5;
      // Item(475) — вне скоупа
    }
    unit.armor += randInt(1, 2) * Math.floor(unit.lvl / 2) * ind;
    unit.damage += (2 + Math.floor(unit.lvl / 4)) * ind;
    bumpLevel(unit, ind);
  },

  Inquisitor(unit, ind, state) {
    if (state.stage % 5 === 0) {
      unit.armor += 20;
      unit.power += 10;
    }
    if (unit.health > 0) {
      healUnit(unit, randInt(10, 15 + unit.lvl) * ind);
    }
    unit.mana += randInt(1, 2) * ind;
    unit.damage += (randInt(1, 3) + Math.floor(unit.lvl / 3)) * ind;
    bumpLevel(unit, ind);
  },

  Detective(unit, ind, state) {
    if (state.stage % 5 === 0 && ind > 0) {
      unit.luck += 5;
      // steals += 1 — вне скоупа (инвентарь)
    }
    unit.dodge += randInt(1, 2) * ind;
    unit.damage += (Math.floor(unit.lvl / 2) + randInt(1, 3)) * ind;
    bumpLevel(unit, ind);
  },

  DemonLord(unit, ind, _state) {
    if (unit.hiddenLvl % 5 === 0) {
      unit.ultaCharges += 1;
    }
    unit.power += randInt(2, 4) * ind;
    unit.luck += 2 * ind;
    unit.mana += ind;
    unit.armorPenetration += 0.04 * ind;
    unit.damage += (Math.floor(unit.lvl / 2) + randInt(1, 2)) * ind;
    unit.initiative += randInt(-2, 3) * ind;
    bumpLevel(unit, ind);
  },

  Abbess(unit, ind, state) {
    if (state.stage % 6 === 0 && ind > 0) {
      unit.dodgeBank += 1;
    }
    unit.power += (randInt(0, 2) + Math.floor(unit.lvl / 2)) * ind;
    unit.mana += ind;
    unit.maxHp += 5 * ind;
    bumpLevel(unit, ind);
  },

  OrcKing(unit, ind, _state) {
    const luckGain =
      unit.luck <= 0 ? (Math.floor(unit.lvl / 2) + 3) * ind : 2 * ind;
    unit.luck += luckGain;
    unit.damage += (Math.floor(unit.lvl / 2) + 1) * ind;
    unit.accuracy += 2 * ind;
    if (unit.hiddenLvl % 6 === 0) {
      unit.authority += 1;
    }
    if (unit.hiddenLvl % 10 === 0) {
      unit.maxSummons += 1;
    }
    bumpLevel(unit, ind);
  },

  Marauder(unit, ind, state) {
    if (state.stage % 5 === 0) {
      unit.ultaCharges += 1;
    }
    unit.damage += (randInt(2, 5) + Math.floor(unit.lvl / 2)) * ind;
    unit.gold += randInt(30, 50) * ind;
    unit.mana += ind;
    unit.power += (Math.floor(unit.lvl / 2) + 1) * ind;
    bumpLevel(unit, ind);
  },

  Werewolf(unit, ind, state) {
    if (state.stage % 5 === 0 && ind > 0) {
      unit.ultaCharges += 1;
    }
    unit.damage += (randInt(1, 3) + Math.floor(unit.lvl / 2)) * ind;
    unit.luck += (Math.floor(unit.lvl / 2) + 1) * ind;
    unit.initiative = Math.round(28 * werewolfRage(unit));
    unit.maxHp += (unit.lvl * 2 + randInt(1, 5)) * ind;
    // morale -= randint(4,6) — поле morale не на BattleUnit
    bumpLevel(unit, ind);
  },

  Archlich(unit, ind, state) {
    if (unit.hiddenLvl % 5 === 0 && ind > 0) {
      // radius += 1 — вне скоупа до использования в ability
      setWard(unit, 'FIRE', 1);
    }
    if (state.stage === 10 && ind > 0) {
      unit.maxSummons += 1;
    }
    // Python: randint(0,2) * lvl // 2 * ind
    unit.power += Math.floor((randInt(0, 2) * unit.lvl) / 2) * ind;
    unit.mana += randInt(1, 2) * ind;
    bumpLevel(unit, ind);
  },

  Witch(unit, ind, _state) {
    if (unit.hiddenLvl % 5 === 0 && ind > 0) {
      unit.gun += 3;
      unit.damage += randInt(10, 15);
    }
    unit.mana += ind * randInt(1, 2);
    unit.power += (Math.floor(unit.lvl / 2) + 3) * ind;
    changeResist(unit, 'EARTH', 3 * ind);
    changeResist(unit, 'MIND', 2 * ind);
    bumpLevel(unit, ind);
  },

  GhostWarrior(unit, ind, _state) {
    if (unit.hiddenLvl % 5 === 0) {
      unit.ultaCharges += 1;
    }
    healUnit(unit, 5 * ind);
    unit.damage += 3 * ind;
    unit.initiative += 2 * ind;
    bumpLevel(unit, ind);
  },

  Oracle(unit, ind, _state) {
    if (unit.hiddenLvl % 6 === 0) {
      unit.ultaCharges += 1;
    }
    unit.mana += 2 * ind;
    bumpLevel(unit, ind);
  },

  Herbalist(unit, ind, _state) {
    unit.armor += 2 * ind;
    bumpLevel(unit, ind);
  },

  /** Исключение: сначала bump, потом статы. */
  Demiurge(unit, ind, _state) {
    bumpLevel(unit, ind);
    unit.power += 2 * ind;
    unit.mana += randInt(0, 3) * Math.max(ind, 0);
    unit.armor += 2 * ind;
  },

  GoldGolem(unit, ind, _state) {
    unit.damage += 2 * ind;
    bumpLevel(unit, ind);
  },

  BeerElemental(unit, ind, _state) {
    if (unit.hiddenLvl % 6 === 0) {
      unit.ultaCharges += 1;
    }
    bumpLevel(unit, ind);
  },

  Knight(unit, ind, _state) {
    if (ind > 0 && !unit.horseIsDead && unit.health <= unit.maxHp * 0.5) {
      unit.initiative = Math.floor(unit.initiative / 2);
      unit.horseIsDead = true;
    }
    unit.armor += 2 * ind;
    unit.accuracy += 3 * ind;
    unit.damage += (randInt(1, 2) + Math.floor(unit.lvl / 3)) * ind;
    bumpLevel(unit, ind);
  },

  Mermaid(unit, ind, _state) {
    if (unit.hiddenLvl % 4 === 0) {
      unit.ultaCharges += 1;
    }
    unit.mana += ind;
    bumpLevel(unit, ind);
  },

  Patriarch(unit, ind, _state) {
    if (unit.hiddenLvl % 7 === 0) {
      unit.ultaCharges += 1;
    }
    unit.armor += 3 * ind;
    unit.power += 4 * ind;
    unit.mana += 1 * ind;
    bumpLevel(unit, ind);
  },

  /** Quirk: damage += 2 без * ind. */
  Pyro(unit, ind, _state) {
    unit.damage += 2;
    unit.power += (2 + Math.floor(unit.lvl / 3)) * ind;
    bumpLevel(unit, ind);
  },

  EvilTree(unit, ind, _state) {
    unit.damage += randInt(1, 3) * ind;
    unit.power += randInt(2, 3) * ind;
    unit.mana += randInt(0, 1) * ind;
    bumpLevel(unit, ind);
  },

  Dracolich(unit, ind, _state) {
    unit.damage += 2 * ind;
    unit.power += 2 * ind;
    bumpLevel(unit, ind);
  },
};
