import { prisma } from '../src/shared/db';

const id = 'e8c14d30-3775-4013-a441-1f928b00be33';

const m = await prisma.match.findUnique({
  where: { id },
  include: { picks: true },
});
if (!m) {
  console.log('no match');
  await prisma.$disconnect();
  process.exit(1);
}

console.log('status', m.status, 'winner', m.winnerPlayerId);
console.log(
  'picks',
  m.picks.map((p) => ({
    playerId: p.playerId.slice(0, 8),
    code: p.heroClassCode,
    row: p.row,
  }))
);

const snap = m.resultSnapshot as {
  log?: string[];
  units?: Array<Record<string, unknown>>;
  summary?: unknown;
} | null;

if (!snap) {
  console.log('no resultSnapshot — match may still be in memory');
  await prisma.$disconnect();
  process.exit(0);
}

const log = snap.log ?? [];
const ecto = log.filter((l) =>
  /эктоплазм|шлеп|слиз|вард|вод|WATER|промах/i.test(l)
);
console.log('--- ecto-related log ---');
console.log(ecto.join('\n'));

const units = (snap.units ?? []).filter(
  (u) =>
    String(u.heroClassCode) === 'Ectoplasm' ||
    /эктоплазм/i.test(String(u.displayName ?? ''))
);
console.log(
  '--- ecto units ---',
  JSON.stringify(
    units.map((u) => ({
      id: u.id,
      name: u.displayName,
      alive: u.alive,
      power: u.power,
      damage: u.damage,
      attackStyle: u.attackStyle,
      lvl: u.lvl,
      accuracy: u.accuracy,
      health: u.health,
      maxHp: u.maxHp,
    })),
    null,
    2
  )
);

// All slap lines with context
console.log('--- all slap / miss lines with neighbors ---');
for (let i = 0; i < log.length; i++) {
  if (/шлеп|слиз/i.test(log[i]!)) {
    console.log(log.slice(Math.max(0, i - 2), i + 3).join('\n'));
    console.log('---');
  }
}

await prisma.$disconnect();
