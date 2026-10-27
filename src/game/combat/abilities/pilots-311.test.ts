import { describe, expect, test } from 'bun:test';

import { dealDamage } from '../damage';
import { applyAction, createBattleState } from '../engine';
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

describe('phase 3.11 pilots', () => {
  test('Specter slot 1 opens second-mind prompt', () => {
    const heroes = new Map([
      ['Specter', hero('Specter', { initiative: 99, accuracy: 100 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Specter', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'p3', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 2 },
      ],
      heroes,
    });
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const first = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 1,
      targetId: 'p2',
    });
    expect(first.ok).toBe(true);
    expect(state.pendingPrompt?.kind).toBe('specter_second_mind');
    const second = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      choice: 'p3',
    });
    expect(second.ok).toBe(true);
    expect(state.pendingPrompt).toBeNull();
  });

  test('Detective slot 2 poisons target row for 1 round with chance', () => {
    const heroes = new Map([
      ['Detective', hero('Detective', { initiative: 99 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Detective', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'p3', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 2 },
        { id: 'p4', playerId: 'g', heroClassCode: 'B', row: 1, pickOrder: 3 },
      ],
      heroes,
    });
    const det = state.units.find((unit) => unit.id === 'p1')!;
    det.lvl = 50; // 100% chance
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 2,
      targetId: 'p2',
    });
    expect(result.ok).toBe(true);
    expect(det.ultaCharges).toBe(1);
    const front = ['p2', 'p3'].map((id) => state.units.find((unit) => unit.id === id)!);
    const back = state.units.find((unit) => unit.id === 'p4')!;
    for (const foe of front) {
      const poison = foe.effects.find((effect) => effect.id === 'POISON');
      expect(poison).toBeTruthy();
      expect(poison!.rounds).toBe(1);
    }
    expect(back.effects.some((effect) => effect.id === 'POISON')).toBe(false);
  });

  test('Detective slot 4 grants CONTR that counters next hit', () => {
    const heroes = new Map([
      ['Detective', hero('Detective', { initiative: 99, accuracy: 100, luck: 0, damage: 40 })],
      ['B', hero('B', { initiative: 1, armor: 0, health: 400, accuracy: 100, luck: 0, damage: 25, dodge: 0 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Detective', row: 1, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const det = state.units.find((unit) => unit.id === 'p1')!;
    const foe = state.units.find((unit) => unit.id === 'p2')!;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const lunge = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
      targetId: 'p2',
    });
    expect(lunge.ok).toBe(true);
    const contr = det.effects.find((effect) => effect.id === 'CONTR');
    expect(contr).toBeTruthy();
    expect(contr!.rounds).toBe(2 + Math.floor(det.lvl / 6));
    // Гарантированный удар по детективу с CONTR → ответный удар.
    const foeHpBefore = foe.health;
    dealDamage(foe, det, { kind: 'melee', damageMult: 1, armorIgnore: 0, forceHit: true }, state);
    expect(state.log.some((line) => line.includes('контрударом'))).toBe(true);
    expect(foe.health).toBeLessThan(foeHpBefore);
  });

  test('Detective slot 3 spends ulta and grants INVISIBLE', () => {
    const heroes = new Map([
      ['Detective', hero('Detective', { initiative: 99 })],
      ['B', hero('B', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Detective', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const det = state.units.find((unit) => unit.id === 'p1')!;
    expect(det.ultaCharges).toBe(2);
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 3,
    });
    expect(result.ok).toBe(true);
    expect(det.ultaCharges).toBe(1);
    expect(det.effects.some((effect) => effect.id === 'INVISIBLE')).toBe(true);
  });

  test('GhostWarrior slot 1 hits harder with team graveyard', () => {
    const heroes = new Map([
      ['GhostWarrior', hero('GhostWarrior', { initiative: 99, luck: 0, damage: 30, accuracy: 100 })],
      ['B', hero('B', { initiative: 1, armor: 0, health: 400 })],
    ]);
    const mk = (graves: number) => {
      const state = createBattleState({
        matchId: 'm',
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'GhostWarrior', row: 0, pickOrder: 1 },
          { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes,
      });
      for (let i = 0; i < graves; i += 1) {
        state.graveyard.push({
          unitId: `dead-${i}`,
          team: 0,
          heroClassCode: 'Ally',
          displayName: 'Ally',
          forbiddenResurrect: false,
        });
      }
      const foe = state.units.find((unit) => unit.id === 'p2')!;
      foe.health = 400;
      state.activeUnitId = 'p1';
      state.turnPlayerId = 'h';
      applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        slot: 1,
        targetId: 'p2',
      });
      return 400 - (state.units.find((unit) => unit.id === 'p2')?.health ?? 400);
    };
    let empty = 0;
    let full = 0;
    for (let i = 0; i < 25; i += 1) {
      empty += mk(0);
      full += mk(2);
    }
    expect(full).toBeGreaterThan(empty);
  });

  test('Specter slot 3 Сглаз: MARKED + FATMAN на уклонение, не мораль', () => {
    const heroes = new Map([
      ['Specter', hero('Specter', { initiative: 99 })],
      ['B', hero('B', { initiative: 1, dodge: 40 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Specter', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const specter = state.units.find((unit) => unit.id === 'p1')!;
    specter.lvl = 5;
    const foe = state.units.find((unit) => unit.id === 'p2')!;
    const moraleBefore = foe.morale;
    const dodgeBefore = foe.dodge;
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
    expect(foe.effects.some((effect) => effect.id === 'MARKED')).toBe(true);
    const fatman = foe.effects.find((effect) => effect.id === 'FATMAN');
    expect(fatman?.power).toBe(15 + Math.floor(5 / 2));
    expect(fatman?.rounds).toBe(2 + Math.floor(5 / 7));
    expect(foe.dodge).toBe(dodgeBefore - (15 + Math.floor(5 / 2)));
    expect(foe.morale).toBe(moraleBefore);
  });
});
