import { prisma } from '../../shared/db';
import type { RatingModel } from './model';

export abstract class RatingService {
  /**
   * Таблица рейтинга игроков по ПТС (StickyFingaz / Heroes III).
   */
  static async listRating(): Promise<RatingModel.listResponse> {
    const players = await prisma.player.findMany({
      where: { ratingEntries: { some: {} } },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        pts: true,
        ratingEntries: { select: { result: true } },
      },
    });

    const items: RatingModel.ratingRow[] = players
      .map((player) => {
        let wins = 0;
        let losses = 0;
        let draws = 0;
        for (const entry of player.ratingEntries) {
          if (entry.result === 'win') {
            wins += 1;
          } else if (entry.result === 'loss') {
            losses += 1;
          } else {
            draws += 1;
          }
        }
        return {
          playerId: player.id,
          displayName: player.displayName,
          avatarUrl: player.avatarUrl,
          pts: player.pts,
          wins,
          losses,
          draws,
          games: wins + losses + draws,
        };
      })
      .sort(
        (left, right) =>
          right.pts - left.pts ||
          right.wins - left.wins ||
          left.displayName.localeCompare(right.displayName, 'ru')
      );

    return { items };
  }
}
