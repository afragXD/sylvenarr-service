import { prisma } from '../../shared/db';
import { createInviteCode } from '../../utils/create-invite-code';
import type { MatchesModel } from './model';

type MatchWithPlayers = {
  id: string;
  status: MatchesModel.matchStatus;
  inviteCode: string;
  createdAt: Date;
  host: { id: string; displayName: string };
  guest: { id: string; displayName: string } | null;
};

export abstract class MatchesService {
  /**
   * Преобразует матч из БД в DTO.
   */
  static mapMatch(row: MatchWithPlayers): MatchesModel.match {
    return {
      id: row.id,
      status: row.status,
      inviteCode: row.inviteCode,
      host: row.host,
      guest: row.guest,
      createdAt: row.createdAt.toISOString(),
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
      include: {
        host: { select: { id: true, displayName: true } },
        guest: { select: { id: true, displayName: true } },
      },
    });
    return MatchesService.mapMatch(row);
  }

  /**
   * Присоединяет гостя к лобби по коду.
   */
  static async joinMatch(input: {
    readonly inviteCode: string;
    readonly guestId: string;
  }): Promise<{ ok: true; match: MatchesModel.match } | { ok: false; message: string }> {
    const normalizedCode = input.inviteCode.trim().toUpperCase();
    const existing = await prisma.match.findUnique({
      where: { inviteCode: normalizedCode },
      include: {
        host: { select: { id: true, displayName: true } },
        guest: { select: { id: true, displayName: true } },
      },
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
    const row = await prisma.match.update({
      where: { id: existing.id },
      data: {
        guestId: input.guestId,
        status: 'ready',
      },
      include: {
        host: { select: { id: true, displayName: true } },
        guest: { select: { id: true, displayName: true } },
      },
    });
    return { ok: true, match: MatchesService.mapMatch(row) };
  }

  /**
   * Возвращает матч по id.
   */
  static async findById(id: string): Promise<MatchesModel.match | null> {
    const row = await prisma.match.findUnique({
      where: { id },
      include: {
        host: { select: { id: true, displayName: true } },
        guest: { select: { id: true, displayName: true } },
      },
    });
    if (!row) {
      return null;
    }
    return MatchesService.mapMatch(row);
  }

  /**
   * Отменяет матч (только host).
   */
  static async cancelMatch(input: {
    readonly matchId: string;
    readonly playerId: string;
  }): Promise<
    { ok: true; match: MatchesModel.match } | { ok: false; message: string; status: 403 | 404 }
  > {
    const existing = await prisma.match.findUnique({
      where: { id: input.matchId },
      include: {
        host: { select: { id: true, displayName: true } },
        guest: { select: { id: true, displayName: true } },
      },
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
    const row = await prisma.match.update({
      where: { id: existing.id },
      data: { status: 'cancelled' },
      include: {
        host: { select: { id: true, displayName: true } },
        guest: { select: { id: true, displayName: true } },
      },
    });
    return { ok: true, match: MatchesService.mapMatch(row) };
  }
}
