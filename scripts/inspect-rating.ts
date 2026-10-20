import { prisma } from '../src/shared/db';

const rows = await prisma.player.findMany({
  where: { ratingEntries: { some: {} } },
  select: {
    displayName: true,
    pts: true,
    ratingEntries: { select: { result: true, ptsDelta: true, matchId: true } },
  },
  orderBy: { pts: 'desc' },
});

for (const player of rows) {
  const wins = player.ratingEntries.filter((e) => e.result === 'win').length;
  const losses = player.ratingEntries.filter((e) => e.result === 'loss').length;
  const draws = player.ratingEntries.filter((e) => e.result === 'draw').length;
  const withDelta = player.ratingEntries.filter((e) => e.ptsDelta !== null).length;
  console.log(
    `${player.displayName}: ${player.pts} ПТС | W${wins} L${losses} D${draws} | entries with delta ${withDelta}/${player.ratingEntries.length}`
  );
}

await prisma.$disconnect();
