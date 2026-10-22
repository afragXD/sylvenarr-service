import { cleanupUnusedMatches } from './cleanup';

const MSK = 'Europe/Moscow';
const DAY_MS = 24 * 60 * 60 * 1000;

let scheduledTimer: ReturnType<typeof setTimeout> | null = null;
let intervalTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Миллисекунды до ближайшей полуночи Europe/Moscow.
 */
export function msUntilNextMoscowMidnight(now: Date = new Date()): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: MSK,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;

  const hours = Number(parts.hour);
  const minutes = Number(parts.minute);
  const seconds = Number(parts.second);
  const msSinceMidnight =
    ((hours * 60 + minutes) * 60 + seconds) * 1000 + now.getMilliseconds();
  const remaining = DAY_MS - msSinceMidnight;
  return remaining <= 0 ? DAY_MS : remaining;
}

async function runCleanupJob(): Promise<void> {
  try {
    const result = await cleanupUnusedMatches();
    console.log(
      `[matches-cleanup] deleted ${result.deletedCount} abandoned match(es)`
    );
  } catch (error) {
    console.error('[matches-cleanup] failed', error);
  }
}

/**
 * Планирует cleanup на 00:00 Europe/Moscow, далее раз в сутки.
 * Не запускает джобу при старте сервера.
 */
export function startAbandonedMatchesCleanupSchedule(): void {
  if (scheduledTimer || intervalTimer) {
    return;
  }

  const delay = msUntilNextMoscowMidnight();
  console.log(
    `[matches-cleanup] next run in ${Math.round(delay / 1000)}s (00:00 ${MSK})`
  );

  scheduledTimer = setTimeout(() => {
    scheduledTimer = null;
    void runCleanupJob();
    intervalTimer = setInterval(() => {
      void runCleanupJob();
    }, DAY_MS);
  }, delay);
}

/** Для тестов / graceful shutdown. */
export function stopAbandonedMatchesCleanupSchedule(): void {
  if (scheduledTimer) {
    clearTimeout(scheduledTimer);
    scheduledTimer = null;
  }
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
}
