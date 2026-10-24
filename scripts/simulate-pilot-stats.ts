/**
 * Симуляция роста статов пилотов на уровнях 5, 10, …, 40.
 * Usage: bun scripts/simulate-pilot-stats.ts
 */
import { heroSeeds } from '../prisma/seed-data/heroes';
import { createBattleState } from '../src/game/combat/engine';
import { levelUpUnit } from '../src/game/combat/level';
import { pilotLevelUps } from '../src/game/combat/levelup/pilots';
import type { HeroClassStats } from '../src/game/combat/types';

const LEVELS = [5, 10, 15, 20, 25, 30, 35, 40] as const;
const RUNS = 200;

const STAT_KEYS = ['damage', 'power', 'armor', 'maxHp', 'mana', 'initiative'] as const;
type StatKey = (typeof STAT_KEYS)[number];

type Snapshot = Record<StatKey, number>;

function toStats(seed: (typeof heroSeeds)[number]): HeroClassStats {
  return {
    code: seed.code,
    displayName: seed.displayName,
    health: seed.health,
    damage: seed.damage,
    armor: seed.armor,
    initiative: seed.initiative,
    dodge: seed.dodge,
    luck: seed.luck,
    accuracy: seed.accuracy,
    power: seed.power,
    mana: seed.mana,
    maxMana: seed.maxMana,
    gold: seed.gold,
    size: seed.size,
    morale: seed.morale,
  };
}

function snapshot(unit: {
  damage: number;
  power: number;
  armor: number;
  maxHp: number;
  mana: number;
  initiative: number;
}): Snapshot {
  return {
    damage: unit.damage,
    power: unit.power,
    armor: unit.armor,
    maxHp: unit.maxHp,
    mana: unit.mana,
    initiative: unit.initiative,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx]!;
}

function summarize(values: number[]): { avg: number; p10: number; p90: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const avg = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
  return {
    avg: Math.round(avg * 10) / 10,
    p10: percentile(sorted, 10),
    p90: percentile(sorted, 90),
  };
}

function growToLevel(heroCode: string, targetLvl: number): Snapshot {
  const seed = heroSeeds.find((h) => h.code === heroCode);
  if (!seed) {
    throw new Error(`missing seed ${heroCode}`);
  }
  const stats = toStats(seed);
  const filler = toStats({
    ...seed,
    code: 'Dummy',
    displayName: 'Dummy',
  });
  const state = createBattleState({
    matchId: `sim-${heroCode}-${targetLvl}-${Math.random()}`,
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      { id: 'p1', playerId: 'h', heroClassCode: heroCode, row: 0, pickOrder: 1 },
      { id: 'p2', playerId: 'g', heroClassCode: 'Dummy', row: 0, pickOrder: 1 },
    ],
    heroes: new Map([
      [heroCode, stats],
      ['Dummy', filler],
    ]),
  });
  const unit = state.units.find((u) => u.id === 'p1')!;
  while (unit.lvl < targetLvl) {
    state.stage = unit.lvl + 1;
    levelUpUnit(unit, 1, state);
  }
  return snapshot(unit);
}

const codes = Object.keys(pilotLevelUps).sort();

type LevelRow = {
  level: number;
  stats: Record<StatKey, { avg: number; p10: number; p90: number }>;
};

const report: Record<string, LevelRow[]> = {};

for (const code of codes) {
  const rows: LevelRow[] = [];
  for (const level of LEVELS) {
    const samples: Snapshot[] = [];
    for (let i = 0; i < RUNS; i += 1) {
      samples.push(growToLevel(code, level));
    }
    const stats = {} as Record<StatKey, { avg: number; p10: number; p90: number }>;
    for (const key of STAT_KEYS) {
      stats[key] = summarize(samples.map((s) => s[key]));
    }
    rows.push({ level, stats });
  }
  report[code] = rows;
}

function fmt(s: { avg: number; p10: number; p90: number }): string {
  if (s.p10 === s.p90) {
    return `${s.avg}`;
  }
  return `${s.avg} [${s.p10}..${s.p90}]`;
}

console.log(`# Pilot level-up sim (N=${RUNS}, levels ${LEVELS.join(',')})\n`);

for (const code of codes) {
  console.log(`## ${code}`);
  console.log('| lvl | damage | power | armor | maxHp | mana | initiative |');
  console.log('|-----|--------|-------|-------|-------|------|------------|');
  for (const row of report[code]!) {
    const s = row.stats;
    console.log(
      `| ${row.level} | ${fmt(s.damage)} | ${fmt(s.power)} | ${fmt(s.armor)} | ${fmt(s.maxHp)} | ${fmt(s.mana)} | ${fmt(s.initiative)} |`
    );
  }
  console.log('');
}

// Rankings at lvl 20 by avg
const at20 = codes.map((code) => {
  const row = report[code]!.find((r) => r.level === 20)!;
  return { code, ...row.stats };
});

const top = (key: StatKey, n = 5) =>
  [...at20]
    .sort((a, b) => b[key].avg - a[key].avg)
    .slice(0, n)
    .map((r) => `${r.code}(${r[key].avg})`)
    .join(', ');

const jokers = at20
  .map((r) => {
    const spread =
      r.damage.p90 -
      r.damage.p10 +
      (r.power.p90 - r.power.p10) +
      (r.initiative.p90 - r.initiative.p10);
    return { code: r.code, spread };
  })
  .filter((r) => r.spread > 5)
  .sort((a, b) => b.spread - a.spread);

console.log('## Rankings @ lvl 20 (avg)');
console.log(`- damage: ${top('damage')}`);
console.log(`- power: ${top('power')}`);
console.log(`- armor: ${top('armor')}`);
console.log(`- maxHp: ${top('maxHp')}`);
console.log(`- initiative: ${top('initiative')}`);
console.log('');
console.log('## High RNG spread (damage+power+init p90-p10) @ 20');
for (const j of jokers.slice(0, 10)) {
  console.log(`- ${j.code}: spread≈${j.spread}`);
}
