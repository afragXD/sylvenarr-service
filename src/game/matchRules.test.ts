import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_MATCH_RULES,
  parseMatchRules,
  resolveMatchRules,
} from './matchRules';

describe('parseMatchRules', () => {
  test('empty input → defaults', () => {
    const result = parseMatchRules({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rules).toEqual(DEFAULT_MATCH_RULES);
    }
  });

  test('clamps out-of-range fields', () => {
    const result = parseMatchRules({
      initialTeamSize: 99,
      maxTeamSize: 99,
      maxRowSize: 99,
      maxRounds: 99,
      healthBonus: 2,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rules.initialTeamSize).toBe(6);
      expect(result.rules.maxTeamSize).toBe(8);
      expect(result.rules.maxRowSize).toBe(4);
      expect(result.rules.maxRounds).toBe(40);
      expect(result.rules.healthBonus).toBe(1);
    }
  });

  test('fails when initial > maxTeam', () => {
    const result = parseMatchRules({
      initialTeamSize: 6,
      maxTeamSize: 4,
      maxRowSize: 4,
    });
    expect(result.ok).toBe(false);
  });

  test('fails when initial > maxRowSize * 2', () => {
    const result = parseMatchRules({
      initialTeamSize: 5,
      maxTeamSize: 8,
      maxRowSize: 2,
    });
    expect(result.ok).toBe(false);
  });

  test('resolveMatchRules falls back on invalid cross-field', () => {
    const rules = resolveMatchRules({
      initialTeamSize: 6,
      maxTeamSize: 2,
    });
    expect(rules).toEqual(DEFAULT_MATCH_RULES);
  });

  test('missing heroDupes → allow', () => {
    const result = parseMatchRules({ initialTeamSize: 3 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rules.heroDupes).toBe('allow');
    }
  });

  test('accepts heroDupes uniqueMatch', () => {
    const result = parseMatchRules({ heroDupes: 'uniqueMatch' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rules.heroDupes).toBe('uniqueMatch');
    }
  });

  test('unknown heroDupes → allow', () => {
    const result = parseMatchRules({ heroDupes: 'nope' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rules.heroDupes).toBe('allow');
    }
  });
});
