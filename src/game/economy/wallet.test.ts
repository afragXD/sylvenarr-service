import { describe, expect, test } from 'bun:test';

import { createBattleState } from '../combat/engine';
import type { BattleState, HeroClassStats } from '../combat/types';
import {
  addTeamGold,
  computeStartingTeamGold,
  migrateLegacyTeamGold,
  spendTeamGold,
  teamGold,
} from './wallet';

const hero = (code: string, gold: number): HeroClassStats => ({
  code,
  displayName: code,
  health: 100,
  damage: 10,
  armor: 0,
  initiative: 10,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 10,
  mana: 5,
  maxMana: 5,
  gold,
  size: 1,
});

describe('computeStartingTeamGold', () => {
  test('один герой: без штрафа 0,75', () => {
    expect(computeStartingTeamGold([400], 1)).toBe(400);
  });

  test('три героя: ×0,75', () => {
    expect(computeStartingTeamGold([100, 100, 100], 1)).toBe(225);
  });

  test('goldBonus умножает сумму', () => {
    expect(computeStartingTeamGold([200], 1.5)).toBe(300);
    expect(computeStartingTeamGold([100, 100], 2)).toBe(300);
  });
});

describe('createBattleState team wallets', () => {
  test('стартовое золото 1 и 3 героя с goldBonus', () => {
    const one = createBattleState({
      matchId: 'g1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'h1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'g1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A', 400)],
        ['B', hero('B', 200)],
      ]),
      rules: {
        maxTeamSize: 8,
        maxRowSize: 4,
        maxRounds: 20,
        healthBonus: 0.65,
        startingLevel: 1,
        goldBonus: 1,
      },
    });
    expect(teamGold(one, 0)).toBe(400);
    expect(teamGold(one, 1)).toBe(200);

    const three = createBattleState({
      matchId: 'g3',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'h1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'h2', playerId: 'h', heroClassCode: 'C', row: 0, pickOrder: 2 },
        { id: 'h3', playerId: 'h', heroClassCode: 'D', row: 1, pickOrder: 3 },
        { id: 'g1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A', 100)],
        ['C', hero('C', 100)],
        ['D', hero('D', 100)],
        ['B', hero('B', 200)],
      ]),
      rules: {
        maxTeamSize: 8,
        maxRowSize: 4,
        maxRounds: 20,
        healthBonus: 0.65,
        startingLevel: 1,
        goldBonus: 2,
      },
    });
    // host: round(300 * 2 * 0.75) = 450
    expect(teamGold(three, 0)).toBe(450);
    expect(teamGold(three, 1)).toBe(400);
  });
});

describe('wallet helpers', () => {
  test('кража / spend / schizophrenia-like drain', () => {
    const state = createBattleState({
      matchId: 'w',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'h1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'g1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A', 100)],
        ['B', hero('B', 500)],
      ]),
    });
    expect(spendTeamGold(state, 0, 40)).toBe(true);
    expect(teamGold(state, 0)).toBe(60);
    expect(spendTeamGold(state, 0, 100)).toBe(false);
    expect(teamGold(state, 0)).toBe(60);

    const stolen = 80;
    addTeamGold(state, 1, -stolen);
    addTeamGold(state, 0, stolen);
    expect(teamGold(state, 0)).toBe(140);
    expect(teamGold(state, 1)).toBe(420);

    addTeamGold(state, 1, -300);
    expect(teamGold(state, 1)).toBe(120);
  });

  test('старый снимок: сумма unit.gold → teams', () => {
    const state = {
      units: [
        { team: 0, gold: 120 },
        { team: 0, gold: 30 },
        { team: 1, gold: 50 },
      ],
    } as unknown as BattleState;
    migrateLegacyTeamGold(state);
    expect(teamGold(state, 0)).toBe(150);
    expect(teamGold(state, 1)).toBe(50);
    expect((state.units[0] as { gold?: number }).gold).toBeUndefined();
  });
});
