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
 * Живые враги на переднем ряду, включая SANCTUM (блок ряда, не список целей).
 */
export function livingEnemyFront(state: BattleState, actor: BattleUnit): BattleUnit[] {
  return state.units.filter(
    (unit) => unit.alive && unit.team !== actor.team && unit.row === ROW_FRONT
  );
}

/**
 * Доступные цели для атаки (melee-правила).
 * Передний ряд с живыми (в т.ч. под SANCTUM) блокирует задний; SANCTUM из целей исключается.
 */
export function listAttackTargets(state: BattleState, attacker: BattleUnit): BattleUnit[] {
  const enemies = enemiesOf(state, attacker);
  if (attacker.attackStyle !== 'melee') {
    return enemies;
  }
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

/**
 * «Лидер» вражеской команды: стабильная эвристика (мин. column, затем id).
 */
export function enemyTeamLeader(state: BattleState, actor: BattleUnit): BattleUnit | null {
  const enemies = state.units
    .filter((unit) => unit.alive && unit.team !== actor.team)
    .sort((a, b) => a.column - b.column || a.id.localeCompare(b.id));
  return enemies[0] ?? null;
}
