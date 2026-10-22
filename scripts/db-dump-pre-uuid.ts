/**
 * Полный pg_dump перед миграцией cuid → UUID.
 * Usage: bun scripts/db-dump-pre-uuid.ts [output.dump]
 *
 * Требует `pg_dump` / `pg_restore` в PATH и DATABASE_URL в окружении (.env).
 * Дамп — страховка на откат; сама миграция не должна терять строки.
 *
 * Порядок: (1) этот скрипт → (2) prisma migrate deploy → (3) сверка COUNT(*) .
 * Откат: pg_restore --clean --if-exists --dbname="$DATABASE_URL" <dump>
 */
import 'dotenv/config';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

function resolvePgBin(name: 'pg_dump' | 'pg_restore'): string {
  const fromEnv = process.env.PG_BIN_DIR;
  if (fromEnv) {
    const candidate = join(fromEnv, process.platform === 'win32' ? `${name}.exe` : name);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const which = Bun.spawnSync([process.platform === 'win32' ? 'where' : 'which', name], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (which.exitCode === 0) {
    const first = which.stdout.toString().split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (first && existsSync(first)) {
      return first;
    }
  }

  if (process.platform === 'win32') {
    const root = 'C:\\Program Files\\PostgreSQL';
    if (existsSync(root)) {
      const versions = readdirSync(root)
        .filter((entry) => /^\d+/.test(entry))
        .sort((a, b) => Number(b) - Number(a));
      for (const version of versions) {
        const candidate = join(root, version, 'bin', `${name}.exe`);
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    }
  }

  throw new Error(
    `${name} not found. Install PostgreSQL client tools or set PG_BIN_DIR to the bin folder.`
  );
}

const pgDump = resolvePgBin('pg_dump');
const pgRestore = resolvePgBin('pg_restore');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outPath = resolve(
  process.argv[2] ?? `backups/sylvenarr-pre-uuid-${stamp}.dump`
);

mkdirSync(dirname(outPath), { recursive: true });

console.log(`Using ${pgDump}`);
console.log(`Dumping to ${outPath} …`);
const dump = Bun.spawnSync([pgDump, '--format=custom', `--file=${outPath}`, databaseUrl], {
  stdout: 'inherit',
  stderr: 'inherit',
});

if (dump.exitCode !== 0) {
  console.error(`pg_dump failed with code ${dump.exitCode}`);
  process.exit(dump.exitCode ?? 1);
}

console.log('Verifying dump with pg_restore --list …');
const list = Bun.spawnSync([pgRestore, '--list', outPath], {
  stdout: 'pipe',
  stderr: 'inherit',
});

if (list.exitCode !== 0) {
  console.error(`pg_restore --list failed with code ${list.exitCode}`);
  process.exit(list.exitCode ?? 1);
}

const listing = list.stdout.toString();
const lineCount = listing.split('\n').filter((line) => line.trim().length > 0).length;
console.log(`OK: dump readable (${lineCount} TOC lines). Keep this file until UUID migration is confirmed.`);
console.log(`Restore if needed: pg_restore --clean --if-exists --dbname="$DATABASE_URL" "${outPath}"`);
