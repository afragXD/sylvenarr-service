/**
 * Заливает обложки новостей на volume через admin upload и патчит coverUrl.
 * Нужна сессия admin в cookie jar (передайте COOKIE) либо роль admin у текущего пользователя.
 *
 * Usage:
 *   COOKIE="session=..." bun scripts/push-news-covers.ts
 *   или без COOKIE — пишет файлы в STATIC_ROOT (локально / volume, если смонтирован).
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { NEWS_SEED } from '../prisma/seed-data/news';
import { prisma } from '../src/shared/db';
import { config } from '../src/config';

const ROOT = join(import.meta.dir, '..', '..', 'angie', 'static', 'images', 'scenes');

const FILES: ReadonlyArray<{ local: string; publicName: string; slugs: string[] }> = [
  {
    local: join(ROOT, 'morale-wards.jpg'),
    publicName: 'morale-wards.jpg',
    slugs: ['morale-wards-summons-fixes'],
  },
  {
    local: join(ROOT, 'profile-avatar.jpg'),
    publicName: 'profile-avatar.jpg',
    slugs: ['profile-avatar-display-name'],
  },
  {
    local: join(ROOT, 'rating-avatars.png'),
    publicName: 'rating-avatars.png',
    slugs: ['profile-avatar-display-name'],
  },
];

async function writeToStaticVolume(localPath: string, publicName: string): Promise<string> {
  const dir = join(config.STATIC_ROOT, 'images', 'scenes');
  await mkdir(dir, { recursive: true });
  const dest = join(dir, publicName);
  await copyFile(localPath, dest);
  return `/static/images/scenes/${publicName}`;
}

async function main() {
  for (const item of FILES) {
    const url = await writeToStaticVolume(item.local, item.publicName);
    console.log(`wrote ${item.publicName} → ${url} (STATIC_ROOT=${config.STATIC_ROOT})`);
  }

  for (const seed of NEWS_SEED) {
    if (!['morale-wards-summons-fixes', 'profile-avatar-display-name'].includes(seed.slug)) {
      continue;
    }
    await prisma.news.update({
      where: { slug: seed.slug },
      data: {
        coverUrl: seed.coverUrl,
        body: seed.body,
        title: seed.title,
        summary: seed.summary,
        publishedAt: seed.publishedAt ? new Date(seed.publishedAt) : null,
      },
    });
    console.log(`patched news ${seed.slug} cover=${seed.coverUrl}`);
  }

  await prisma.$disconnect();
}

await main();
