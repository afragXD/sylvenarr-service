import type { AttackKind } from '../damage';
import { hasEffect } from '../effects';
import { ROW_FRONT } from '../settings';
import type { BattleState, BattleUnit } from '../types';

/** Опции фильтра врагов (порт ignoreGuard из Pattern). */
export type EnemyFilterOpts = {
  /** Не отсекать «Под охраной» (детектив, укус оборотня и т.п.). */
  readonly ignoreGuard?: boolean;
};

/**
 * Все живые враги (без SANCTUM; без GUARDED, если не ignoreGuard).
 */
export function enemiesOf(
  state: BattleState,
  actor: BattleUnit,
  opts: EnemyFilterOpts = {}
): BattleUnit[] {
  return state.units.filter(
    (unit) =>
      unit.alive &&
      unit.team !== actor.team &&
      !hasEffect(unit, 'SANCTUM') &&
      (opts.ignoreGuard === true || !hasEffect(unit, 'GUARDED'))
  );
}

/**
 * Все живые союзники.
 */
export function alliesOf(state: BattleState, actor: BattleUnit): BattleUnit[] {
  return state.units.filter((unit) => unit.alive && unit.team === actor.team);
}

/**
 * Союзники своего ряда.
 */
export function ownRowAllies(state: BattleState, actor: BattleUnit): BattleUnit[] {
  return alliesOf(state, actor).filter((unit) => unit.row === actor.row);
}

/**
 * Живые юниты той же команды и того же ряда, что и `ref`.
 */
export function unitsOnSameRow(state: BattleState, ref: BattleUnit): BattleUnit[] {
  return state.units.filter(
    (unit) => unit.alive && unit.team === ref.team && unit.row === ref.row
  );
}

/**
 * Живой индекс колонны в ряду: как в боте `list(getOwnRow()).index(self)`.
 * Хранимый `unit.column` после смены ряда (Катавасия и т.п.) может врать.
 */
export function liveColumn(state: BattleState, unit: BattleUnit): number {
  return state.units
    .filter((item) => item.alive && item.team === unit.team && item.row === unit.row)
    .sort((a, b) => a.column - b.column || a.id.localeCompare(b.id))
    .findIndex((item) => item.id === unit.id);
}

/**
 * Враги в той же колонке, что и `ref` (с фильтром SANCTUM).
 */
export function enemiesInColumn(
  state: BattleState,
  actor: BattleUnit,
  ref: BattleUnit
): BattleUnit[] {
  const col = liveColumn(state, ref);
  if (col < 0) {
    return [];
  }
  return enemiesOf(state, actor).filter((unit) => liveColumn(state, unit) === col);
}

/**
 * Сосед по колонке позади цели (тот же живой индекс в заднем ряду).
 */
export function neighbourBehind(state: BattleState, target: BattleUnit): BattleUnit | null {
  const col = liveColumn(state, target);
  if (col < 0) {
    return null;
  }
  const behindRow = state.units
    .filter(
      (unit) =>
        unit.alive &&
        unit.team === target.team &&
        unit.row === target.row + 1 &&
        !hasEffect(unit, 'SANCTUM')
    )
    .sort((a, b) => a.column - b.column || a.id.localeCompare(b.id));
  return behindRow[col] ?? null;
}

/**
 * Живые враги на переднем ряду, включая SANCTUM (блок ряда, не список целей).
 */
export function livingEnemyFront(state: BattleState, actor: BattleUnit): BattleUnit[] {
  return state.units.filter(
    (unit) => unit.alive && unit.team !== actor.team && unit.row === ROW_FRONT
  );
}

/**
 * Цели атаки ближнего боя (порт isReachableForMelee) — правило атаки, не юнита.
 * Передний ряд с живыми (в т.ч. под SANCTUM) блокирует задний; SANCTUM/GUARDED из целей исключаются.
 */
export function meleeTargets(
  state: BattleState,
  attacker: BattleUnit,
  opts: EnemyFilterOpts = {}
): BattleUnit[] {
  const enemies = enemiesOf(state, attacker, opts);
  const ownFrontAlive = state.units.some(
    (unit) => unit.alive && unit.team === attacker.team && unit.row === ROW_FRONT
  );
  if (attacker.row === 1 && ownFrontAlive) {
    return [];
  }
  const frontAlive = livingEnemyFront(state, attacker);
  if (frontAlive.length > 0) {
    return enemies.filter((unit) => unit.row === ROW_FRONT);
  }
  return enemies;
}

/**
 * Цели ближнего боя или все враги при ignoreMelee.
 */
export function meleeOrAll(
  state: BattleState,
  actor: BattleUnit,
  ignoreMelee: boolean,
  opts: EnemyFilterOpts = {}
): BattleUnit[] {
  if (ignoreMelee) {
    return enemiesOf(state, actor, opts);
  }
  return meleeTargets(state, actor, opts);
}

/**
 * Цели атаки заданного типа: ближняя — по правилам рядов, дальняя/магия — все враги.
 */
export function attackTargets(
  state: BattleState,
  actor: BattleUnit,
  kind: AttackKind,
  opts: EnemyFilterOpts = {}
): BattleUnit[] {
  return kind === 'melee' ? meleeTargets(state, actor, opts) : enemiesOf(state, actor, opts);
}

/**
 * Смещает юнита на другой ряд (movement-lite).
 */
export function moveToOtherRow(unit: BattleUnit): void {
  unit.row = unit.row === ROW_FRONT ? 1 : 0;
}

/**
 * «Лидер» вражеской команды: стабильная эвристика (мин. column, затем id).
 */
export function enemyTeamLeader(state: BattleState, actor: BattleUnit): BattleUnit | null {
  const enemies = state.units
    .filter((unit) => unit.alive && unit.team !== actor.team)
    .sort((a, b) => a.column - b.column || a.id.localeCompare(b.id));
  return enemies[0] ?? null;
}
