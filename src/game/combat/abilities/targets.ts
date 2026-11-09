import type { AttackKind } from '../damage';
import { hasEffect } from '../effects';
import { ROW_FRONT } from '../settings';
import type { BattleState, BattleUnit } from '../types';

/** Опции фильтра врагов (порт ignoreGuard из Pattern). */
export type EnemyFilterOpts = {
  /** Не отсекать «Под охраной» (детектив, укус оборотня и т.п.). */
  readonly ignoreGuard?: boolean;
};

/** Сообщение отказа, если цель скрыта невидимостью. Ход при этом не тратится. */
export const CONCEALED_TARGET_MESSAGE = 'Цель невидима';

/** Чужого невидимого нельзя выбрать. Себя — можно. */
export function isConcealedFrom(actor: BattleUnit, target: BattleUnit): boolean {
  return target.id !== actor.id && hasEffect(target, 'INVISIBLE');
}

/** Убирает невидимых для актора. Союзные массовые баффы этот фильтр не используют. */
export function omitConcealed(actor: BattleUnit, units: readonly BattleUnit[]): BattleUnit[] {
  return units.filter((unit) => !isConcealedFrom(actor, unit));
}

/**
 * Все живые враги (без SANCTUM; без GUARDED, если не ignoreGuard; без INVISIBLE).
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
      !hasEffect(unit, 'INVISIBLE') &&
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
  return state.units.filter((unit) => unit.alive && unit.team === ref.team && unit.row === ref.row);
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

/** Базовый радиус оружия по классу (старые снимки без поля). */
export function defaultWeaponReach(heroClassCode: string): number {
  return heroClassCode === 'Knight' || heroClassCode === 'DemonLord' ? 2 : 1;
}

/** Фактический радиус оружия юнита. */
export function weaponReachOf(unit: BattleUnit): number {
  if (typeof unit.weaponReach === 'number' && unit.weaponReach >= 1) {
    return unit.weaponReach;
  }
  return defaultWeaponReach(unit.heroClassCode);
}

/**
 * Достижима ли цель по колонкам (порт isReachableForMelee / lengthOfWeapon).
 * Блокеры — живые на переднем ряду команды цели, колонка в отрезке без колонки цели.
 */
export function isMeleeColumnReachable(
  state: BattleState,
  attacker: BattleUnit,
  target: BattleUnit
): boolean {
  const attCol = liveColumn(state, attacker);
  const tgtCol = liveColumn(state, target);
  if (attCol < 0 || tgtCol < 0) {
    return false;
  }
  const reach = weaponReachOf(attacker);
  if (Math.abs(attCol - tgtCol) <= reach) {
    return true;
  }
  const lo = Math.min(attCol, tgtCol);
  const hi = Math.max(attCol, tgtCol);
  const blocked = state.units.some((unit) => {
    if (!unit.alive || unit.team !== target.team || unit.row !== ROW_FRONT) {
      return false;
    }
    const col = liveColumn(state, unit);
    return col >= lo && col <= hi && col !== tgtCol;
  });
  return !blocked;
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
 * Сосед по ряду в сторону центра (по живым позициям без SANCTUM).
 * При равном удалении от центра — сначала больший индекс, затем меньший.
 */
export function neighborTowardCenter(
  sameRow: BattleUnit[],
  col: number,
  legalIds: Set<string>
): BattleUnit | null {
  if (col < 0 || sameRow.length <= 1) {
    return null;
  }
  const mid = (sameRow.length - 1) / 2;
  const toward = col < mid ? col + 1 : col > mid ? col - 1 : col + 1;
  const away = col < mid ? col - 1 : col > mid ? col + 1 : col - 1;
  for (const idx of [toward, away]) {
    const unit = sameRow[idx];
    if (unit && legalIds.has(unit.id)) {
      return unit;
    }
  }
  return null;
}

/**
 * Квадрат 2×2 (CUT AC-9): цель + сосед по ряду + двое напротив в другом ряду.
 * Порядок обхода для цепочки шансов: primary → neighbor → opposite(primary) → opposite(neighbor).
 */
export function degradationSquareTargets(
  state: BattleState,
  actor: BattleUnit,
  primary: BattleUnit
): BattleUnit[] {
  const legalIds = new Set(enemiesOf(state, actor).map((unit) => unit.id));
  if (!legalIds.has(primary.id)) {
    return [];
  }
  const col = liveColumn(state, primary);
  if (col < 0) {
    return [primary];
  }
  const sameRow = state.units
    .filter(
      (unit) =>
        unit.alive &&
        unit.team === primary.team &&
        unit.row === primary.row &&
        !hasEffect(unit, 'SANCTUM')
    )
    .sort((a, b) => a.column - b.column || a.id.localeCompare(b.id));
  // Индекс в sameRow (не raw liveColumn): сосед — в сторону центра ряда.
  const rowCol = sameRow.findIndex((unit) => unit.id === primary.id);
  const neighbor = neighborTowardCenter(sameRow, rowCol, legalIds);
  const otherRow = primary.row === 0 ? 1 : 0;
  const oppositeRow = state.units
    .filter(
      (unit) =>
        unit.alive &&
        unit.team === primary.team &&
        unit.row === otherRow &&
        !hasEffect(unit, 'SANCTUM')
    )
    .sort((a, b) => a.column - b.column || a.id.localeCompare(b.id));
  const oppositePrimary =
    oppositeRow[col] && legalIds.has(oppositeRow[col]!.id) ? oppositeRow[col]! : null;
  const neighborCol = neighbor ? liveColumn(state, neighbor) : -1;
  const oppositeNeighbor =
    neighborCol >= 0 && oppositeRow[neighborCol] && legalIds.has(oppositeRow[neighborCol]!.id)
      ? oppositeRow[neighborCol]!
      : null;

  const ordered: BattleUnit[] = [primary];
  for (const unit of [neighbor, oppositePrimary, oppositeNeighbor]) {
    if (unit && !ordered.some((item) => item.id === unit.id)) {
      ordered.push(unit);
    }
  }
  return ordered;
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
 * Поверх рядов — правило колонок (weaponReach).
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
  const byRow = frontAlive.length > 0 ? enemies.filter((unit) => unit.row === ROW_FRONT) : enemies;
  return byRow.filter((target) => isMeleeColumnReachable(state, attacker, target));
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
