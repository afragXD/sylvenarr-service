/**
 * Публикует новость: publishedAt = now.
 * Usage: bun scripts/publish-news.ts <slug>
 */
import { prisma } from '../src/shared/db';

const slug = process.argv[2]?.trim();
if (!slug) {
  console.error('Usage: bun scripts/publish-news.ts <slug>');
  process.exit(1);
}

const now = new Date();
const row = await prisma.news.update({
  where: { slug },
  data: { publishedAt: now },
  select: { slug: true, title: true, publishedAt: true },
});

console.log(`published ${row.slug}: ${row.title} @ ${row.publishedAt?.toISOString()}`);
await prisma.$disconnect();
