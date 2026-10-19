import { describe, expect, test } from 'bun:test';

import { applyAction, createBattleState } from '../engine';
import type { HeroClassStats } from '../types';
import { createSummon } from './summon';
import { orcKingAbilities } from './orc-king';
import { runPreChoice } from './registry';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 100,
  damage: 20,
  armor: 5,
  initiative: 30,
  dodge: 10,
  luck: -20,
  accuracy: 90,
  power: 15,
  mana: 0,
  gold: 100,
  size: 1,
  ...overrides,
});

describe('OrcKing preChoice', () => {
  test('cursed aura drains enemy luck when orc luck is low', () => {
    const heroes = new Map([
      ['OrcKing', hero('OrcKing', { luck: -20 })],
      ['B', hero('B', { luck: 20 })],
    ]);
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'OrcKing', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const orc = state.units.find((unit) => unit.id === 'p1');
    const foe = state.units.find((unit) => unit.id === 'p2');
    if (!orc || !foe) {
      throw new Error('missing units');
    }
    orc.lvl = 5;
    const before = foe.luck;
    runPreChoice(state, orc);
    expect(foe.luck).toBeLessThan(before);
  });
});

describe('OrcKing summon prompt', () => {
  test('slot 2 disabled when at summon cap', () => {
    const heroes = new Map([
      ['OrcKing', hero('OrcKing', { initiative: 99 })],
      ['GoblinTrapper', hero('GoblinTrapper')],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'OrcKing', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const orc = state.units.find((unit) => unit.id === 'p1')!;
    orc.maxSummons = 1;
    orc.authority = 2;
    const summon = createSummon(state, {
      summoner: orc,
      heroCode: 'GoblinTrapper',
      row: 0,
    });
    expect(summon).toBeTruthy();
    const slot2 = orcKingAbilities.listAbilities(state, orc).find((a) => a.slot === 2);
    expect(slot2?.disabledReason).toBe('Лимит саммонов');
  });

  test('cancel summon refunds authority and keeps turn', () => {
    const heroes = new Map([
      ['OrcKing', hero('OrcKing', { initiative: 99 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'OrcKing', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const orc = state.units.find((unit) => unit.id === 'p1')!;
    orc.authority = 2;
    const beforeAuth = orc.authority;

    const open = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 2,
    });
    expect(open.ok).toBe(true);
    expect(state.pendingPrompt?.kind).toBe('orc_goblin_type');
    expect(orc.authority).toBe(beforeAuth - 1);

    const cancel = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 2,
      choice: 'cancel',
    });
    expect(cancel.ok).toBe(true);
    expect(state.pendingPrompt).toBeNull();
    expect(orc.authority).toBe(beforeAuth);
    expect(state.activeUnitId).toBe('p1');
    expect(state.turnPlayerId).toBe('h');
  });
});
