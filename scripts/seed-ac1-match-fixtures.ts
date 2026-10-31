/**
 * Фикстуры AC-1: рейтинговый матч (с RatingEntry) и «приватный» (без RatingEntry).
 * Usage: bun scripts/seed-ac1-match-fixtures.ts
 * Печатает id матчей для QA. Пароли не выводит.
 */
import { prisma } from '../src/shared/db';

const HOST_NAME = 'Биба';
const GUEST_NAME = 'Боба';
/** Стабильные invite-коды для идемпотентного upsert. */
const RATED_CODE = 'AC1RTD';
const PRIVATE_CODE = 'AC1PRV';

const minimalSnapshot = (input: {
  readonly hostName: string;
  readonly guestName: string;
  readonly outcome: 'host_win' | 'guest_win' | 'draw';
  readonly logLine: string;
}) => ({
  stage: 3,
  outcome: input.outcome,
  host: { displayName: input.hostName, units: [] },
  guest: { displayName: input.guestName, units: [] },
  log: [input.logLine],
});

async function resolvePlayer(displayName: string): Promise<{ id: string; pts: number }> {
  const player = await prisma.player.findUnique({
    where: { displayName },
    select: { id: true, pts: true },
  });
  if (!player) {
    throw new Error(`Игрок «${displayName}» не найден. Создайте аккаунты Биба/Боба перед сидом.`);
  }
  return player;
}

async function upsertFinishedMatch(input: {
  readonly inviteCode: string;
  readonly hostId: string;
  readonly guestId: string;
  readonly winnerPlayerId: string;
  readonly hostName: string;
  readonly guestName: string;
  readonly outcome: 'host_win' | 'guest_win' | 'draw';
  readonly logLine: string;
}): Promise<string> {
  const fightingStartedAt = new Date(Date.now() - 12 * 60_000);
  const finishedAt = new Date(Date.now() - 60_000);
  const snapshot = minimalSnapshot({
    hostName: input.hostName,
    guestName: input.guestName,
    outcome: input.outcome,
    logLine: input.logLine,
  });
  const existing = await prisma.match.findUnique({
    where: { inviteCode: input.inviteCode },
    select: { id: true },
  });
  if (existing) {
    await prisma.match.update({
      where: { id: existing.id },
      data: {
        status: 'finished',
        hostId: input.hostId,
        guestId: input.guestId,
        winnerPlayerId: input.winnerPlayerId,
        fightingStartedAt,
        finishedAt,
        resultSnapshot: snapshot,
      },
    });
    return existing.id;
  }
  const created = await prisma.match.create({
    data: {
      inviteCode: input.inviteCode,
      status: 'finished',
      hostId: input.hostId,
      guestId: input.guestId,
      winnerPlayerId: input.winnerPlayerId,
      fightingStartedAt,
      finishedAt,
      resultSnapshot: snapshot,
    },
    select: { id: true },
  });
  return created.id;
}

const host = await resolvePlayer(HOST_NAME);
const guest = await resolvePlayer(GUEST_NAME);

const ratedId = await upsertFinishedMatch({
  inviteCode: RATED_CODE,
  hostId: host.id,
  guestId: guest.id,
  winnerPlayerId: host.id,
  hostName: HOST_NAME,
  guestName: GUEST_NAME,
  outcome: 'host_win',
  logLine: `${GUEST_NAME} сдался.`,
});

await prisma.ratingEntry.deleteMany({ where: { matchId: ratedId } });
const hostPtsBefore = host.pts;
const guestPtsBefore = guest.pts;
await prisma.ratingEntry.createMany({
  data: [
    {
      playerId: host.id,
      matchId: ratedId,
      result: 'win',
      ptsBefore: hostPtsBefore,
      ptsDelta: 12,
      ptsAfter: hostPtsBefore + 12,
    },
    {
      playerId: guest.id,
      matchId: ratedId,
      result: 'loss',
      ptsBefore: guestPtsBefore,
      ptsDelta: -12,
      ptsAfter: guestPtsBefore - 12,
    },
  ],
});

const privateId = await upsertFinishedMatch({
  inviteCode: PRIVATE_CODE,
  hostId: host.id,
  guestId: guest.id,
  winnerPlayerId: guest.id,
  hostName: HOST_NAME,
  guestName: GUEST_NAME,
  outcome: 'guest_win',
  logLine: `${HOST_NAME} сдался.`,
});
await prisma.ratingEntry.deleteMany({ where: { matchId: privateId } });

console.log('AC-1 fixtures ready');
console.log(`rated\t${ratedId}\thost=${HOST_NAME} win\tguest=${GUEST_NAME} loss\texpect ПТС`);
console.log(
  `private\t${privateId}\thost=${HOST_NAME} loss\tguest=${GUEST_NAME} win\texpect «матч без рейтинга»`
);
console.log(`lobby rated:\t/lobby/${ratedId}`);
console.log(`lobby private:\t/lobby/${privateId}`);
console.log(`history rated:\t/matches/${ratedId}`);
console.log(`history private:\t/matches/${privateId}`);

await prisma.$disconnect();
