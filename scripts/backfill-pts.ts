/**
 * Пересчёт ПТС по истории finished-матчей (StickyFingaz / Heroes III).
 * Старые RatingEntry без matchId/дельт заменяются записями с полным аудитом.
 *
 * Запуск: bun run scripts/backfill-pts.ts
 */
import { prisma } from '../src/shared/db';
import { START_PTS, computePtsChange, type PtsOutcome } from '../src/modules/rating/pts';

const matches = await prisma.match.findMany({
  where: {
    status: 'finished',
    guestId: { not: null },
  },
  select: {
    id: true,
    hostId: true,
    guestId: true,
    winnerPlayerId: true,
    finishedAt: true,
  },
  orderBy: [{ finishedAt: 'asc' }, { createdAt: 'asc' }],
});

const players = await prisma.player.findMany({
  select: { id: true, displayName: true },
});
const ptsByPlayer = new Map(players.map((p) => [p.id, START_PTS]));
const nameById = new Map(players.map((p) => [p.id, p.displayName]));

type EntryRow = {
  playerId: string;
  result: 'win' | 'loss' | 'draw';
  matchId: string;
  ptsBefore: number;
  ptsDelta: number;
  ptsAfter: number;
};

const entries: EntryRow[] = [];
let applied = 0;

for (const match of matches) {
  const guestId = match.guestId;
  if (!guestId) {
    continue;
  }
  if (!ptsByPlayer.has(match.hostId) || !ptsByPlayer.has(guestId)) {
    console.warn(`skip match ${match.id}: missing player`);
    continue;
  }

  const ptsA = ptsByPlayer.get(match.hostId) ?? START_PTS;
  const ptsB = ptsByPlayer.get(guestId) ?? START_PTS;
  const outcome: PtsOutcome =
    match.winnerPlayerId === null
      ? 'draw'
      : match.winnerPlayerId === match.hostId
        ? 'a_win'
        : 'b_win';
  const change = computePtsChange({ ptsA, ptsB, outcome });

  const hostResult =
    outcome === 'draw' ? 'draw' : outcome === 'a_win' ? 'win' : 'loss';
  const guestResult =
    outcome === 'draw' ? 'draw' : outcome === 'b_win' ? 'win' : 'loss';

  entries.push(
    {
      playerId: match.hostId,
      result: hostResult,
      matchId: match.id,
      ptsBefore: ptsA,
      ptsDelta: change.deltaA,
      ptsAfter: change.ptsAfterA,
    },
    {
      playerId: guestId,
      result: guestResult,
      matchId: match.id,
      ptsBefore: ptsB,
      ptsDelta: change.deltaB,
      ptsAfter: change.ptsAfterB,
    }
  );

  ptsByPlayer.set(match.hostId, change.ptsAfterA);
  ptsByPlayer.set(guestId, change.ptsAfterB);
  applied += 1;
}

await prisma.$transaction(async (tx) => {
  await tx.ratingEntry.deleteMany({});
  await tx.player.updateMany({ data: { pts: START_PTS } });

  if (entries.length > 0) {
    await tx.ratingEntry.createMany({ data: entries });
  }

  for (const [playerId, pts] of ptsByPlayer) {
    await tx.player.update({
      where: { id: playerId },
      data: { pts },
    });
  }
});

const sorted = [...ptsByPlayer.entries()].sort((a, b) => b[1] - a[1]);
console.log(`Applied ${applied} matches, wrote ${entries.length} rating entries.`);
console.log('PTS:');
for (const [id, pts] of sorted) {
  console.log(`  ${nameById.get(id) ?? id}: ${pts}`);
}

await prisma.$disconnect();
