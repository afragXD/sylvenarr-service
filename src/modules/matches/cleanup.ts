import { getBattleStore } from '../../game/combat';
import { prisma } from '../../shared/db';

const ABANDONED_STATUSES = [
  'waiting',
  'ready',
  'drafting',
  'drafted',
  'fighting',
  'cancelled',
] as const;

const TTL_MS = 24 * 60 * 60 * 1000;

export type CleanupUnusedMatchesResult = {
  readonly deletedCount: number;
  readonly deletedIds: readonly string[];
};

/**
 * Удаляет брошенные незавершённые матчи старше 24ч и чистит battle store.
 * `finished` не трогает.
 */
export async function cleanupUnusedMatches(
  now: Date = new Date()
): Promise<CleanupUnusedMatchesResult> {
  const cutoff = new Date(now.getTime() - TTL_MS);
  const stale = await prisma.match.findMany({
    where: {
      status: { in: [...ABANDONED_STATUSES] },
      updatedAt: { lt: cutoff },
    },
    select: { id: true },
  });

  if (stale.length === 0) {
    return { deletedCount: 0, deletedIds: [] };
  }

  const deletedIds = stale.map((row) => row.id);
  const store = getBattleStore();

  await prisma.match.deleteMany({
    where: { id: { in: deletedIds } },
  });

  await Promise.all(deletedIds.map((id) => store.delete(id)));

  return { deletedCount: deletedIds.length, deletedIds };
}
