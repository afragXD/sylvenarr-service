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
}
