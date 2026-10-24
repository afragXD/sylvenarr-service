import { describe, expect, test } from 'bun:test';
import {
  canPickMore,
  isDraftComplete,
  resolveTurnPlayerId,
  teamSize,
  validateMovePick,
  validatePick,
} from './rules';
import { INITIAL_TEAM_SIZE } from './settings';
import type { DraftPick } from './types';

const pick = (
  overrides: Partial<DraftPick> & Pick<DraftPick, 'playerId' | 'size' | 'row'>
): DraftPick => ({
  id: overrides.id ?? 'p',
  playerId: overrides.playerId,
  heroClassCode: overrides.heroClassCode ?? 'Assassin',
  displayName: overrides.displayName ?? 'Ассасин',
  size: overrides.size,
  row: overrides.row,
  pickOrder: overrides.pickOrder ?? 1,
  source: overrides.source ?? 'draft',
});

describe('draft rules', () => {
  test('teamSize sums sizes', () => {
    const picks = [
      pick({ playerId: 'h', size: 2, row: 0 }),
      pick({ playerId: 'h', size: 1, row: 1, pickOrder: 2 }),
      pick({ playerId: 'g', size: 1, row: 0 }),
    ];
    expect(teamSize(picks, 'h')).toBe(3);
    expect(teamSize(picks, 'g')).toBe(1);
  });

  test('turn alternates host then guest', () => {
    expect(resolveTurnPlayerId([], 'h', 'g')).toBe('h');
    const afterHost = [pick({ playerId: 'h', size: 1, row: 0, pickOrder: 1 })];
    expect(resolveTurnPlayerId(afterHost, 'h', 'g')).toBe('g');
    const afterGuest = [...afterHost, pick({ playerId: 'g', size: 1, row: 0, pickOrder: 2 })];
    expect(resolveTurnPlayerId(afterGuest, 'h', 'g')).toBe('h');
    expect(canPickMore(afterHost, 'h')).toBe(true);
  });

  test('guest continues when host is full', () => {
    const picks = [
      pick({ playerId: 'h', size: 2, row: 0, pickOrder: 1 }),
      pick({ playerId: 'g', size: 1, row: 0, pickOrder: 2 }),
      pick({ playerId: 'h', size: 1, row: 1, pickOrder: 3 }),
    ];
    expect(resolveTurnPlayerId(picks, 'h', 'g')).toBe('g');
  });

  test('draft complete when both at INITIAL_TEAM_SIZE', () => {
    const picks = [
      pick({ playerId: 'h', size: 1, row: 0, pickOrder: 1 }),
      pick({ playerId: 'g', size: 1, row: 0, pickOrder: 2 }),
      pick({ playerId: 'h', size: 1, row: 0, pickOrder: 3 }),
      pick({ playerId: 'g', size: 1, row: 0, pickOrder: 4 }),
      pick({ playerId: 'h', size: 1, row: 1, pickOrder: 5 }),
      pick({ playerId: 'g', size: 1, row: 1, pickOrder: 6 }),
    ];
    expect(isDraftComplete(picks, 'h', 'g')).toBe(true);
    expect(resolveTurnPlayerId(picks, 'h', 'g')).toBeNull();
    expect(INITIAL_TEAM_SIZE).toBe(3);
  });

  test('rejects giant when only 1 slot left', () => {
    const picks = [pick({ playerId: 'h', size: 2, row: 0 })];
    const result = validatePick({
      picks,
      playerId: 'h',
      hero: { code: 'DemonLord', displayName: 'Владыка', size: 2, isPlayable: true },
      row: 1,
    });
    expect(result.ok).toBe(false);
  });

  test('rejects unplayable hero', () => {
    const result = validatePick({
      picks: [],
      playerId: 'g',
      hero: { code: 'Zombie', displayName: 'Зомби', size: 1, isPlayable: false },
      row: 0,
    });
    expect(result.ok).toBe(false);
  });

  test('validateMovePick allows move to free row', () => {
    const picks = [
      pick({ id: 'a', playerId: 'h', size: 1, row: 0, pickOrder: 1 }),
      pick({ id: 'b', playerId: 'h', size: 1, row: 0, pickOrder: 2 }),
    ];
    expect(validateMovePick({ picks, pickId: 'a', playerId: 'h', row: 1 }).ok).toBe(true);
  });

  test('uniqueTeam rejects own duplicate class', () => {
    const picks = [pick({ playerId: 'h', size: 1, row: 0, heroClassCode: 'Assassin' })];
    const result = validatePick({
      picks,
      playerId: 'h',
      hero: { code: 'Assassin', displayName: 'Ассасин', size: 1, isPlayable: true },
      row: 1,
      limits: { initialTeamSize: 3, maxRowSize: 3, heroDupes: 'uniqueTeam' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('вашем отряде');
    }
  });

  test('uniqueTeam allows opponent same class', () => {
    const picks = [pick({ playerId: 'g', size: 1, row: 0, heroClassCode: 'Assassin' })];
    const result = validatePick({
      picks,
      playerId: 'h',
      hero: { code: 'Assassin', displayName: 'Ассасин', size: 1, isPlayable: true },
      row: 0,
      limits: { initialTeamSize: 3, maxRowSize: 3, heroDupes: 'uniqueTeam' },
    });
    expect(result.ok).toBe(true);
  });

  test('uniqueMatch rejects any duplicate class', () => {
    const picks = [pick({ playerId: 'g', size: 1, row: 0, heroClassCode: 'Assassin' })];
    const result = validatePick({
      picks,
      playerId: 'h',
      hero: { code: 'Assassin', displayName: 'Ассасин', size: 1, isPlayable: true },
      row: 0,
      limits: { initialTeamSize: 3, maxRowSize: 3, heroDupes: 'uniqueMatch' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('матче');
    }
  });
});
