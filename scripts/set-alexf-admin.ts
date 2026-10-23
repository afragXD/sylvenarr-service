import { prisma } from '../src/shared/db';

const role = (process.argv[2] as 'admin' | 'player') || 'admin';
await prisma.player.update({
  where: { id: '4b715234-118e-4596-874b-1842937233ed' },
  data: { role },
});
console.log(`AlexF role → ${role}`);
await prisma.$disconnect();
