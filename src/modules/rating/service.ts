import { prisma } from '../../shared/db';
import type { RatingModel } from './model';

export abstract class RatingService {
  /**
   * Агрегированный рейтинг игроков (wins / games / winrate).
   */
  static async listRating(): Promise<RatingModel.listResponse> {
    const grouped = await prisma.ratingEntry.groupBy({
      by: ['playerId'],
      _count: { _all: true },
    });
    if (grouped.length === 0) {
      return { items: [] };
    }
    const winsByPlayer = await prisma.ratingEntry.groupBy({
      by: ['playerId'],
      where: { result: 'win' },
      _count: { _all: true },
    });
    const winsMap = new Map(winsByPlayer.map((row) => [row.playerId, row._count._all]));
    const players = await prisma.player.findMany({
      where: { id: { in: grouped.map((row) => row.playerId) } },
      select: { id: true, displayName: true },
    });
    const nameMap = new Map(players.map((player) => [player.id, player.displayName]));
    const items: RatingModel.ratingRow[] = grouped
      .map((row) => {
        const games = row._count._all;
        const wins = winsMap.get(row.playerId) ?? 0;
        const winrate = games === 0 ? 0 : Math.round((wins / games) * 10000) / 100;
        return {
          playerId: row.playerId,
          displayName: nameMap.get(row.playerId) ?? 'Неизвестный',
          wins,
          games,
          winrate,
        };
      })
      .sort((left, right) => right.winrate - left.winrate || right.wins - left.wins);
    return { items };
  }
}
