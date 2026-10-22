/**
 * Снимает passwordHash у игрока (OAuth-вход остаётся).
 * Usage: bun scripts/clear-player-password.ts <playerId|email|displayName>
 */
import { prisma } from '../src/shared/db';

const lookup = process.argv[2]?.trim();
if (!lookup) {
  console.error('Usage: bun scripts/clear-player-password.ts <playerId|email|displayName>');
  process.exit(1);
}

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const byId = uuidRe.test(lookup)
  ? await prisma.player.findUnique({
      where: { id: lookup },
      select: { id: true },
    })
  : null;

const player =
  byId ??
  (await prisma.player.findFirst({
    where: {
      OR: [
        { email: { equals: lookup, mode: 'insensitive' } },
        { displayName: lookup },
      ],
    },
    select: { id: true },
  }));

if (!player) {
  console.error(`Игрок «${lookup}» не найден`);
  process.exit(1);
}

const updated = await prisma.player.update({
  where: { id: player.id },
  data: { passwordHash: null },
  select: { id: true, displayName: true, email: true, role: true, passwordHash: true },
});

console.log(
  `OK: ${updated.displayName} (${updated.email ?? '—'}) — passwordHash снят, role=${updated.role}`
);
await prisma.$disconnect();
