import type { AbilitySlot, BattleState, BattleUnit } from '../types';

/** Заряд, если скрытый уровень кратен mod ещё до повышения. */
export function grantsHiddenBefore(hiddenLvl: number, mod: number): boolean {
  return hiddenLvl % mod === 0;
}

/** Сколько новых скрытых уровней (после bump) попали на кратное mod. */
export function gainedHiddenAfter(before: number, after: number, mod: number, ind: number): number {
  if (ind <= 0) {
    return 0;
  }
  let gained = 0;
  for (let level = before + 1; level <= after; level += 1) {
    if (level % mod === 0) {
      gained += 1;
    }
  }
  return gained;
}

/** Заряд на стыке раунда, когда stage уже увеличен. requireInd — как у Ведьмочки, не у Мародёра. */
export function grantsOnStage(stage: number, mod: number, ind: number, requireInd: boolean): boolean {
  if (requireInd && ind <= 0) {
    return false;
  }
  return stage % mod === 0;
}

/** Сколько повышений до заряда, который смотрит скрытый уровень до bump. */
export function bumpsUntilHiddenMod(hiddenLvl: number, mod: number): number {
  const rem = ((hiddenLvl % mod) + mod) % mod;
  if (rem === 0) {
    return 1;
  }
  return mod - rem + 1;
}

/** Повышений до заряда, который смотрит скрытый уровень уже после bump (Русалка). */
export function stepsUntilHiddenAfter(hiddenLvl: number, mod: number): number {
  const rem = ((hiddenLvl % mod) + mod) % mod;
  return rem === 0 ? mod : mod - rem;
}

/** Раундов до ближайшего stage%mod === 0. На самом кратном раунде — полный цикл. */
export function roundsUntilStageMod(stage: number, mod: number): number {
  const rem = ((stage % mod) + mod) % mod;
  return rem === 0 ? mod : mod - rem;
}

type ChargeClock =
  | { readonly kind: 'hidden-before'; readonly mod: number }
  | { readonly kind: 'hidden-after'; readonly mod: number }
  | { readonly kind: 'stage'; readonly mod: number; readonly requireInd: boolean };

/** Единственная таблица часов заряда: и начисление, и «через K» читают её. */
const CHARGE_CLOCK: Record<string, ChargeClock> = {
  Paladin: { kind: 'hidden-before', mod: 7 },
  DemonLord: { kind: 'hidden-before', mod: 5 },
  Oracle: { kind: 'hidden-before', mod: 6 },
  BeerElemental: { kind: 'hidden-before', mod: 6 },
  Patriarch: { kind: 'hidden-before', mod: 7 },
  Mermaid: { kind: 'hidden-after', mod: 5 },
  Marauder: { kind: 'stage', mod: 5, requireInd: false },
  Werewolf: { kind: 'stage', mod: 5, requireInd: true },
  GhostWarrior: { kind: 'stage', mod: 5, requireInd: true },
  Pyro: { kind: 'stage', mod: 5, requireInd: true },
  Witch: { kind: 'stage', mod: 5, requireInd: true },
  Assassin: { kind: 'stage', mod: 4, requireInd: true },
  Zombie: { kind: 'stage', mod: 4, requireInd: true },
};

export function chargeClock(code: string): ChargeClock | null {
  return CHARGE_CLOCK[code] ?? null;
}

/** Заряд до bumpLevel: скрытый уровень ещё старый, либо stage уже нового раунда. */
export function chargeDueBeforeBump(
  code: string,
  hiddenLvl: number,
  stage: number,
  ind: number,
): boolean {
  const clock = CHARGE_CLOCK[code];
  if (!clock) {
    return false;
  }
  if (clock.kind === 'hidden-before') {
    return grantsHiddenBefore(hiddenLvl, clock.mod);
  }
  if (clock.kind === 'stage') {
    return grantsOnStage(stage, clock.mod, ind, clock.requireInd);
  }
  return false;
}

/**
 * CUT-2026-11-09 r6: как chargeDueBeforeBump, но для kind=stage —
 * не больше одного гранта за state.stage (мульти-level-up в одном раунде).
 */
