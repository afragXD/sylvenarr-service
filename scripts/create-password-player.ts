/**
 * Создаёт игрока только с паролем (без OAuth).
 * Usage: bun scripts/create-password-player.ts <displayName> <email> <password> [role]
 */
import { prisma } from '../src/shared/db';

const [displayName, email, password, roleArg] = process.argv.slice(2).map((v) => v?.trim());
const role = roleArg === 'admin' ? 'admin' : 'player';

if (!displayName || !email || !password) {
  console.error(
    'Usage: bun scripts/create-password-player.ts <displayName> <email> <password> [role]'
  );
  process.exit(1);
}

const existing = await prisma.player.findFirst({
  where: {
    OR: [
      { displayName },
      { email: { equals: email, mode: 'insensitive' } },
    ],
  },
  select: { id: true, displayName: true, email: true },
});

if (existing) {
  console.error(
    `Уже есть игрок: ${existing.displayName} (${existing.email ?? '—'}) id=${existing.id}`
  );
  process.exit(1);
}

const passwordHash = await Bun.password.hash(password, { algorithm: 'argon2id' });

const created = await prisma.player.create({
  data: {
    displayName,
    email,
    passwordHash,
    role,
  },
  select: { id: true, displayName: true, email: true, role: true },
});

console.log(
  `OK: created ${created.displayName} (${created.email}) id=${created.id} role=${created.role}`
);
await prisma.$disconnect();
