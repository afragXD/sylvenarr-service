/**
 * Заливает локальные обложки на prod volume через POST /admin/news/upload
 * и обновляет coverUrl/body новостей.
 *
 * Usage: bun scripts/upload-scene-covers.ts
 */
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { NEWS_SEED } from '../prisma/seed-data/news';
import { prisma } from '../src/shared/db';

const API = process.env.API_URL ?? 'https://api.wormgod.site';
const PLAYER_ID = '4b715234-118e-4596-874b-1842937233ed';
const SCENES = join(import.meta.dir, '..', '..', 'angie', 'static', 'images', 'scenes');

async function uploadExactName(localPath: string, fileName: string): Promise<string> {
  const bytes = await readFile(localPath);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: fileName.endsWith('.png') ? 'image/png' : 'image/jpeg' }), fileName);
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
  const moraleUrl = await uploadExactName(join(SCENES, 'morale-wards.jpg'), 'morale-wards.jpg');
  const profileUrl = await uploadExactName(join(SCENES, 'profile-avatar.jpg'), 'profile-avatar.jpg');
  const ratingUrl = await uploadExactName(join(SCENES, 'rating-avatars.png'), 'rating-avatars.png');

  // Upload даёт stamp-имя; кладём канонические пути в посты и
  // дополнительно копируем… но volume только через upload.
  // Обновляем новости на фактические URL с volume.
  const moraleSeed = NEWS_SEED.find((n) => n.slug === 'morale-wards-summons-fixes');
  const profileSeed = NEWS_SEED.find((n) => n.slug === 'profile-avatar-display-name');
  if (!moraleSeed || !profileSeed) {
    throw new Error('seed entries missing');
  }

  const moraleBody = moraleSeed.body
    .replaceAll('/static/images/scenes/morale-wards.jpg', moraleUrl)
    .replaceAll('/static/images/scenes/battle.webp', '/static/images/scenes/battle.webp');
  const profileBody = profileSeed.body
    .replaceAll('/static/images/scenes/profile-avatar.jpg', profileUrl)
    .replaceAll('/static/images/scenes/rating-avatars.png', ratingUrl);

  await prisma.news.update({
    where: { slug: 'morale-wards-summons-fixes' },
    data: { coverUrl: moraleUrl, body: moraleBody },
  });
  await prisma.news.update({
    where: { slug: 'profile-avatar-display-name' },
    data: { coverUrl: profileUrl, body: profileBody },
  });

  // Синхронизируем seed-файл путими не трогаем — в проде URL со stamp.
  console.log('morale cover', moraleUrl);
  console.log('profile cover', profileUrl);
  console.log('rating body', ratingUrl);
  await prisma.$disconnect();
}

await main();
