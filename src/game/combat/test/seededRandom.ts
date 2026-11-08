/**
 * Детерминированный PRNG для fixture-тестов CUT-2026-11-01c.
 * Подменяет Math.random на время колбэка.
 */

/** mulberry32 — быстрый 32-bit seed → [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Выполнить fn с фиксированным Math.random(seed). */
export function withSeed<T>(seed: number, fn: () => T): T {
  const original = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

/** Снимок «API JSON» для proof: лог + краткое состояние юнитов. */
export function battleApiJson(input: {
  readonly fixtureId: string;
  readonly seed: number;
  readonly log: readonly string[];
  readonly units: ReadonlyArray<{
    readonly id: string;
    readonly heroClassCode: string;
    readonly health: number;
    readonly maxHp: number;
    readonly alive: boolean;
    readonly morale?: number;
    readonly mana?: number;
  }>;
  readonly teamGold?: readonly [number, number];
}): string {
  return `${JSON.stringify(input, null, 2)}\n`;
}
