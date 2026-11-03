import fs from 'node:fs';
import path from 'node:path';

const botPath = path.resolve(
  import.meta.dirname,
  '../../arenamsterbot/datastore/dinventroy.py'
);
const src = fs.readFileSync(botPath, 'utf8');
const re = /^\s*(\d+):\s*\['([^']*)',\s*(\d+)\]/gm;
const raw = [];
let m;
while ((m = re.exec(src))) {
  const code = Number(m[1]);
  const parts = m[2].split(' | ');
  raw.push({
    code,
    name: parts[0],
    description: parts.slice(1).join(' | ') || '',
    cost: Number(m[3]),
  });
}

const SELF = new Set([
  411, 431, 521, 601, 581, 321, 651, 701, 541, 741, 751, 572, 328, 167, 447, 647, 747, 547, 587,
  597, 567, 347, 655, 413, 999, 559,
]);
const ALLY = new Set([
  762, 522, 662, 402, 412, 513, 523, 613, 474, 935, 315, 325, 555, 665, 355, 465, 346, 476, 516,
  456, 736, 566, 616, 636, 646, 906, 246, 356, 317, 367, 297, 357, 337, 207, 407, 187, 397, 237,
  387, 2137, 2187, 267, 147, 307, 227, 287, 117, 257, 558, 458, 478, 428, 579, 479, 389, 509, 329,
]);
const ALLY_SUMMON = new Set([715, 619]);
const ENEMY = new Set([
  322, 532, 932, 562, 363, 433, 233, 323, 353, 343, 354, 334, 444, 454, 434, 404, 216, 406, 466,
  576, 276, 107, 197, 247, 797, 448, 468,
]);
const ENEMY_SUMMON = new Set([475]);
const SELL_ONLY = new Set([217, 137]);

function targetOf(code) {
  if (SELL_ONLY.has(code)) return 'sellOnly';
  if (SELF.has(code)) return 'self';
  if (ALLY.has(code)) return 'ally';
  if (ALLY_SUMMON.has(code)) return 'allySummon';
  if (ENEMY.has(code)) return 'enemy';
  if (ENEMY_SUMMON.has(code)) return 'enemySummon';
  throw new Error(`no target for ${code}`);
}

function tierOf(code) {
  if (code === 2137 || code === 2187) return 2;
  return Number(String(code)[0]);
}

function categoryOf(code) {
  if (code === 2137 || code === 2187) return 7;
  return code % 10;
}

const missing = [];
const items = raw.map((it) => {
  let target;
  try {
    target = targetOf(it.code);
  } catch {
    missing.push(it.code);
    target = 'self';
  }
  return {
    code: it.code,
    name: it.name,
    description: it.description,
    cost: it.cost,
    category: categoryOf(it.code),
    tier: tierOf(it.code),
    target,
    sellOnly: SELL_ONLY.has(it.code),
  };
});

const allCut = [...SELF, ...ALLY, ...ALLY_SUMMON, ...ENEMY, ...ENEMY_SUMMON, ...SELL_ONLY];
const codes = new Set(items.map((i) => i.code));
console.log('parsed', raw.length);
console.log('missing targets', missing);
console.log(
  'cut missing from bot',
  allCut.filter((c) => !codes.has(c))
);
console.log(
  'bot not in cut groups',
  [...codes].filter((c) => !allCut.includes(c))
);

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const lines = items
  .map(
    (i) =>
      `  { code: ${i.code}, name: '${esc(i.name)}', description: '${esc(i.description)}', cost: ${i.cost}, category: ${i.category}, tier: ${i.tier}, target: '${i.target}', sellOnly: ${i.sellOnly} },`
  )
  .join('\n');

const file = `/** Каталог предметов (порт inventory_dict + CUT-2026-11-03b). */
export type ItemTarget = 'self' | 'ally' | 'allySummon' | 'enemy' | 'enemySummon' | 'sellOnly';

export type ItemCatalogEntry = {
  readonly code: number;
  readonly name: string;
  readonly description: string;
  readonly cost: number;
  /** Категория 1–9 (последняя цифра кода; 2137/2187 → 7). */
  readonly category: number;
  /** Тир/редкость (первая цифра кода; 2137/2187 → 2). */
  readonly tier: number;
  readonly target: ItemTarget;
  readonly sellOnly: boolean;
};

export const ITEM_CATALOG: readonly ItemCatalogEntry[] = [
${lines}
] as const;

export const ITEM_BY_CODE: ReadonlyMap<number, ItemCatalogEntry> = new Map(
  ITEM_CATALOG.map((item) => [item.code, item])
);

export function getItem(code: number): ItemCatalogEntry | undefined {
  return ITEM_BY_CODE.get(code);
}
`;

const outPath = path.resolve(import.meta.dirname, '../src/game/items/catalog.ts');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, file);
console.log('wrote', outPath, 'count', items.length);
