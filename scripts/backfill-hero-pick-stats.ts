/**
 * Приближённый бэкап HeroPickStat из resultSnapshot finished-матчей.
 * Считаются юниты с UUID-pickId (не summon/phantom) и playable-классами.
 *
 * Запуск: bun run scripts/backfill-hero-pick-stats.ts
 */
import { prisma } from '../src/shared/db';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UnitSnap = {
  pickId?: unknown;
  heroClassCode?: unknown;
};

type TeamSnap = {
  playerId?: unknown;
  units?: unknown;
};

type Snapshot = {
  host?: TeamSnap;
  guest?: TeamSnap;
};

function isUnitSnap(value: unknown): value is UnitSnap {
  return typeof value === 'object' && value !== null;
}

function collectPicks(
  team: TeamSnap | undefined,
  playable: ReadonlySet<string>,
  tally: Map<string, number>
): void {
  if (!team || typeof team.playerId !== 'string' || !Array.isArray(team.units)) {
    return;
  }
  const playerId = team.playerId;
  for (const raw of team.units) {
    if (!isUnitSnap(raw)) {
      continue;
    }
    if (typeof raw.pickId !== 'string' || !UUID_RE.test(raw.pickId)) {
      continue;
    }
    if (typeof raw.heroClassCode !== 'string' || !playable.has(raw.heroClassCode)) {
      continue;
    }
    const key = `${playerId}\0${raw.heroClassCode}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
}

const playableHeroes = await prisma.heroClass.findMany({
  where: { isPlayable: true },
  select: { code: true },
});
const playable = new Set(playableHeroes.map((hero) => hero.code));

const matches = await prisma.match.findMany({
  where: {
    status: 'finished',
    resultSnapshot: { not: null },
  },
  select: { id: true, resultSnapshot: true },
});

const tally = new Map<string, number>();
for (const match of matches) {
  const snap = match.resultSnapshot as Snapshot | null;
  if (!snap) {
    continue;
  }
  collectPicks(snap.host, playable, tally);
  collectPicks(snap.guest, playable, tally);
}

await prisma.heroPickStat.deleteMany({});

let written = 0;
for (const [key, pickCount] of tally) {
  const [playerId, heroClassCode] = key.split('\0');
  if (!playerId || !heroClassCode) {
    continue;
  }
  await prisma.heroPickStat.create({
    data: { playerId, heroClassCode, pickCount },
  });
  written += 1;
}

console.log(`matches=${matches.length} rows=${written}`);
await prisma.$disconnect();
