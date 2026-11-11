import { describe, expect, test } from 'bun:test';

import { createBattleState, getBattleStore, resetBattleStoreForTests } from '../../game/combat';
import type { HeroClassStats } from '../../game/combat/types';
import { isCreatorRole } from '../../shared/auth/roles';
import { applyTeamInventoryPatch } from './patch-inventory';
import { applyUnitStatsPatch } from './patch-unit';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 100,
  damage: 20,
  armor: 5,
  initiative: 30,
  dodge: 10,
  luck: 5,
  accuracy: 90,
  power: 15,
  mana: 10,
  gold: 200,
  size: 1,
  ...overrides,
});

describe('creator access contract', () => {
  test('creator 200 / admin 403 / player 403', () => {
    const statusFor = (role: string) => (isCreatorRole(role) ? 200 : 403);
    expect(statusFor('creator')).toBe(200);
    expect(statusFor('admin')).toBe(403);
    expect(statusFor('player')).toBe(403);
  });
});

describe('applyUnitStatsPatch', () => {
  test('maxHp clamps health', () => {
    const state = createBattleState({
      matchId: 'creator-patch-maxhp',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A')],
        ['B', hero('B')],
      ]),
    });
    const unit = state.units[0];
    if (!unit) {
      throw new Error('unit missing');
    }
    unit.health = 80;
    applyUnitStatsPatch(unit, { maxHp: 50 });
    expect(unit.maxHp).toBe(50);
    expect(unit.health).toBe(50);
  });

  test('lvl raises hiddenLvl when needed', () => {
    const state = createBattleState({
      matchId: 'creator-patch-lvl',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A')],
        ['B', hero('B')],
      ]),
    });
    const unit = state.units[0];
    if (!unit) {
      throw new Error('unit missing');
    }
    unit.lvl = 1;
    unit.hiddenLvl = 1;
    applyUnitStatsPatch(unit, { lvl: 5 });
    expect(unit.lvl).toBe(5);
    expect(unit.hiddenLvl).toBe(5);

    applyUnitStatsPatch(unit, { lvl: 3 });
    expect(unit.lvl).toBe(3);
    expect(unit.hiddenLvl).toBe(5);
  });

  test('patch persists in battle store', async () => {
    resetBattleStoreForTests();
    const matchId = `creator-store-${crypto.randomUUID()}`;
    const state = createBattleState({
      matchId,
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A')],
        ['B', hero('B')],
      ]),
    });
    const unit = state.units[0];
    if (!unit) {
      throw new Error('unit missing');
    }
    applyUnitStatsPatch(unit, { lvl: 7, damage: 99 });
    await getBattleStore().set(state);
    const loaded = await getBattleStore().get(matchId);
    const again = loaded?.units.find((item) => item.id === unit.id);
    expect(again?.lvl).toBe(7);
    expect(again?.damage).toBe(99);
    await getBattleStore().delete(matchId);
  });
});

describe('applyTeamInventoryPatch', () => {
  test('replaces stacks and does not append battle log', () => {
    const state = createBattleState({
      matchId: 'creator-patch-inv',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A')],
        ['B', hero('B')],
      ]),
    });
    state.teams = [
      { gold: 100, inventory: [237, 237] },
      { gold: 50, inventory: [147] },
    ];
    state.log.push('pre-existing');
    const logBefore = [...state.log];

    applyTeamInventoryPatch(state, 0, [
      { code: 147, quantity: 1 },
      { code: 307, quantity: 2 },
      { code: 99999, quantity: 0 },
    ]);

    expect(state.teams?.[0]?.inventory).toEqual([147, 307, 307]);
    expect(state.teams?.[1]?.inventory).toEqual([147]);
    expect(state.log).toEqual(logBefore);
  });

  test('rejects unknown item code', () => {
    const state = createBattleState({
      matchId: 'creator-patch-inv-bad',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A')],
        ['B', hero('B')],
      ]),
    });
    expect(() =>
      applyTeamInventoryPatch(state, 1, [{ code: 99999, quantity: 1 }])
    ).toThrow(/Неизвестный предмет/);
  });
});
