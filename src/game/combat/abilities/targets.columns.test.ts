import { describe, expect, test } from 'bun:test';

import { hasEffect } from '../effects';
import { createBattleState, meleeTargets } from '../engine';
import type { HeroClassStats } from '../types';
import { createSummon } from './summon';
import { weaponReachOf } from './targets';

const hero = (code: string, over: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 200,
  damage: 20,
  armor: 0,
  initiative: 10,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 20,
  mana: 5,
  maxMana: 5,
  gold: 0,
  size: 1,
  ...over,
});

describe('meleeTargets column reach (CUT T2)', () => {
  test('дистанция 1: соседняя колонка достижима при reach 1', () => {
    const state = createBattleState({
      matchId: 'col-adj',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'atk', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'e0', playerId: 'g', heroClassCode: 'E0', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'E1', row: 0, pickOrder: 2 },
      ],
      heroes: new Map([
        ['A', hero('A')],
        ['E0', hero('E0')],
        ['E1', hero('E1')],
      ]),
    });
    const atk = state.units.find((unit) => unit.id === 'atk')!;
    expect(weaponReachOf(atk)).toBe(1);
    const ids = meleeTargets(state, atk).map((unit) => unit.id);
    expect(ids).toContain('e0');
    expect(ids).toContain('e1');
  });

  test('блокировка юнитом между колонками при reach 1', () => {
    const state = createBattleState({
      matchId: 'col-block',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'atk', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'e0', playerId: 'g', heroClassCode: 'E0', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'E1', row: 0, pickOrder: 2 },
        { id: 'e2', playerId: 'g', heroClassCode: 'E2', row: 0, pickOrder: 3 },
      ],
      heroes: new Map([
        ['A', hero('A')],
        ['E0', hero('E0')],
        ['E1', hero('E1')],
        ['E2', hero('E2')],
      ]),
    });
    const atk = state.units.find((unit) => unit.id === 'atk')!;
    // atk col 0; e0=0, e1=1, e2=2 — e2 заблокирован e1
    const ids = meleeTargets(state, atk).map((unit) => unit.id);
    expect(ids).toContain('e0');
    expect(ids).toContain('e1');
    expect(ids).not.toContain('e2');
  });

  test('reach 2 (Knight): цель через одну колонку достижима', () => {
    const state = createBattleState({
      matchId: 'col-reach2',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'atk', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'e0', playerId: 'g', heroClassCode: 'E0', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'E1', row: 0, pickOrder: 2 },
        { id: 'e2', playerId: 'g', heroClassCode: 'E2', row: 0, pickOrder: 3 },
      ],
      heroes: new Map([
        ['Knight', hero('Knight')],
        ['E0', hero('E0')],
        ['E1', hero('E1')],
        ['E2', hero('E2')],
      ]),
    });
    const atk = state.units.find((unit) => unit.id === 'atk')!;
    expect(weaponReachOf(atk)).toBe(2);
    const ids = meleeTargets(state, atk).map((unit) => unit.id);
    expect(ids).toContain('e0');
    expect(ids).toContain('e1');
    expect(ids).toContain('e2');
  });

  test('мёртвые не блокируют колонку', () => {
    const state = createBattleState({
      matchId: 'col-dead',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'atk', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'e0', playerId: 'g', heroClassCode: 'E0', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'E1', row: 0, pickOrder: 2 },
        { id: 'e2', playerId: 'g', heroClassCode: 'E2', row: 0, pickOrder: 3 },
      ],
      heroes: new Map([
        ['A', hero('A')],
        ['E0', hero('E0')],
        ['E1', hero('E1')],
        ['E2', hero('E2')],
      ]),
    });
    const mid = state.units.find((unit) => unit.id === 'e1')!;
    mid.alive = false;
    mid.health = 0;
    const atk = state.units.find((unit) => unit.id === 'atk')!;
    const ids = meleeTargets(state, atk).map((unit) => unit.id);
    expect(ids).toContain('e0');
    expect(ids).toContain('e2');
    expect(ids).not.toContain('e1');
  });

  test('старый снимок без weaponReach: DemonLord → 2', () => {
    const state = createBattleState({
      matchId: 'col-legacy',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'atk', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 'e0', playerId: 'g', heroClassCode: 'E0', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['DemonLord', hero('DemonLord')],
        ['E0', hero('E0')],
      ]),
    });
    const atk = state.units.find((unit) => unit.id === 'atk')!;
    delete atk.weaponReach;
    expect(weaponReachOf(atk)).toBe(2);
  });

  test('GoldGolem в драфте получает REFLECTION на 6 раундов', () => {
    const state = createBattleState({
      matchId: 'golem-draft',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'g1', playerId: 'h', heroClassCode: 'GoldGolem', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'E', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['GoldGolem', hero('GoldGolem')],
        ['E', hero('E')],
      ]),
    });
    const golem = state.units.find((unit) => unit.id === 'g1')!;
    expect(hasEffect(golem, 'REFLECTION')).toBe(true);
    expect(golem.effects.find((effect) => effect.id === 'REFLECTION')?.rounds).toBe(6);
  });

  test('GoldGolem-саммон получает REFLECTION на 6 раундов', () => {
    const state = createBattleState({
      matchId: 'golem-summon',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'sum', playerId: 'h', heroClassCode: 'Summoner', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'E', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Summoner', hero('Summoner', { mana: 20 })],
        ['GoldGolem', hero('GoldGolem')],
        ['E', hero('E')],
      ]),
    });
    state.catalog.GoldGolem = hero('GoldGolem');
    const summoner = state.units.find((unit) => unit.id === 'sum')!;
    summoner.maxSummons = 2;
    const golem = createSummon(state, {
      summoner,
      heroCode: 'GoldGolem',
      row: 0,
    });
    expect(golem).not.toBeNull();
    expect(hasEffect(golem!, 'REFLECTION')).toBe(true);
    expect(golem!.effects.find((effect) => effect.id === 'REFLECTION')?.rounds).toBe(6);
  });
});
