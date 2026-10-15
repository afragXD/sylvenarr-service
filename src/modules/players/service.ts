import { prisma } from '../../shared/db';
import type { PlayersModel } from './model';

type PlayerRow = {
  id: string;
  displayName: string;
  createdAt: Date;
};

export abstract class PlayersService {
  /**
   * Преобразует запись БД в DTO игрока.
   */
  static mapPlayer(row: PlayerRow): PlayersModel.player {
    return {
      id: row.id,
      displayName: row.displayName,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Находит игрока по id.
   */
  static async findById(id: string): Promise<PlayersModel.player | null> {
    const row = await prisma.player.findUnique({
      where: { id },
      select: { id: true, displayName: true, createdAt: true },
    });
    if (!row) {
      return null;
    }
    return PlayersService.mapPlayer(row);
  }

  /**
   * Создаёт гостевого игрока.
   */
  static async createGuest(displayName?: string): Promise<PlayersModel.player> {
    const name = displayName?.trim() || `Гость-${crypto.randomUUID().slice(0, 6)}`;
    const row = await prisma.player.create({
      data: { displayName: name },
      select: { id: true, displayName: true, createdAt: true },
    });
    return PlayersService.mapPlayer(row);
  }
}
