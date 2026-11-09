import type { AbilitySlot, BattleState, BattleUnit } from '../types';

/** Сколько повышений уровня до ближайшего срабатывания hidden%mod (проверка до bump). */
export function bumpsUntilHiddenMod(hiddenLvl: number, mod: number): number {
  const rem = ((hiddenLvl % mod) + mod) % mod;
  if (rem === 0) {
    return 1;
  }
  return mod - rem + 1;
}

/** Раундов до ближайшего stage%mod === 0. На самом кратном раунде — полный цикл. */
export function roundsUntilStageMod(stage: number, mod: number): number {
  const rem = ((stage % mod) + mod) % mod;
  return rem === 0 ? mod : mod - rem;
}

const CHARGE_SLOT: Record<string, AbilitySlot> = {
  Paladin: 2,
  DemonLord: 5,
  Marauder: 4,
  Werewolf: 4,
  GhostWarrior: 3,
  Oracle: 4,
  BeerElemental: 4,
  Mermaid: 3,
  Patriarch: 4,
  Pyro: 3,
  Zombie: 2,
  Titan: 5,
  Detective: 3,
  Assassin: 4,
  Witch: 1,
};

/** Подсказка зарядов или патронов для слота, который их тратит. */
export function chargeHintFor(
  unit: BattleUnit,
  state: BattleState,
  slot: AbilitySlot,
): string | null {
  if (CHARGE_SLOT[unit.heroClassCode] !== slot) {
    return null;
  }
  const stage = state.stage;
  switch (unit.heroClassCode) {
    case 'Paladin':
      return `Старт 2. +1 заряд и +5 МР, когда скрытый уровень кратен 7, следующий через ${bumpsUntilHiddenMod(unit.hiddenLvl, 7)}.`;
    case 'DemonLord':
      return `Старт 2. +1 заряд, когда скрытый уровень кратен 5, следующий через ${bumpsUntilHiddenMod(unit.hiddenLvl, 5)}.`;
    case 'Marauder':
    case 'Werewolf':
      return `Старт 1. +1 заряд каждый 5-й раунд, следующий через ${roundsUntilStageMod(stage, 5)}.`;
    case 'GhostWarrior':
      return `Старт 1. +1 заряд каждый 5-й раунд, следующий через ${roundsUntilStageMod(stage, 5)}.`;
    case 'Oracle':
      return `Старт 1. +1 заряд, когда скрытый уровень кратен 6, следующий через ${bumpsUntilHiddenMod(unit.hiddenLvl, 6)}.`;
    case 'BeerElemental':
      return `Старт 3. +1 заряд, когда скрытый уровень кратен 6, следующий через ${bumpsUntilHiddenMod(unit.hiddenLvl, 6)}.`;
    case 'Mermaid':
      return `Старт 1. +1 заряд, когда скрытый уровень после повышения кратен 5, следующий через ${bumpsUntilHiddenMod(unit.hiddenLvl, 5)}.`;
    case 'Patriarch':
      return `Старт 1. +1 заряд каждые 7 уровней, следующий через ${bumpsUntilHiddenMod(unit.hiddenLvl, 7)}.`;
    case 'Pyro':
      return `Старт 1. +1 заряд каждый 5-й раунд, следующий через ${roundsUntilStageMod(stage, 5)}.`;
    case 'Zombie':
      return `Старт 1. +1 заряд каждый 4-й раунд, следующий через ${roundsUntilStageMod(stage, 4)}.`;
    case 'Titan':
      return `Старт 1. +1 заряд Дрожи земли за убийство. Сейчас ${unit.ultaCharges}.`;
    case 'Detective':
      return `Старт 2. Заряды не пополняются. Сейчас ${unit.ultaCharges}.`;
    case 'Assassin':
      return `Старт 2. +1…2 дротика каждый 4-й раунд, следующий через ${roundsUntilStageMod(stage, 4)}. Сейчас ${unit.darts}.`;
    case 'Witch':
      return `Патроны: ${unit.gun}. +4 каждые 5 раундов, следующее через ${roundsUntilStageMod(stage, 5)}.`;
    default:
      return null;
  }
}
