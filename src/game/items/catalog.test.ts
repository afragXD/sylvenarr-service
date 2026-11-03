import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { ITEM_PERK_BY_CATEGORY, PERK_BY_ID, PERK_CATALOG } from '../perks/catalog';
import { ITEM_BY_CODE, ITEM_CATALOG, type ItemTarget } from './catalog';

const BOT_INVENTORY = path.resolve(
  import.meta.dir,
  '../../../../arenamsterbot/datastore/dinventroy.py'
);

function parseBotCodes(): number[] {
  const src = fs.readFileSync(BOT_INVENTORY, 'utf8');
  const re = /^\s*(\d+):\s*\['([^']*)',\s*(\d+)\]/gm;
  const codes: number[] = [];
  for (const m of src.matchAll(re)) {
    codes.push(Number(m[1]));
  }
  return codes;
}

const TARGET_GROUPS: Record<ItemTarget, readonly number[]> = {
  self: [
    411, 431, 521, 601, 581, 321, 651, 701, 541, 741, 751, 572, 328, 167, 447, 647, 747, 547, 587,
    597, 567, 347, 655, 413, 999, 559,
  ],
  ally: [
    762, 522, 662, 402, 412, 513, 523, 613, 474, 935, 315, 325, 555, 665, 355, 465, 346, 476, 516,
    456, 736, 566, 616, 636, 646, 906, 246, 356, 317, 367, 297, 357, 337, 207, 407, 187, 397, 237,
    387, 2137, 2187, 267, 147, 307, 227, 287, 117, 257, 558, 458, 478, 428, 579, 479, 389, 509, 329,
  ],
  allySummon: [715, 619],
  enemy: [
    322, 532, 932, 562, 363, 433, 233, 323, 353, 343, 354, 334, 444, 454, 434, 404, 216, 406, 466,
    576, 276, 107, 197, 247, 797, 448, 468,
  ],
  enemySummon: [475],
  sellOnly: [217, 137],
};

describe('ITEM_CATALOG', () => {
  test('коды уникальны', () => {
    const codes = ITEM_CATALOG.map((i) => i.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test('все активные коды бота присутствуют', () => {
    const bot = parseBotCodes();
    expect(bot.length).toBeGreaterThan(100);
    for (const code of bot) {
      expect(ITEM_BY_CODE.has(code)).toBe(true);
    }
    expect(ITEM_CATALOG.length).toBe(bot.length);
  });

  test('каждый код ровно в одной группе целей', () => {
    const seen = new Map<number, ItemTarget>();
    for (const [target, codes] of Object.entries(TARGET_GROUPS) as [ItemTarget, number[]][]) {
      for (const code of codes) {
        expect(seen.has(code)).toBe(false);
        seen.set(code, target);
        const item = ITEM_BY_CODE.get(code);
        expect(item).toBeDefined();
        expect(item!.target).toBe(target);
        expect(item!.sellOnly).toBe(target === 'sellOnly');
      }
    }
    for (const item of ITEM_CATALOG) {
      expect(seen.get(item.code)).toBe(item.target);
    }
  });

  test('2137/2187: tier 2, category 7', () => {
    expect(ITEM_BY_CODE.get(2137)).toMatchObject({ tier: 2, category: 7 });
    expect(ITEM_BY_CODE.get(2187)).toMatchObject({ tier: 2, category: 7 });
  });
});

describe('PERK_CATALOG', () => {
  test('ровно 25 перков: 9 item + 16 other', () => {
    expect(PERK_CATALOG.length).toBe(25);
    expect(PERK_CATALOG.filter((p) => p.kind === 'item').length).toBe(9);
    expect(PERK_CATALOG.filter((p) => p.kind === 'other').length).toBe(16);
  });

  test('id уникальны', () => {
    const ids = PERK_CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PERK_BY_ID.size).toBe(25);
  });

  test('у 9 перков предметов по одной категории 1–9', () => {
    expect(ITEM_PERK_BY_CATEGORY.size).toBe(9);
    for (let cat = 1; cat <= 9; cat++) {
      const perk = ITEM_PERK_BY_CATEGORY.get(cat);
      expect(perk).toBeDefined();
      expect(perk!.kind).toBe('item');
      expect(perk!.category).toBe(cat);
    }
  });
});