export function claimChargeIfDue(
  code: string,
  unit: BattleUnit,
  stage: number,
  ind: number,
): boolean {
  if (!chargeDueBeforeBump(code, unit.hiddenLvl, stage, ind)) {
    return false;
  }
  const clock = CHARGE_CLOCK[code];
  if (clock?.kind === 'stage') {
    if (unit.lastChargeStage === stage) {
      return false;
    }
    unit.lastChargeStage = stage;
  }
  return true;
}

/** Сколько зарядов добавить после bump (Русалка). */
export function chargeGainedAfterBump(code: string, before: number, after: number, ind: number): number {
  const clock = CHARGE_CLOCK[code];
  if (!clock || clock.kind !== 'hidden-after') {
    return 0;
  }
  return gainedHiddenAfter(before, after, clock.mod, ind);
}

/** «Через K» из той же таблицы, что и начисление. */
export function stepsUntilCharge(code: string, hiddenLvl: number, stage: number): number | null {
  const clock = CHARGE_CLOCK[code];
  if (!clock) {
    return null;
  }
  if (clock.kind === 'hidden-before') {
    return bumpsUntilHiddenMod(hiddenLvl, clock.mod);
  }
  if (clock.kind === 'hidden-after') {
    return stepsUntilHiddenAfter(hiddenLvl, clock.mod);
  }
  return roundsUntilStageMod(stage, clock.mod);
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
      return `Старт 2. +1 заряд и +5 МР, когда скрытый уровень кратен 7, следующий через ${stepsUntilCharge(unit.heroClassCode, unit.hiddenLvl, stage)}.`;
    case 'DemonLord':
      return `Старт 2. +1 заряд, когда скрытый уровень кратен 5, следующий через ${stepsUntilCharge(unit.heroClassCode, unit.hiddenLvl, stage)}.`;
    case 'Marauder':
    case 'Werewolf':
      return `Старт 1. +1 заряд каждый 5-й раунд, следующий через ${stepsUntilCharge(unit.heroClassCode, unit.hiddenLvl, stage)}.`;
    case 'GhostWarrior':
      return `Старт 1. +1 заряд каждый 5-й раунд, следующий через ${stepsUntilCharge(unit.heroClassCode, unit.hiddenLvl, stage)}.`;
    case 'Oracle':
      return `Старт 1. +1 заряд, когда скрытый уровень кратен 6, следующий через ${stepsUntilCharge(unit.heroClassCode, unit.hiddenLvl, stage)}.`;
    case 'BeerElemental':
      return `Старт 3. +1 заряд, когда скрытый уровень кратен 6, следующий через ${stepsUntilCharge(unit.heroClassCode, unit.hiddenLvl, stage)}.`;
    case 'Mermaid':
      return `Старт 1. +1 заряд, когда скрытый уровень после повышения кратен 5, следующий через ${stepsUntilCharge(unit.heroClassCode, unit.hiddenLvl, stage)}.`;
    case 'Patriarch':
      return `Старт 1. +1 заряд, когда скрытый уровень кратен 7, следующий через ${stepsUntilCharge(unit.heroClassCode, unit.hiddenLvl, stage)}.`;
    case 'Pyro':
      return `Старт 1. +1 заряд каждый 5-й раунд, следующий через ${stepsUntilCharge(unit.heroClassCode, unit.hiddenLvl, stage)}.`;
    case 'Zombie':
      return `Старт 1. +1 заряд каждый 4-й раунд, следующий через ${stepsUntilCharge(unit.heroClassCode, unit.hiddenLvl, stage)}.`;
    case 'Titan':
      return `Старт 1. +1 заряд Дрожи земли за убийство. Сейчас ${unit.ultaCharges}.`;
    case 'Detective':
      return `Старт 2. Заряды не пополняются. Сейчас ${unit.ultaCharges}.`;
    case 'Assassin':
      return `Старт 2. +1…2 дротика каждый 4-й раунд, следующий через ${stepsUntilCharge(unit.heroClassCode, unit.hiddenLvl, stage)}. Сейчас ${unit.darts}.`;
    case 'Witch':
      return `Патроны: ${unit.gun}. +4 каждые 5 раундов, следующее через ${stepsUntilCharge(unit.heroClassCode, unit.hiddenLvl, stage)}.`;
    default:
      return null;
  }
}
