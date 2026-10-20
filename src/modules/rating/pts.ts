/** Стартовый («нулевой») уровень ПТС — HeroesWorld / StickyFingaz. */
export const START_PTS = 1500;

/** Пол рейтинга: ниже нуля уйти нельзя. */
export const PTS_FLOOR = 0;

const K = 16;
const SCALE = 400;

export type PtsOutcome = 'a_win' | 'b_win' | 'draw';

export type PtsChange = {
  readonly deltaA: number;
  readonly deltaB: number;
  readonly ptsAfterA: number;
  readonly ptsAfterB: number;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * Целая часть числа (trunc к нулю), как (int) в формуле StickyFingaz.
 */
const truncTowardZero = (value: number): number =>
  value < 0 ? Math.ceil(value) : Math.floor(value);

/**
 * Считает изменение ПТС по формуле сезонного online-рейтинга Heroes III
 * (StickyFingaz / HeroesWorld). Победитель получает полный расчётный прирост;
 * проигравший режется до PTS_FLOOR.
 */
export function computePtsChange(input: {
  readonly ptsA: number;
  readonly ptsB: number;
  readonly outcome: PtsOutcome;
}): PtsChange {
  const { ptsA, ptsB, outcome } = input;
  const f1 = clamp((ptsA - ptsB) / SCALE, -1, 1);
  const f2 = clamp((ptsB - ptsA) / SCALE, -1, 1);
  const wp1 = Math.max(1, K * (1 + f1));
  const wp2 = Math.max(1, K * (1 + f2));
  const lp1 = Math.min(-1, K * (-1 + f1));
  const lp2 = Math.min(-1, K * (-1 + f2));

  let rawDeltaA = 0;
  let rawDeltaB = 0;
  if (outcome === 'a_win') {
    rawDeltaA = truncTowardZero(wp2);
    rawDeltaB = truncTowardZero(lp1);
  } else if (outcome === 'b_win') {
    rawDeltaA = truncTowardZero(lp2);
    rawDeltaB = truncTowardZero(wp1);
  } else {
    rawDeltaA = truncTowardZero((wp2 - wp1) / 2 + 0.5);
    rawDeltaB = truncTowardZero((wp1 - wp2) / 2 + 0.5);
  }

  const ptsAfterA = Math.max(PTS_FLOOR, ptsA + rawDeltaA);
  const ptsAfterB = Math.max(PTS_FLOOR, ptsB + rawDeltaB);
  return {
    deltaA: ptsAfterA - ptsA,
    deltaB: ptsAfterB - ptsB,
    ptsAfterA,
    ptsAfterB,
  };
}
