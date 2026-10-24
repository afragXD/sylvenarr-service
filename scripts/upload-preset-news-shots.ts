/**
 * Заливает скрины пресетов на prod volume и обновляет новость (publishedAt сохраняется).
 * Usage: bun scripts/upload-preset-news-shots.ts
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { NEWS_SEED } from '../prisma/seed-data/news';
import { prisma } from '../src/shared/db';

const API = process.env.API_URL ?? 'https://api.wormgod.site';
const PLAYER_ID = '4177aad9-c6d8-44d8-a19c-1f490795849d';
const SCENES = join(import.meta.dir, '..', 'static', 'images', 'scenes');
const TEMP = join(
  process.env.LOCALAPPDATA ?? '',
  'Temp',
  'cursor',
  'screenshots'
);

const FILES = [
  'presets-create.png',
  'presets-view.png',
  'presets-pick.png',
] as const;

async function uploadExactName(fileName: (typeof FILES)[number]): Promise<string> {
  const bytes = await Bun.file(join(SCENES, fileName)).arrayBuffer();
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
  await mkdir(SCENES, { recursive: true });
  for (const name of FILES) {
    await copyFile(join(TEMP, name), join(SCENES, name));
  }

  const urls: Record<string, string> = {};
  for (const name of FILES) {
    urls[name] = await uploadExactName(name);
  }

  const seed = NEWS_SEED.find((item) => item.slug === 'squad-presets-mixed-draft');
  if (!seed) {
    throw new Error('news seed missing');
  }

  const existing = await prisma.news.findUnique({
    where: { slug: 'squad-presets-mixed-draft' },
    select: { publishedAt: true },
  });

  let body = seed.body
    .replaceAll(/\/static\/images\/scenes\/[^)\s]*presets-create\.png/g, urls['presets-create.png']!)
    .replaceAll(/\/static\/images\/scenes\/[^)\s]*presets-view\.png/g, urls['presets-view.png']!)
    .replaceAll(/\/static\/images\/scenes\/[^)\s]*presets-pick\.png/g, urls['presets-pick.png']!);

  // Seed may still have canonical names
  for (const name of FILES) {
    body = body.replaceAll(`/static/images/scenes/${name}`, urls[name]!);
  }

  await prisma.news.update({
    where: { slug: 'squad-presets-mixed-draft' },
    data: {
      title: seed.title,
      summary: seed.summary,
      category: seed.category,
      coverUrl: urls['presets-pick.png']!,
      body,
      publishedAt: existing?.publishedAt ?? new Date(),
    },
  });

  console.log('news updated (publishedAt kept)');
  console.log(JSON.stringify(urls, null, 2));
  await prisma.$disconnect();
}

await main();
