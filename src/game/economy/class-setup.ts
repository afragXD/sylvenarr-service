import { randInt } from '../combat/damage';
import type { BattleState } from '../combat/types';
import {
  addItem,
  randomItemCodesByCategoryAndTier,
  randomItemCodesByTier,
} from '../items/inventory';
import { economyOn } from './on';

type ClassSetup = {
  readonly perks: readonly string[];
  readonly merchant?: number;
  readonly develop?: number;
};

const BASE_PERKS = ['MISC'] as const;

const CLASS_SETUP: Record<string, ClassSetup> = {
  Pyro: { perks: [...BASE_PERKS, 'TECHNO'] },
  Specter: { perks: [...BASE_PERKS, 'BONUS_MOVEMENT'] },
  Witch: { perks: ['TECHNO', 'TALISMANS'] },
  Oracle: { perks: [...BASE_PERKS, 'SCROLLS'] },
  OrcKing: { perks: [...BASE_PERKS, 'MILITARY'] },
  Knight: { perks: [...BASE_PERKS, 'LOWHP_EXTRATURN'] },
  Archlich: { perks: [...BASE_PERKS, 'ORBS'] },
  Marauder: { perks: [...BASE_PERKS, 'DOUBLE_USING_INVENTORY'] },
  DemonLord: { perks: [...BASE_PERKS, 'TALISMANS'] },
  Abbess: { perks: [...BASE_PERKS, 'GRAND_MERCHANT', 'RELICS'], merchant: 0.2 },
  Detective: { perks: [...BASE_PERKS], develop: 5 },
};

const STARTING_ITEMS: Record<string, () => number[]> = {
  Assassin: () => randomItemCodesByTier(1, 4, 1),
  Abbess: () => randomItemCodesByTier(1, 3, 1),
  DemonLord: () => randomItemCodesByTier(2, 4, 2),
  Detective: () => randomItemCodesByTier(1, 2, 2),
  EvilTree: () => [347],
  Herbalist: () => randomItemCodesByTier(1, 1, 1),
  Inquisitor: () => randomItemCodesByTier(1, 2, 1),
  Archlich: () => randomItemCodesByTier(1, 4, 1),
  Marauder: () => randomItemCodesByTier(1, 2, 1),
  Oracle: () => randomItemCodesByTier(1, 2, 1),
  OrcKing: () => [619, ...randomItemCodesByTier(1, 1, 1)],
  Paladin: () => randomItemCodesByCategoryAndTier(5, 1, 3, 1),
  Witch: () => randomItemCodesByTier(1, 3, randInt(1, 2)),
};

function setupForClass(code: string): ClassSetup {
  return CLASS_SETUP[code] ?? { perks: [...BASE_PERKS] };
}

/** Классовые перки, merchant, develop и стартовый инвентарь (только при fairEnabled). */
export function applyClassEconomySetup(state: BattleState): void {
  if (!economyOn(state)) {
    return;
  }
  for (const unit of state.units) {
    if (!unit.alive || unit.isSummon) {
      continue;
    }
    const setup = setupForClass(unit.heroClassCode);
    unit.perks = [...setup.perks];
    unit.merchant = setup.merchant ?? 0;
    unit.develop = setup.develop ?? 6;

    const itemFn = STARTING_ITEMS[unit.heroClassCode];
    if (itemFn) {
      for (const code of itemFn()) {
        addItem(state, unit.team, code, 1);
      }
    }
  }
}

/** Ожидаемые стартовые перки класса (для тестов). */
export function expectedClassPerks(heroClassCode: string): readonly string[] {
  return setupForClass(heroClassCode).perks;
}
