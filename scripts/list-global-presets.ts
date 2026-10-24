import { prisma } from '../src/shared/db';

const rows = await prisma.squadPreset.findMany({
  where: { playerId: null },
  include: {
    slots: {
      orderBy: { slotOrder: 'asc' },
      include: { heroClass: { select: { displayName: true } } },
    },
  },
});

console.log(
  JSON.stringify(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      catalogCode: row.catalogCode,
      teamSize: row.teamSize,
      slots: row.slots.map((slot) => slot.heroClass.displayName),
    })),
    null,
    2
  )
);

await prisma.$disconnect();
