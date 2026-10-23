import { prisma } from '../src/shared/db';

const p = await prisma.player.findFirst({
  where: {
    OR: [{ displayName: 'AlexF' }, { email: { contains: 'Aleksjoestar' } }],
  },
  select: { id: true, displayName: true, role: true, email: true },
});
console.log(JSON.stringify(p, null, 2));
await prisma.$disconnect();
