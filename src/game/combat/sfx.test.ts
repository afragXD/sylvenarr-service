import { describe, expect, test } from 'bun:test';

import { applyAction, createBattleState, toBattleSummary } from './engine';
import type { HeroClassStats } from './types';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 100,
  damage: 20,
  armor: 0,
  initiative: 30,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 15,
  mana: 10,
  gold: 200,
  size: 1,
  ...overrides,
});

function makeDuel(hostCode: string, foeHealth = 100) {
  return createBattleState({
    matchId: 'm1',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      { id: 'p1', playerId: 'h', heroClassCode: hostCode, row: 0, pickOrder: 1 },
      { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
    ],
    heroes: new Map([
      [hostCode, hero(hostCode, { initiative: 50, damage: 500 })],
      ['B', hero('B', { initiative: 10, health: foeHealth })],
    ]),
  });
}

describe('battle sfx events', () => {
  test('pilot ability emits ability event before death', () => {
    const state = makeDuel('Knight', 1);
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 1,
      targetId: 'p2',
    });
    expect(result.ok).toBe(true);
    const events = toBattleSummary(state).sfxEvents;
    expect(events[0]).toMatchObject({ unitId: 'p1', kind: 'ability', slot: 1, heroClassCode: 'Knight' });
    expect(events.some((event) => event.kind === 'death' && event.unitId === 'p2')).toBe(true);
    expect(events.map((event) => event.seq)).toEqual([...events.map((event) => event.seq)].sort((a, b) => a - b));
  });

  test('rejected ability leaves no event', () => {
    const state = makeDuel('Knight');
    const before = toBattleSummary(state).sfxEvents.length;
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
      targetId: 'p2',
    });
    expect(result.ok).toBe(false);
    expect(toBattleSummary(state).sfxEvents.length).toBe(before);
  });

  test('state without sfx fields still summarizes', () => {
    const state = makeDuel('A');
    delete state.sfxEvents;
    delete state.sfxSeq;
    expect(toBattleSummary(state).sfxEvents).toEqual([]);
  });
});
