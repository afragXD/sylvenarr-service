import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { abbessAbilities } from './abbess';
import { archlichAbilities } from './archlich';
import { assassinAbilities } from './assassin';
import { demiurgeAbilities } from './demiurge';
import { demonLordAbilities } from './demon-lord';
import { detectiveAbilities } from './detective';
import { beerElementalAbilities } from './beer-elemental';
import { dracolichAbilities } from './dracolich';
import { ectoplasmAbilities } from './ectoplasm';
import { evilTreeAbilities } from './evil-tree';
import { ghostWarriorAbilities } from './ghost-warrior';
import { goblinShamanAbilities } from './goblin-shaman';
import { goblinTrapperAbilities } from './goblin-trapper';
import { goldGolemAbilities } from './gold-golem';
import { herbalistAbilities } from './herbalist';
import { inquisitorAbilities } from './inquisitor';
import { knightAbilities } from './knight';
import { marauderAbilities } from './marauder';
import { mermaidAbilities } from './mermaid';
import { oracleAbilities } from './oracle';
import { orcKingAbilities } from './orc-king';
import { paladinAbilities } from './paladin';
import { patriarchAbilities } from './patriarch';
import { pyroAbilities } from './pyro';
import { skeletonChampionAbilities } from './skeleton-champion';
import { specterAbilities } from './specter';
import { witchAbilities } from './witch';
import { zombieAbilities } from './zombie';
import type { AbilityHandler, AbilityOutcome } from './types';

const PILOT_HANDLERS: Record<string, AbilityHandler> = {
  Knight: knightAbilities,
  OrcKing: orcKingAbilities,
  Archlich: archlichAbilities,
  DemonLord: demonLordAbilities,
  Assassin: assassinAbilities,
  Paladin: paladinAbilities,
  Abbess: abbessAbilities,
  Witch: witchAbilities,
  Inquisitor: inquisitorAbilities,
  Marauder: marauderAbilities,
  Werewolf: marauderAbilities,
  Herbalist: herbalistAbilities,
  Patriarch: patriarchAbilities,
  Oracle: oracleAbilities,
  Demiurge: demiurgeAbilities,
  Pyro: pyroAbilities,
  Specter: specterAbilities,
  Detective: detectiveAbilities,
  GhostWarrior: ghostWarriorAbilities,
  GoldGolem: goldGolemAbilities,
  BeerElemental: beerElementalAbilities,
  EvilTree: evilTreeAbilities,
  Mermaid: mermaidAbilities,
  Dracolich: dracolichAbilities,
  Zombie: zombieAbilities,
  SkeletonChampion: skeletonChampionAbilities,
  GoblinShaman: goblinShamanAbilities,
  GoblinTrapper: goblinTrapperAbilities,
  Ectoplasm: ectoplasmAbilities,
};

/**
 * Класс с полным набором слотов 1–5.
 */
export function isPilotClass(code: string): boolean {
  return code in PILOT_HANDLERS;
}

/**
 * Список способностей пилота (или пусто).
 */
export function listPilotAbilities(state: BattleState, actor: BattleUnit): AbilityInfo[] {
  const handler = PILOT_HANDLERS[actor.heroClassCode];
  if (!handler) {
    return [];
  }
  return handler.listAbilities(state, actor);
}

/**
 * preChoice пилота в начале хода.
 */
export function runPreChoice(state: BattleState, actor: BattleUnit): void {
  const handler = PILOT_HANDLERS[actor.heroClassCode];
  handler?.preChoice?.(state, actor);
}

/**
 * Применяет способность пилота. reject = ход не тратится.
 */
export function applyAbility(
  state: BattleState,
  actor: BattleUnit,
  input: {
    readonly slot: AbilitySlot;
    readonly targetId?: string;
    readonly choice?: string;
  }
): AbilityOutcome {
  const handler = PILOT_HANDLERS[actor.heroClassCode];
  if (!handler) {
    return { status: 'reject', message: 'У этого героя нет слотов способностей' };
  }
  if (state.pendingPrompt && state.pendingPrompt.unitId !== actor.id) {
    return { status: 'reject', message: 'Ожидается выбор другого юнита' };
  }
  if (state.pendingPrompt && state.pendingPrompt.unitId === actor.id) {
    return handler.apply(state, actor, {
      slot: state.pendingPrompt.slot,
      targetId: input.targetId,
      choice: input.choice,
    });
  }
  return handler.apply(state, actor, input);
}

/**
 * Инициализация runtime-флагов пилота.
 */
export function initPilotFlags(unit: BattleUnit): void {
  switch (unit.heroClassCode) {
    case 'OrcKing':
      unit.maxSummons = 1;
      unit.authority = 2 + Math.floor(Math.random() * 2);
      break;
    case 'Archlich':
      unit.maxSummons = 1;
      break;
    case 'DemonLord':
      unit.ultaCharges = 2;
      break;
    case 'Assassin':
      unit.darts = 2;
      unit.deathNote = 15;
      unit.deathNoteCd = 0;
      break;
    case 'Paladin':
      unit.ultaCharges = 2;
      break;
    case 'Witch':
      unit.gun = 4;
      break;
    case 'Marauder':
      unit.ultaCharges = 1;
      break;
    case 'Patriarch':
      unit.ultaCharges = 1;
      break;
    case 'Oracle':
      unit.ultaCharges = 1;
      break;
    case 'Demiurge':
      unit.maxSummons = 2;
      break;
    case 'Detective':
      unit.gun = 1;
      unit.ultaCharges = 2;
      break;
    case 'GhostWarrior':
      unit.ultaCharges = 1;
      break;
    case 'GoldGolem':
      unit.forbiddenResurrect = true;
      break;
    case 'BeerElemental':
      unit.ultaCharges = 3;
      break;
    case 'Mermaid':
      unit.ultaCharges = 1;
      break;
    case 'Pyro':
      unit.ultaCharges = 1;
      break;
    case 'Zombie':
      unit.ultaCharges = 1;
      break;
    default:
      break;
  }
}
