import { hasEffect } from '../effects';
import { chargeHintFor } from './charge-hints';
import { baseMaxSummonsForClass } from '../transform';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { CONCEALED_TARGET_MESSAGE, isConcealedFrom } from './targets';
import { abbessAbilities } from './abbess';
import { angelAbilities } from './angel';
import { antipaladinAbilities } from './antipaladin';
import { archlichAbilities } from './archlich';
import { assassinAbilities } from './assassin';
import { beerElementalAbilities } from './beer-elemental';
import { demiurgeAbilities } from './demiurge';
import { demonLordAbilities } from './demon-lord';
import { detectiveAbilities } from './detective';
import { dracolichAbilities } from './dracolich';
import { ectoplasmAbilities } from './ectoplasm';
import { evilTreeAbilities } from './evil-tree';
import { ghostWarriorAbilities } from './ghost-warrior';
import { goblinShamanAbilities } from './goblin-shaman';
import { goblinTrapperAbilities } from './goblin-trapper';
import { goldGolemAbilities } from './gold-golem';
import { herbalistAbilities } from './herbalist';
import { impAbilities } from './imp';
import { incubAbilities } from './incub';
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
import { titanAbilities } from './titan';
import type { AbilityHandler, AbilityOutcome } from './types';
import { witchAbilities } from './witch';
import { zombieAbilities } from './zombie';

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
  Imp: impAbilities,
  Antipaladin: antipaladinAbilities,
  Angel: angelAbilities,
  Titan: titanAbilities,
  Incub: incubAbilities,
};

/** Коды классов со слотами 1–5. */
export const PILOT_CLASS_CODES: readonly string[] = Object.keys(PILOT_HANDLERS);

/**
 * Класс с полным набором слотов 1–5.
 */
export function isPilotClass(code: string): boolean {
  return code in PILOT_HANDLERS;
}

/** Убирает чужих невидимых из списка выбора. Пустые id (могилы, skip) остаются. */
function publishAbilities(
  state: BattleState,
  actor: BattleUnit,
  abilities: readonly AbilityInfo[],
): AbilityInfo[] {
  return abilities.map((ability) => {
    const legalTargetIds = ability.legalTargetIds.filter((id) => {
      if (id === actor.id) {
        return true;
      }
      const unit = state.units.find((item) => item.id === id);
      if (!unit || !unit.alive) {
        return true;
      }
      return !hasEffect(unit, 'INVISIBLE');
    });
    const lostAll =
      ability.needsTarget && ability.legalTargetIds.length > 0 && legalTargetIds.length === 0;
    return {
      ...ability,
      legalTargetIds,
      disabledReason: ability.disabledReason ?? (lostAll ? 'Нет целей' : null),
    };
  });
}

function rejectConcealedSelection(
  state: BattleState,
  actor: BattleUnit,
  ids: readonly (string | undefined)[],
): AbilityOutcome | null {
  for (const id of ids) {
    if (!id) {
      continue;
    }
    const unit = state.units.find((item) => item.id === id && item.alive);
    if (unit && isConcealedFrom(actor, unit)) {
      return { status: 'reject', message: CONCEALED_TARGET_MESSAGE };
    }
  }
  return null;
}

export function listPilotAbilities(state: BattleState, actor: BattleUnit): AbilityInfo[] {
  const handler = PILOT_HANDLERS[actor.heroClassCode];
  if (!handler) {
    return [];
  }
  return publishAbilities(state, actor, handler.listAbilities(state, actor)).map((ability) => {
    const hint = chargeHintFor(actor, state, ability.slot);
    return hint ? { ...ability, hint } : ability;
  });
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
  const concealed = rejectConcealedSelection(state, actor, [input.targetId, input.choice]);
  if (concealed) {
    return concealed;
  }
  if (state.pendingPrompt && state.pendingPrompt.unitId !== actor.id) {
    return { status: 'reject', message: 'Ожидается выбор другого юнита' };
  }
  if (state.pendingPrompt && state.pendingPrompt.unitId === actor.id) {
    const slot = state.pendingPrompt.slot ?? input.slot;
    return handler.apply(state, actor, {
      slot,
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
  unit.maxSummons = baseMaxSummonsForClass(unit.heroClassCode);
  switch (unit.heroClassCode) {
    case 'OrcKing':
      unit.authority = 2;
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
    case 'Detective':
      unit.gun = 1;
      unit.ultaCharges = 2;
      break;
    case 'GhostWarrior':
      unit.ultaCharges = 1;
      unit.maxSummons = Math.max(unit.maxSummons, 1);
      break;
    case 'GoldGolem':
      unit.forbiddenResurrect = true;
      // CUT-2026-11-03b T2: Отражение на 6 раундов при создании (драфт и саммон).
      if (!unit.effects.some((effect) => effect.id === 'REFLECTION')) {
        unit.effects.push({ id: 'REFLECTION', rounds: 6, power: 0, fresh: true });
      }
      break;
    case 'BeerElemental':
      unit.ultaCharges = 3;
      break;
    case 'Mermaid':
      unit.ultaCharges = 1;
      break;
    case 'Titan':
      unit.ultaCharges = 1;
      break;
    case 'Pyro':
      unit.ultaCharges = 1;
      break;
    case 'Zombie':
      unit.ultaCharges = 1;
      break;
    case 'Titan':
      unit.ultaCharges = 1;
      break;
    default:
      break;
  }
}
