/**
 * Два локальных игрока для съёмки сцен матча.
 * Usage: bun scripts/seed-shot-players.ts
 */
import { prisma } from '../src/shared/db';

const players = [
  {
    key: 'shot-host',
    displayName: 'ShotHost',
    email: 'shot-host@localhost.dev',
  },
  {
    key: 'shot-guest',
    displayName: 'ShotGuest',
    email: 'shot-guest@localhost.dev',
  },
] as const;

for (const item of players) {
  const existing = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerUserId: {
        provider: 'dev',
        providerUserId: item.key,
      },
    },
    select: { playerId: true },
  });

  if (existing) {
    console.log(`${item.key}\t${existing.playerId}`);
    continue;
  }

  const created = await prisma.player.create({
    data: {
      displayName: item.displayName,
      email: item.email,
      oauthAccounts: {
        create: {
          provider: 'dev',
          providerUserId: item.key,
          email: item.email,
          rawProfile: { purpose: 'scene-screenshots' },
        },
      },
    },
    select: { id: true },
  });
  console.log(`${item.key}\t${created.id}`);
}

await prisma.$disconnect();
