import { hasEffect } from '../effects';
import { ROW_FRONT } from '../settings';
import type { BattleState, BattleUnit } from '../types';

/**
 * Все живые враги (без SANCTUM — нельзя выбрать целью).
 */
export function enemiesOf(state: BattleState, actor: BattleUnit): BattleUnit[] {
  return state.units.filter(
    (unit) => unit.alive && unit.team !== actor.team && !hasEffect(unit, 'SANCTUM')
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
 * Враги в той же колонке, что и `ref` (с фильтром SANCTUM).
 */
export function enemiesInColumn(
  state: BattleState,
  actor: BattleUnit,
  ref: BattleUnit
): BattleUnit[] {
  return enemiesOf(state, actor).filter((unit) => unit.column === ref.column);
}

/**
 * Сосед по колонке позади цели.
 */
export function neighbourBehind(state: BattleState, target: BattleUnit): BattleUnit | null {
  return (
    state.units.find(
      (unit) =>
        unit.alive &&
        unit.team === target.team &&
        unit.column === target.column &&
        unit.row === target.row + 1 &&
        !hasEffect(unit, 'SANCTUM')
    ) ?? null
  );
}

/**
 * Доступные цели для атаки (melee-правила).
 */
export function listAttackTargets(state: BattleState, attacker: BattleUnit): BattleUnit[] {
  const enemies = enemiesOf(state, attacker);
  if (attacker.attackStyle !== 'melee') {
    return enemies;
  }
  const enemyFront = enemies.filter((unit) => unit.row === ROW_FRONT);
  const ownFrontAlive = state.units.some(
    (unit) => unit.alive && unit.team === attacker.team && unit.row === ROW_FRONT
  );
  if (attacker.row === 1 && ownFrontAlive) {
    return [];
  }
  if (enemyFront.length > 0) {
    return enemyFront;
  }
  return enemies;
}

/**
 * Цели ближнего боя или все враги при ignoreMelee.
 */
export function meleeOrAll(
  state: BattleState,
  actor: BattleUnit,
  ignoreMelee: boolean
): BattleUnit[] {
  if (ignoreMelee) {
    return enemiesOf(state, actor);
  }
  return listAttackTargets(state, actor);
}

/**
 * Смещает юнита на другой ряд (movement-lite).
 */
export function moveToOtherRow(unit: BattleUnit): void {
  unit.row = unit.row === ROW_FRONT ? 1 : 0;
}
