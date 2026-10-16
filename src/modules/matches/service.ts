import {
  isDraftComplete,
  pickRandomValid,
  resolveTurnPlayerId,
  teamSize,
  validatePick,
} from '../../game/draft/rules';
import { INITIAL_TEAM_SIZE } from '../../game/draft/settings';
import type { DraftPick } from '../../game/draft/types';
import { prisma } from '../../shared/db';
import { createInviteCode } from '../../utils/create-invite-code';
import type { MatchesModel } from './model';

type PickRow = {
  id: string;
  playerId: string;
  heroClassCode: string;
  row: number;
  pickOrder: number;
  heroClass: { displayName: string; size: number };
};

type MatchRow = {
  id: string;
  status: MatchesModel.matchStatus;
  inviteCode: string;
  hostId: string;
  guestId: string | null;
  createdAt: Date;
  host: { id: string; displayName: string };
  guest: { id: string; displayName: string } | null;
  picks: PickRow[];
};

const matchInclude = {
  host: { select: { id: true, displayName: true } },
  guest: { select: { id: true, displayName: true } },
  picks: {
    orderBy: { pickOrder: 'asc' as const },
    select: {
      id: true,
      playerId: true,
      heroClassCode: true,
      row: true,
      pickOrder: true,
      heroClass: { select: { displayName: true, size: true } },
    },
  },
};

export abstract class MatchesService {
  /**
   * Пики матча → DraftPick[].
   */
  private static toDraftPicks(picks: ReadonlyArray<PickRow>): DraftPick[] {
    return picks.map((pick) => ({
      id: pick.id,
      playerId: pick.playerId,
      heroClassCode: pick.heroClassCode,
      displayName: pick.heroClass.displayName,
      size: pick.heroClass.size,
      row: pick.row,
      pickOrder: pick.pickOrder,
    }));
  }

  /**
   * Преобразует матч из БД в DTO с draft state.
   */
  static mapMatch(row: MatchRow): MatchesModel.match {
    const picks = MatchesService.toDraftPicks(row.picks);
    const guestId = row.guestId ?? '';
    const hostSize = teamSize(picks, row.hostId);
    const guestSize = guestId ? teamSize(picks, guestId) : 0;
    const turnPlayerId =
      row.status === 'drafting' && row.guestId
        ? resolveTurnPlayerId(picks, row.hostId, row.guestId)
        : null;

    return {
      id: row.id,
      status: row.status,
      inviteCode: row.inviteCode,
      host: row.host,
      guest: row.guest,
      createdAt: row.createdAt.toISOString(),
      draft: {
        turnPlayerId,
        hostPicks: picks.filter((pick) => pick.playerId === row.hostId),
        guestPicks: guestId ? picks.filter((pick) => pick.playerId === guestId) : [],
        hostSize,
        guestSize,
        initialTeamSize: INITIAL_TEAM_SIZE,
      },
    };
  }

  /**
   * Создаёт лобби в статусе waiting.
   */
  static async createMatch(hostId: string): Promise<MatchesModel.match> {
    const inviteCode = createInviteCode();
    const row = await prisma.match.create({
      data: {
        hostId,
        inviteCode,
        status: 'waiting',
      },
      include: matchInclude,
    });
    return MatchesService.mapMatch(row);
  }

  /**
   * Присоединяет гостя к лобби по коду → drafting.
   */
  static async joinMatch(input: {
    readonly inviteCode: string;
    readonly guestId: string;
  }): Promise<{ ok: true; match: MatchesModel.match } | { ok: false; message: string }> {
    const normalizedCode = input.inviteCode.trim().toUpperCase();
    const existing = await prisma.match.findUnique({
      where: { inviteCode: normalizedCode },
      include: matchInclude,
    });
    if (!existing) {
      return { ok: false, message: 'Матч с таким кодом не найден' };
    }
    if (existing.status === 'cancelled') {
      return { ok: false, message: 'Матч отменён' };
    }
    if (existing.hostId === input.guestId) {
      return { ok: false, message: 'Нельзя присоединиться к своему матчу' };
    }
    if (existing.guestId && existing.guestId !== input.guestId) {
      return { ok: false, message: 'Матч уже заполнен' };
    }
    if (existing.guestId === input.guestId) {
      return { ok: true, match: MatchesService.mapMatch(existing) };
    }
    if (existing.status !== 'waiting') {
      return { ok: false, message: 'К этому матчу уже нельзя присоединиться' };
    }
    const row = await prisma.match.update({
      where: { id: existing.id },
      data: {
        guestId: input.guestId,
        status: 'drafting',
      },
      include: matchInclude,
    });
    return { ok: true, match: MatchesService.mapMatch(row) };
  }

  /**
   * Возвращает матч по id.
   */
  static async findById(id: string): Promise<MatchesModel.match | null> {
    const row = await prisma.match.findUnique({
      where: { id },
      include: matchInclude,
    });
    if (!row) {
      return null;
    }
    return MatchesService.mapMatch(row);
  }

  /**
   * Проверяет, что игрок — участник матча.
   */
  private static isParticipant(row: MatchRow, playerId: string): boolean {
    return row.hostId === playerId || row.guestId === playerId;
  }

