import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/shared/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const [players, matches, picks, oauth, news, ratings] = await Promise.all([
  prisma.player.count(),
  prisma.match.count(),
  prisma.matchPick.count(),
  prisma.oAuthAccount.count(),
  prisma.news.count(),
  prisma.ratingEntry.count(),
]);

const sample = await prisma.player.findFirst({ select: { id: true } });
const looksUuid = !!sample?.id?.match(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
);

console.log({
  players,
  matches,
  picks,
  oauth,
  news,
  ratings,
  sampleId: sample?.id,
  looksUuid,
});

await prisma.$disconnect();

if (sample && !looksUuid) {
  process.exit(1);
}
