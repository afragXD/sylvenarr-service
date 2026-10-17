import { describe, expect, test } from 'bun:test';

import { applyAction, createBattleState } from '../engine';
import { trySpendMana } from '../effects';
import type { HeroClassStats } from '../types';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 100,
  damage: 20,
  armor: 5,
  initiative: 40,
  dodge: 5,
  luck: 5,
  accuracy: 100,
  power: 20,
  mana: 10,
  gold: 100,
  size: 1,
  ...overrides,
});

describe('phase 3.13 pilots', () => {
  test('Mermaid MAGIC_SHACKLES burns on mana spend', () => {
    const heroes = new Map([
      ['Mermaid', hero('Mermaid', { initiative: 99, mana: 10 })],
      ['B', hero('B', { initiative: 1, mana: 10, health: 200 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Mermaid', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const mermaid = state.units.find((unit) => unit.id === 'p1')!;
    expect(mermaid.ultaCharges).toBe(1);
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const cast = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
      targetId: 'p2',
    });
    expect(cast.ok).toBe(true);
    const foe = state.units.find((unit) => unit.id === 'p2')!;
    expect(foe.effects.some((effect) => effect.id === 'MAGIC_SHACKLES')).toBe(true);
    const before = foe.health;
    const err = trySpendMana(foe, 2);
    expect(err).toBeNull();
    expect(foe.health).toBeLessThan(before);
  });

  test('Dracolich execute kills below 20% HP', () => {
    const heroes = new Map([
      ['Dracolich', hero('Dracolich', { initiative: 99 })],
      ['B', hero('B', { initiative: 1, health: 200 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Dracolich', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const foe = state.units.find((unit) => unit.id === 'p2')!;
    foe.health = Math.floor(foe.maxHp * 0.1);
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 3,
      targetId: 'p2',
    });
    expect(result.ok).toBe(true);
    expect(foe.alive).toBe(false);
  });

  test('Dracolich resurrect offers only undead', () => {
    const heroes = new Map([
      ['Dracolich', hero('Dracolich', { initiative: 99 })],
      ['Knight', hero('Knight', { initiative: 1 })],
      ['Archlich', hero('Archlich', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Dracolich', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 2 },
        { id: 'p3', playerId: 'h', heroClassCode: 'Archlich', row: 1, pickOrder: 3 },
        { id: 'e1', playerId: 'g', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const knight = state.units.find((unit) => unit.id === 'p2')!;
    const lich = state.units.find((unit) => unit.id === 'p3')!;
    knight.alive = false;
    lich.alive = false;
    state.graveyard.push(
      {
        unitId: 'p2',
        team: 0,
        heroClassCode: 'Knight',
        displayName: 'Knight',
        forbiddenResurrect: false,
      },
      {
        unitId: 'p3',
        team: 0,
        heroClassCode: 'Archlich',
        displayName: 'Archlich',
        forbiddenResurrect: false,
      }
    );
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const open = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
    });
    expect(open.ok).toBe(true);
    expect(state.pendingPrompt?.kind).toBe('dracolich_resurrect');
    const ids = state.pendingPrompt?.options.map((option) => option.id) ?? [];
    expect(ids).toContain('p3');
    expect(ids).not.toContain('p2');
    const rez = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      choice: 'p3',
    });
    expect(rez.ok).toBe(true);
    expect(lich.alive).toBe(true);
  });

  test('Mermaid enslave flips team', () => {
    const heroes = new Map([
      ['Mermaid', hero('Mermaid', { initiative: 99 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Mermaid', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 3,
      targetId: 'p2',
    });
    expect(result.ok).toBe(true);
    const foe = state.units.find((unit) => unit.id === 'p2')!;
    expect(foe.team).toBe(0);
    expect(foe.playerId).toBe('h');
    expect(foe.effects.some((effect) => effect.id === 'ENSLAVED')).toBe(true);
  });
});
