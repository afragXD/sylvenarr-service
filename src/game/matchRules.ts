import {
  HEALTH_BONUS,
  MAX_ROUNDS,
  MAX_ROW_SIZE,
  MAX_TEAM_SIZE,
} from './combat/settings';
import { INITIAL_TEAM_SIZE } from './draft/settings';

/** Полный снимок правил матча (legacy settings.py + резерв ярмарки). */
export type MatchRules = {
  readonly initialTeamSize: number;
  readonly maxTeamSize: number;
  readonly maxRowSize: number;
  readonly maxRounds: number;
  /** Множитель стартового HP (0.5 = 50%). */
  readonly healthBonus: number;
  readonly fairEnabled: boolean;
  readonly fairFrequency: number;
  readonly shopSize: number;
  readonly goldBonus: number;
};

export const DEFAULT_MATCH_RULES: MatchRules = {
  initialTeamSize: INITIAL_TEAM_SIZE,
  maxTeamSize: MAX_TEAM_SIZE,
  maxRowSize: MAX_ROW_SIZE,
  maxRounds: MAX_ROUNDS,
  healthBonus: HEALTH_BONUS,
  fairEnabled: false,
  fairFrequency: 5,
  shopSize: 8,
  goldBonus: 1,
};

export const MATCH_RULES_LIMITS = {
  initialTeamSize: { min: 1, max: 6 },
  maxTeamSize: { min: 2, max: 8 },
  maxRowSize: { min: 1, max: 4 },
  maxRounds: { min: 5, max: 40 },
  healthBonus: { min: 0.25, max: 1, step: 0.05 },
  fairFrequency: { min: 3, max: 10 },
  shopSize: { min: 4, max: 12 },
  goldBonus: { min: 0.5, max: 2, step: 0.25 },
} as const;

export type ParseMatchRulesResult =
  | { ok: true; rules: MatchRules }
  | { ok: false; message: string };

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampFloat(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  const steps = Math.round((clamped - min) / step);
  return Math.round((min + steps * step) * 1000) / 1000;
}

/**
 * Нормализует partial/legacy JSON в полный MatchRules.
 * Cross-field ошибки — fail; отдельные поля clamp в диапазон.
 */
export function parseMatchRules(input: unknown): ParseMatchRulesResult {
  const raw =
    typeof input === 'object' && input !== null
      ? (input as Record<string, unknown>)
      : {};

  const initialTeamSize = clampInt(
    asNumber(raw.initialTeamSize, DEFAULT_MATCH_RULES.initialTeamSize),
    MATCH_RULES_LIMITS.initialTeamSize.min,
    MATCH_RULES_LIMITS.initialTeamSize.max
  );
  const maxTeamSize = clampInt(
    asNumber(raw.maxTeamSize, DEFAULT_MATCH_RULES.maxTeamSize),
    MATCH_RULES_LIMITS.maxTeamSize.min,
    MATCH_RULES_LIMITS.maxTeamSize.max
  );
  const maxRowSize = clampInt(
    asNumber(raw.maxRowSize, DEFAULT_MATCH_RULES.maxRowSize),
    MATCH_RULES_LIMITS.maxRowSize.min,
    MATCH_RULES_LIMITS.maxRowSize.max
  );
  const maxRounds = clampInt(
    asNumber(raw.maxRounds, DEFAULT_MATCH_RULES.maxRounds),
    MATCH_RULES_LIMITS.maxRounds.min,
    MATCH_RULES_LIMITS.maxRounds.max
  );
  const healthBonus = clampFloat(
    asNumber(raw.healthBonus, DEFAULT_MATCH_RULES.healthBonus),
    MATCH_RULES_LIMITS.healthBonus.min,
    MATCH_RULES_LIMITS.healthBonus.max,
    MATCH_RULES_LIMITS.healthBonus.step
  );
  const fairEnabled =
    typeof raw.fairEnabled === 'boolean'
      ? raw.fairEnabled
      : DEFAULT_MATCH_RULES.fairEnabled;
  const fairFrequency = clampInt(
    asNumber(raw.fairFrequency, DEFAULT_MATCH_RULES.fairFrequency),
    MATCH_RULES_LIMITS.fairFrequency.min,
    MATCH_RULES_LIMITS.fairFrequency.max
  );
  const shopSize = clampInt(
    asNumber(raw.shopSize, DEFAULT_MATCH_RULES.shopSize),
    MATCH_RULES_LIMITS.shopSize.min,
    MATCH_RULES_LIMITS.shopSize.max
  );
  const goldBonus = clampFloat(
    asNumber(raw.goldBonus, DEFAULT_MATCH_RULES.goldBonus),
    MATCH_RULES_LIMITS.goldBonus.min,
    MATCH_RULES_LIMITS.goldBonus.max,
    MATCH_RULES_LIMITS.goldBonus.step
  );

  if (initialTeamSize > maxTeamSize) {
    return {
      ok: false,
      message: 'Стартовый размер отряда не может быть больше максимума команды',
    };
  }
  if (initialTeamSize > maxRowSize * 2) {
    return {
      ok: false,
      message: 'Стартовый размер отряда не помещается в два ряда',
    };
  }

  return {
    ok: true,
    rules: {
      initialTeamSize,
      maxTeamSize,
      maxRowSize,
      maxRounds,
      healthBonus,
      fairEnabled,
      fairFrequency,
      shopSize,
      goldBonus,
    },
  };
}

/** Всегда возвращает валидные rules (defaults при ошибке). */
export function resolveMatchRules(input: unknown): MatchRules {
  const parsed = parseMatchRules(input);
  return parsed.ok ? parsed.rules : DEFAULT_MATCH_RULES;
}
