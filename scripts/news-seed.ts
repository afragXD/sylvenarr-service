/**
 * Идемпотентный upsert новостей из prisma/seed-data/news.ts.
 * Usage: bun scripts/news-seed.ts
 */
import { NEWS_SEED } from '../prisma/seed-data/news';
import { prisma } from '../src/shared/db';

for (const item of NEWS_SEED) {
  const publishedAt = item.publishedAt ? new Date(item.publishedAt) : null;
  await prisma.news.upsert({
    where: { slug: item.slug },
    create: {
      slug: item.slug,
      title: item.title,
      summary: item.summary,
      body: item.body,
      category: item.category,
      coverUrl: item.coverUrl,
      publishedAt,
    },
    update: {
      title: item.title,
      summary: item.summary,
      body: item.body,
      category: item.category,
      coverUrl: item.coverUrl,
      publishedAt,
    },
  });
  console.log(`upsert ${item.slug}${publishedAt ? '' : ' (draft)'}`);
}

console.log(`OK: ${NEWS_SEED.length} news items`);
await prisma.$disconnect();
