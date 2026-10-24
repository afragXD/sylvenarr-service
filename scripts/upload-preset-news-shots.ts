/**
 * Заливает скрины пресетов на prod volume через cookie admin-сессии.
 * Usage: bun scripts/upload-preset-news-shots.ts
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { NEWS_SEED } from '../prisma/seed-data/news';
import { prisma } from '../src/shared/db';

const API = process.env.API_URL ?? 'https://api.wormgod.site';
/** WormgodRu admin — тот же аккаунт, с которым снимали скрины. */
const PLAYER_ID = '4177aad9-c6d8-44d8-a19c-1f490795849d';
const SCENES = join(import.meta.dir, '..', 'static', 'images', 'scenes');

const FILES = [
  'presets-create.png',
  'presets-view.png',
  'presets-pick.png',
] as const;

async function uploadExactName(fileName: (typeof FILES)[number]): Promise<string> {
  const bytes = await readFile(join(SCENES, fileName));
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/png' }), fileName);
  const res = await fetch(`${API}/admin/news/upload`, {
    method: 'POST',
    headers: { Cookie: `playerId=${PLAYER_ID}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`upload ${fileName}: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { url: string; fileName: string };
  console.log(`uploaded ${fileName} → ${data.url}`);
  return data.url;
}

async function main() {
  const urls: Record<string, string> = {};
  for (const name of FILES) {
    urls[name] = await uploadExactName(name);
  }

  const seed = NEWS_SEED.find((item) => item.slug === 'squad-presets-mixed-draft');
  if (!seed) {
    throw new Error('news seed missing');
  }

  let body = seed.body;
  for (const name of FILES) {
    body = body.replaceAll(`/static/images/scenes/${name}`, urls[name]!);
  }

  await prisma.news.update({
    where: { slug: 'squad-presets-mixed-draft' },
    data: {
      title: seed.title,
      summary: seed.summary,
      category: seed.category,
      coverUrl: urls['presets-pick.png'] ?? seed.coverUrl,
      body,
      publishedAt: null,
    },
  });

  console.log('news draft updated');
  await prisma.$disconnect();
}

await main();
