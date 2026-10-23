import { prisma } from '../../shared/db';
import type { PlayersModel } from './model';

type PlayerRow = {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  role: PlayersModel.playerRole;
  createdAt: Date;
  passwordHash: string | null;
  oauthAccounts: ReadonlyArray<{ provider: string }>;
};

export abstract class PlayersService {
  /**
   * Преобразует запись БД в DTO игрока.
   */
  static mapPlayer(row: PlayerRow): PlayersModel.player {
    return {
      id: row.id,
      displayName: row.displayName,
      email: row.email,
      avatarUrl: row.avatarUrl,
      role: row.role,
      providers: row.oauthAccounts.map((account) => account.provider),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private static readonly playerSelect = {
    id: true,
    displayName: true,
    email: true,
    avatarUrl: true,
    role: true,
    createdAt: true,
    passwordHash: true,
    oauthAccounts: {
      select: { provider: true },
      orderBy: { provider: 'asc' as const },
    },
  };

  /**
   * Находит авторизованного игрока по id (OAuth и/или пароль).
   */
  static async findAuthenticatedById(id: string): Promise<PlayersModel.player | null> {
    const row = await prisma.player.findUnique({
      where: { id },
      select: PlayersService.playerSelect,
    });
    if (!row) {
      return null;
    }
    const hasOAuth = row.oauthAccounts.length > 0;
    const hasPassword = row.passwordHash != null && row.passwordHash.length > 0;
    if (!hasOAuth && !hasPassword) {
      return null;
    }
    return PlayersService.mapPlayer(row);
  }

  /**
   * Находит игрока по id без проверки OAuth (для внутренних связей матча).
   */
  static async findById(id: string): Promise<PlayersModel.player | null> {
    const row = await prisma.player.findUnique({
      where: { id },
      select: PlayersService.playerSelect,
    });
    if (!row) {
      return null;
    }
    return PlayersService.mapPlayer(row);
  }

  /**
   * Смена displayName текущего игрока.
   */
  static async updateDisplayName(
    playerId: string,
    rawName: string
  ): Promise<
    | { ok: true; player: PlayersModel.player }
    | { ok: false; status: 400 | 404 | 409; message: string }
  > {
    const displayName = rawName.trim();
    if (displayName.length < 2 || displayName.length > 32) {
      return { ok: false, status: 400, message: 'Имя: от 2 до 32 символов' };
    }
    const existing = await prisma.player.findUnique({
      where: { displayName },
      select: { id: true },
    });
    if (existing && existing.id !== playerId) {
      return { ok: false, status: 409, message: 'Такое имя уже занято' };
    }
    try {
      await prisma.player.update({
        where: { id: playerId },
        data: { displayName },
      });
    } catch {
      return { ok: false, status: 404, message: 'Игрок не найден' };
    }
    const player = await PlayersService.findAuthenticatedById(playerId);
    if (!player) {
      return { ok: false, status: 404, message: 'Игрок не найден' };
    }
    return { ok: true, player };
  }

  /**
   * Обновляет avatarUrl после загрузки файла на volume.
   */
  static async updateAvatarUrl(
    playerId: string,
    avatarUrl: string
  ): Promise<
    | { ok: true; player: PlayersModel.player }
    | { ok: false; status: 404; message: string }
  > {
    try {
      await prisma.player.update({
        where: { id: playerId },
        data: { avatarUrl },
      });
    } catch {
      return { ok: false, status: 404, message: 'Игрок не найден' };
    }
    const player = await PlayersService.findAuthenticatedById(playerId);
    if (!player) {
      return { ok: false, status: 404, message: 'Игрок не найден' };
    }
    return { ok: true, player };
  }
}