  /**
   * Пик героя в draft.
   */
  static async draftPick(input: {
    readonly matchId: string;
    readonly playerId: string;
    readonly heroCode: string;
    readonly row: number;
  }): Promise<
    | { ok: true; match: MatchesModel.match }
    | { ok: false; message: string; status: 400 | 403 | 404 }
  > {
    const existing = await prisma.match.findUnique({
      where: { id: input.matchId },
      include: matchInclude,
    });
    if (!existing) {
      return { ok: false, message: 'Матч не найден', status: 404 };
    }
    if (!MatchesService.isParticipant(existing, input.playerId)) {
      return { ok: false, message: 'Вы не участник этого матча', status: 403 };
    }
    if (existing.status !== 'drafting' || !existing.guestId) {
      return { ok: false, message: 'Сейчас нельзя выбирать героев', status: 400 };
    }

    const picks = MatchesService.toDraftPicks(existing.picks);
    const turnPlayerId = resolveTurnPlayerId(picks, existing.hostId, existing.guestId);
    if (turnPlayerId !== input.playerId) {
      return { ok: false, message: 'Сейчас не ваш ход', status: 400 };
    }

    const hero = await prisma.heroClass.findUnique({
      where: { code: input.heroCode },
      select: { code: true, displayName: true, size: true, isPlayable: true },
    });
    if (!hero) {
      return { ok: false, message: 'Класс героя не найден', status: 400 };
    }

    const validation = validatePick({
      picks,
      playerId: input.playerId,
      hero,
      row: input.row,
    });
    if (!validation.ok) {
      return { ok: false, message: validation.message, status: 400 };
    }

    const nextOrder = existing.picks.length + 1;
    await prisma.matchPick.create({
      data: {
        matchId: existing.id,
        playerId: input.playerId,
        heroClassCode: hero.code,
        row: input.row,
        pickOrder: nextOrder,
      },
    });

    const afterPicks: DraftPick[] = [
      ...picks,
      {
        id: 'pending',
        playerId: input.playerId,
        heroClassCode: hero.code,
        displayName: hero.displayName,
        size: hero.size,
        row: input.row,
        pickOrder: nextOrder,
      },
    ];
    const drafted = isDraftComplete(afterPicks, existing.hostId, existing.guestId);
    if (drafted) {
      await prisma.match.update({
        where: { id: existing.id },
        data: { status: 'drafted' },
      });
    }

    const row = await prisma.match.findUniqueOrThrow({
      where: { id: existing.id },
      include: matchInclude,
    });
    return { ok: true, match: MatchesService.mapMatch(row) };
  }

  /**
   * Случайный валидный пик.
   */
  static async draftRandom(input: {
    readonly matchId: string;
    readonly playerId: string;
    readonly preferredRow?: number;
  }): Promise<
    | { ok: true; match: MatchesModel.match }
    | { ok: false; message: string; status: 400 | 403 | 404 }
  > {
    const existing = await prisma.match.findUnique({
      where: { id: input.matchId },
      include: matchInclude,
    });
    if (!existing) {
      return { ok: false, message: 'Матч не найден', status: 404 };
    }
    if (!MatchesService.isParticipant(existing, input.playerId)) {
      return { ok: false, message: 'Вы не участник этого матча', status: 403 };
    }
    if (existing.status !== 'drafting' || !existing.guestId) {
      return { ok: false, message: 'Сейчас нельзя выбирать героев', status: 400 };
    }

    const picks = MatchesService.toDraftPicks(existing.picks);
    const turnPlayerId = resolveTurnPlayerId(picks, existing.hostId, existing.guestId);
    if (turnPlayerId !== input.playerId) {
      return { ok: false, message: 'Сейчас не ваш ход', status: 400 };
    }

    const heroes = await prisma.heroClass.findMany({
      where: { isPlayable: true },
      select: { code: true, displayName: true, size: true, isPlayable: true },
    });
    const chosen = pickRandomValid({
      picks,
      playerId: input.playerId,
      heroes,
      preferredRow: input.preferredRow,
    });
    if (!chosen) {
      return { ok: false, message: 'Нет доступных героев для случайного выбора', status: 400 };
    }

    return MatchesService.draftPick({
      matchId: input.matchId,
      playerId: input.playerId,
      heroCode: chosen.hero.code,
      row: chosen.row,
    });
  }

  /**
   * Отменяет матч (только host) из waiting/drafting.
   */
  static async cancelMatch(input: {
    readonly matchId: string;
    readonly playerId: string;
  }): Promise<
    | { ok: true; match: MatchesModel.match }
    | { ok: false; message: string; status: 403 | 404 | 400 }
  > {
    const existing = await prisma.match.findUnique({
      where: { id: input.matchId },
      include: matchInclude,
    });
    if (!existing) {
      return { ok: false, message: 'Матч не найден', status: 404 };
    }
    if (existing.hostId !== input.playerId) {
      return { ok: false, message: 'Отменить матч может только хост', status: 403 };
    }
    if (existing.status === 'cancelled') {
      return { ok: true, match: MatchesService.mapMatch(existing) };
    }
    if (existing.status !== 'waiting' && existing.status !== 'drafting') {
      return { ok: false, message: 'Матч нельзя отменить в текущем статусе', status: 400 };
    }
    const row = await prisma.match.update({
      where: { id: existing.id },
      data: { status: 'cancelled' },
      include: matchInclude,
    });
    return { ok: true, match: MatchesService.mapMatch(row) };
  }
}
