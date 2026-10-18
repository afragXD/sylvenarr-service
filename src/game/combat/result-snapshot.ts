import type { BattleState, BattleUnit } from './types';

export type MatchUnitSnap = {
  pickId: string;
  heroClassCode: string;
  displayName: string;
  row: number;
  column: number;
  maxHp: number;
  health: number;
  alive: boolean;
  damage: number;
  armor: number;
  initiative: number;
  lvl: number;
};

export type MatchTeamSnap = {
  playerId: string;
  displayName: string;
  units: MatchUnitSnap[];
};

export type MatchResultSnapshot = {
  outcome: 'host_win' | 'guest_win' | 'draw';
  stage: number;
  log: string[];
  host: MatchTeamSnap;
  guest: MatchTeamSnap;
};

/**
 * Собирает персистентный снимок конца боя для истории матчей.
 */
export function buildResultSnapshot(input: {
  readonly state: BattleState;
  readonly hostDisplayName: string;
  readonly guestDisplayName: string;
}): MatchResultSnapshot {
  const { state } = input;
  const outcome =
    state.outcome === 'host_win' || state.outcome === 'guest_win' || state.outcome === 'draw'
      ? state.outcome
      : 'draw';

  return {
    outcome,
    stage: state.stage,
    log: state.log.slice(-20),
    host: {
      playerId: state.hostPlayerId,
      displayName: input.hostDisplayName,
      units: state.units
        .filter((unit) => unit.team === 0)
        .sort(byRowColumn)
        .map(toUnitSnap),
    },
    guest: {
      playerId: state.guestPlayerId,
      displayName: input.guestDisplayName,
      units: state.units
        .filter((unit) => unit.team === 1)
        .sort(byRowColumn)
        .map(toUnitSnap),
    },
  };
}

function toUnitSnap(unit: BattleUnit): MatchUnitSnap {
  return {
    pickId: unit.id,
    heroClassCode: unit.heroClassCode,
    displayName: unit.displayName,
    row: unit.row,
    column: unit.column,
    maxHp: unit.maxHp,
    health: Math.max(0, unit.health),
    alive: unit.alive,
    damage: unit.damage,
    armor: unit.armor,
    initiative: unit.initiative,
    lvl: unit.lvl,
  };
}

function byRowColumn(a: BattleUnit, b: BattleUnit): number {
  if (a.row !== b.row) {
    return a.row - b.row;
  }
  return a.column - b.column;
}
