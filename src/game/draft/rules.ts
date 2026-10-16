import { INITIAL_TEAM_SIZE, MAX_ROW_SIZE, ROW_BACK, ROW_FRONT } from './settings';
import type { DraftHeroRef, DraftPick } from './types';

/**
 * Сумма size пиков игрока.
 */
export function teamSize(picks: ReadonlyArray<DraftPick>, playerId: string): number {
  return picks
    .filter((pick) => pick.playerId === playerId)
    .reduce((sum, pick) => sum + pick.size, 0);
}

/**
 * Может ли игрок выбрать ещё героя.
 */
export function canPickMore(picks: ReadonlyArray<DraftPick>, playerId: string): boolean {
  return teamSize(picks, playerId) < INITIAL_TEAM_SIZE;
}

/**
 * Чей ход (legacy creationOfLeaders): хост → гость → … пока у кого-то есть квота.
 */
export function resolveTurnPlayerId(
  picks: ReadonlyArray<DraftPick>,
  hostId: string,
  guestId: string
): string | null {
  const hostCan = canPickMore(picks, hostId);
  const guestCan = canPickMore(picks, guestId);
  if (!hostCan && !guestCan) {
    return null;
  }
  if (!hostCan) {
    return guestId;
  }
  if (!guestCan) {
    return hostId;
  }
  if (picks.length === 0) {
    return hostId;
  }
  const last = [...picks].sort((a, b) => a.pickOrder - b.pickOrder).at(-1);
  return last?.playerId === hostId ? guestId : hostId;
}

/**
 * Обе команды набрали квоту.
 */
export function isDraftComplete(
  picks: ReadonlyArray<DraftPick>,
  hostId: string,
  guestId: string
): boolean {
  return !canPickMore(picks, hostId) && !canPickMore(picks, guestId);
}

export type PickValidation = { ok: true } | { ok: false; message: string };

/**
 * Валидация пика: квота size и место в ряду.
 */
export function validatePick(input: {
  readonly picks: ReadonlyArray<DraftPick>;
  readonly playerId: string;
  readonly hero: DraftHeroRef;
  readonly row: number;
}): PickValidation {
  if (!input.hero.isPlayable) {
    return { ok: false, message: 'Этот класс нельзя выбрать в draft' };
  }
  if (input.row !== ROW_FRONT && input.row !== ROW_BACK) {
    return { ok: false, message: 'Некорректный ряд' };
  }
  const currentSize = teamSize(input.picks, input.playerId);
  if (currentSize + input.hero.size > INITIAL_TEAM_SIZE) {
    return { ok: false, message: 'У вас нет места в отряде для данного героя' };
  }
  const rowCount = input.picks.filter(
    (pick) => pick.playerId === input.playerId && pick.row === input.row
  ).length;
  if (rowCount + 1 > MAX_ROW_SIZE) {
    return { ok: false, message: 'На этом ряду нет места' };
  }
  return { ok: true };
}

/**
 * Перенос уже взятого юнита на другой ряд (size уже в квоте).
 */
export function validateMovePick(input: {
  readonly picks: ReadonlyArray<DraftPick>;
  readonly pickId: string;
  readonly playerId: string;
  readonly row: number;
}): PickValidation {
  if (input.row !== ROW_FRONT && input.row !== ROW_BACK) {
    return { ok: false, message: 'Некорректный ряд' };
  }
  const pick = input.picks.find((item) => item.id === input.pickId);
  if (!pick || pick.playerId !== input.playerId) {
    return { ok: false, message: 'Пик не найден' };
  }
  if (pick.row === input.row) {
    return { ok: true };
  }
  const rowCount = input.picks.filter(
    (item) => item.playerId === input.playerId && item.row === input.row && item.id !== input.pickId
  ).length;
  if (rowCount + 1 > MAX_ROW_SIZE) {
    return { ok: false, message: 'На этом ряду нет места' };
  }
  return { ok: true };
}

/**
 * Случайный валидный герой и ряд (сначала front, иначе back).
 */
export function pickRandomValid(input: {
  readonly picks: ReadonlyArray<DraftPick>;
  readonly playerId: string;
  readonly heroes: ReadonlyArray<DraftHeroRef>;
  readonly preferredRow?: number;
}): { hero: DraftHeroRef; row: number } | null {
  const playable = input.heroes.filter((hero) => hero.isPlayable);
  const shuffled = [...playable].sort(() => Math.random() - 0.5);
  const rows =
    input.preferredRow === ROW_BACK || input.preferredRow === ROW_FRONT
      ? [input.preferredRow, input.preferredRow === ROW_FRONT ? ROW_BACK : ROW_FRONT]
      : [ROW_FRONT, ROW_BACK];

  for (const hero of shuffled) {
    for (const row of rows) {
      const check = validatePick({
        picks: input.picks,
        playerId: input.playerId,
        hero,
        row,
      });
      if (check.ok) {
        return { hero, row };
      }
    }
  }
  return null;
}
