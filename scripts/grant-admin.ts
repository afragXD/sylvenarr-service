/**
 * Выдаёт роль admin игроку по email (из OAuthAccount или Player.email).
 * Usage: bun scripts/grant-admin.ts user@example.com
 */
import { prisma } from '../src/shared/db';

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error('Usage: bun scripts/grant-admin.ts <email>');
  process.exit(1);
}

const viaOAuth = await prisma.oAuthAccount.findFirst({
  where: { email: { equals: email, mode: 'insensitive' } },
  select: { playerId: true, player: { select: { id: true, displayName: true, email: true, role: true } } },
});

const viaPlayer =
  viaOAuth?.player ??
  (await prisma.player.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, displayName: true, email: true, role: true },
  }));

if (!viaPlayer) {
  console.error(`Игрок с email «${email}» не найден`);
  process.exit(1);
}

const updated = await prisma.player.update({
  where: { id: viaPlayer.id },
  data: { role: 'admin' },
  select: { id: true, displayName: true, email: true, role: true },
});

console.log(`OK: ${updated.displayName} (${updated.email ?? email}) → role=${updated.role}`);
await prisma.$disconnect();
