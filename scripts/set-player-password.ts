/**
 * Выставляет email, displayName и passwordHash (argon2id) существующему игроку.
 * Usage: bun scripts/set-player-password.ts <playerId|currentEmail> <email> <displayName> <password>
 */
import { prisma } from '../src/shared/db';

const [lookup, email, displayName, password] = process.argv.slice(2).map((v) => v?.trim());

if (!lookup || !email || !displayName || !password) {
  console.error(
    'Usage: bun scripts/set-player-password.ts <playerId|currentEmail> <email> <displayName> <password>'
  );
  process.exit(1);
}

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const byId = uuidRe.test(lookup)
  ? await prisma.player.findUnique({
      where: { id: lookup },
      select: { id: true, displayName: true, email: true },
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
    select: { id: true, displayName: true, email: true },
  }));

if (!player) {
  console.error(`Игрок «${lookup}» не найден`);
  process.exit(1);
}

const passwordHash = await Bun.password.hash(password, { algorithm: 'argon2id' });

const updated = await prisma.player.update({
  where: { id: player.id },
  data: {
    email,
    displayName,
    passwordHash,
  },
  select: { id: true, displayName: true, email: true, role: true },
});

console.log(
  `OK: ${updated.displayName} (${updated.email}) id=${updated.id} role=${updated.role} — пароль установлен (argon2id)`
);
await prisma.$disconnect();
