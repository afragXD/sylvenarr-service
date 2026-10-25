import { describe, expect, test } from 'bun:test';

import {
  advanceToNextUnit,
  applyAction,
  buildTurnOrder,
  createBattleState,
  forceDraw,
  forceSurrender,
  resolveOutcome,
  toBattleSummary,
} from './engine';
import { grantEffect } from './effects';
import type { HeroClassStats } from './types';

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

const catalogHeroes = (...entries: HeroClassStats[]) => {
  const map = new Map(entries.map((item) => [item.code, item]));
  for (const code of [
    'GoblinShaman',
    'GoblinTrapper',
    'Zombie',
    'SkeletonChampion',
    'GhostWarrior',
    'EvilTree',
  ]) {
    if (!map.has(code)) {
      map.set(code, hero(code, { health: 60, damage: 10, initiative: 20 }));
    }
  }
  return map;
};

describe('combat engine', () => {
  test('creates units and picks first actor', () => {
    const heroes = catalogHeroes(hero('A', { initiative: 50 }), hero('B', { initiative: 10 }));
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    expect(state.units).toHaveLength(2);
    expect(state.activeUnitId).toBeTruthy();
    expect(state.outcome).toBe('ongoing');
    expect(state.pendingPrompt).toBeNull();
  });

  test('attack can finish the battle', () => {
    const heroes = catalogHeroes(
      hero('A', { damage: 200, initiative: 99, accuracy: 100, luck: 0 }),
      hero('B', { health: 10, initiative: 1 })
    );
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'attack',
      targetId: 'p2',
    });
    expect(result.ok).toBe(true);
    expect(
      state.outcome === 'host_win' || state.units.find((u) => u.id === 'p2')?.alive === false
    ).toBe(true);
  });

  test('Knight ability slot 2 pierces back row', () => {
    const heroes = catalogHeroes(
      hero('Knight', { damage: 30, initiative: 99, accuracy: 100, luck: 0 }),
      hero('B', { health: 80, initiative: 1 })
    );
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 1, pickOrder: 1 },
        { id: 'p3', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 2 },
      ],
      heroes,
    });
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
    const back = state.units.find((unit) => unit.id === 'p2');
    expect(back && back.health < back.maxHp).toBe(true);
  });

  test('Knight slot 2 rejected when horse is dead', () => {
    const heroes = catalogHeroes(
      hero('Knight', { initiative: 99 }),
      hero('B', { initiative: 1 })
    );
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const knight = state.units.find((unit) => unit.id === 'p1');
    if (!knight) {
      throw new Error('missing knight');
    }
    knight.horseIsDead = true;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 2,
      targetId: 'p2',
    });
    expect(result.ok).toBe(false);
    expect(state.doneIds.includes('p1')).toBe(false);
  });

  test('OrcKing summon prompt flow', () => {
    const heroes = catalogHeroes(
      hero('OrcKing', { initiative: 99 }),
      hero('B', { initiative: 1 })
    );
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
    const start = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 2,
    });
    expect(start.ok).toBe(true);
    expect(state.pendingPrompt?.kind).toBe('orc_goblin_type');
    expect(state.doneIds.includes('p1')).toBe(false);

    const typeChoice = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      choice: 'shaman',
    });
    expect(typeChoice.ok).toBe(true);
    expect(state.pendingPrompt?.kind).toBe('orc_goblin_row');

    const rowChoice = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      choice: '1',
    });
    expect(rowChoice.ok).toBe(true);
    expect(state.pendingPrompt).toBeNull();
    expect(state.units.some((unit) => unit.isSummon && unit.heroClassCode === 'GoblinShaman')).toBe(
      true
    );
  });

  test('effect tick damages and expires', () => {
    const heroes = catalogHeroes(hero('A', { initiative: 99 }), hero('B', { initiative: 1 }));
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const unit = state.units.find((item) => item.id === 'p1');
    if (!unit) {
      throw new Error('missing unit');
    }
    const before = unit.health;
    // power — множитель дота (формула бота: (4–6 + rounds×6) × power).
    grantEffect(unit, 'POISON', 1, 1.2);
    state.doneIds = ['p2'];
    state.delayedIds = [];
    state.preChoiceDoneIds = [];
    advanceToNextUnit(state);
    // DoT наносит урон в начале хода, но эффект спадает только в конце хода.
    expect(unit.health).toBeLessThan(before);
    expect(unit.effects.some((effect) => effect.id === 'POISON')).toBe(true);
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'defend',
    });
    expect(result.ok).toBe(true);
    expect(unit.effects.some((effect) => effect.id === 'POISON')).toBe(false);
  });

  test('summary exposes pilot abilities', () => {
    const heroes = catalogHeroes(
      hero('Archlich', { initiative: 99, mana: 12 }),
      hero('B', { initiative: 1 })
    );
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Archlich', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const summary = toBattleSummary(state);
    expect(summary.abilities).toHaveLength(5);
    expect(summary.abilities[0]?.slot).toBe(1);
  });

  test('resolveOutcome draw when both dead', () => {
    const heroes = catalogHeroes(hero('A'));
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'A', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    for (const unit of state.units) {
      unit.alive = false;
      unit.health = 0;
    }
    resolveOutcome(state);
    expect(state.outcome).toBe('draw');
  });

  test('second wait in delayed phase advances round', () => {
    const heroes = catalogHeroes(hero('A', { initiative: 50 }), hero('B', { initiative: 10 }));
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    expect(state.stage).toBe(1);

    // First pass: both wait → enter delayed phase
    for (let i = 0; i < 2; i++) {
      const actorId = state.activeUnitId;
      const playerId = state.turnPlayerId;
      expect(actorId).toBeTruthy();
      expect(playerId).toBeTruthy();
      const result = applyAction(state, {
        playerId: playerId!,
        unitId: actorId!,
        action: 'wait',
      });
      expect(result.ok).toBe(true);
    }
    expect(state.delayedPhase).toBe(true);
    expect(state.stage).toBe(1);

    // Second pass: both wait again → new round
    for (let i = 0; i < 2; i++) {
      const actorId = state.activeUnitId;
      const playerId = state.turnPlayerId;
      expect(actorId).toBeTruthy();
      expect(playerId).toBeTruthy();
      const result = applyAction(state, {
        playerId: playerId!,
        unitId: actorId!,
        action: 'wait',
      });
      expect(result.ok).toBe(true);
    }
    expect(state.stage).toBe(2);
    expect(state.log.some((line) => line === 'Раунд 2.')).toBe(true);
    expect(state.delayedPhase).toBe(false);
    expect(state.outcome).toBe('ongoing');
  });

  test('buildTurnOrder is round timeline: acted before active', () => {
    const heroes = catalogHeroes(
      hero('A', { initiative: 40 }),
      hero('B', { initiative: 30 }),
      hero('C', { initiative: 20 })
    );
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'p3', playerId: 'g', heroClassCode: 'C', row: 1, pickOrder: 2 },
      ],
      heroes,
    });
    state.activeUnitId = 'p2';
    state.doneIds = ['p1'];
    state.delayedIds = ['p3'];
    state.units.find((unit) => unit.id === 'p3')!.alive = true;

    const order = buildTurnOrder(state);
    const phases = order.map((entry) => entry.phase);
    const ids = order.map((entry) => entry.unitId);

    expect(phases).toEqual(['acted', 'active', 'delayed']);
    expect(ids.indexOf('p1')).toBeLessThan(ids.indexOf('p2'));
    expect(ids.indexOf('p2')).toBeLessThan(ids.indexOf('p3'));
    expect(order.find((entry) => entry.unitId === 'p2')?.isActive).toBe(true);
    expect(order.find((entry) => entry.unitId === 'p1')?.phase).toBe('acted');
    expect(order.find((entry) => entry.unitId === 'p3')?.phase).toBe('delayed');
  });

  test('buildTurnOrder excludes dead units', () => {
    const heroes = catalogHeroes(hero('A', { initiative: 50 }), hero('B', { initiative: 10 }));
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    state.activeUnitId = 'p1';
    const foe = state.units.find((unit) => unit.id === 'p2')!;
    foe.alive = false;
    foe.health = 0;

    const order = buildTurnOrder(state);
    expect(order.some((entry) => entry.unitId === 'p2')).toBe(false);
    expect(order[0]?.unitId).toBe('p1');
    expect(order[0]?.phase).toBe('active');
  });

  test('startingLevel applies level-ups at battle start', () => {
    const heroes = catalogHeroes(hero('A', { initiative: 50 }), hero('B', { initiative: 10 }));
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
      rules: {
        maxTeamSize: 6,
        maxRowSize: 3,
        maxRounds: 20,
        healthBonus: 0.5,
        startingLevel: 5,
      },
    });
    expect(state.units.every((unit) => unit.lvl === 5)).toBe(true);
  });

  test('forceSurrender awards win to opponent', () => {
    const heroes = catalogHeroes(hero('A'), hero('B'));
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    forceSurrender(state, 'h');
    expect(state.outcome).toBe('guest_win');
    expect(state.winnerPlayerId).toBe('g');
  });

  test('forceDraw ends as draw and clears offer', () => {
    const heroes = catalogHeroes(hero('A'), hero('B'));
    const state = createBattleState({
      matchId: 'm1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    state.drawOfferByPlayerId = 'h';
    forceDraw(state);
    expect(state.outcome).toBe('draw');
    expect(state.winnerPlayerId).toBeNull();
    expect(state.drawOfferByPlayerId).toBeNull();
  });

  test('wait does not re-tick ability CD or DoT in the same round', () => {
    const heroes = catalogHeroes(
      hero('Paladin', { initiative: 99, mana: 10 }),
      hero('B', { initiative: 1, health: 300 }),
    );
    const state = createBattleState({
      matchId: 'm-wait-cd',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Paladin', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const paladin = state.units.find((unit) => unit.id === 'p1')!;
    expect(state.activeUnitId).toBe('p1');
    expect(state.preChoiceDoneIds.includes('p1')).toBe(true);

    // После preChoice в этом заходе хода: КД=1 остался, DoT уже тикнул.
    paladin.soulShatterCd = 1;
    grantEffect(paladin, 'POISON', 5, 1);
    paladin.wasEffected = true;
    const hpBeforeWait = paladin.health;

    expect(applyAction(state, { playerId: 'h', unitId: 'p1', action: 'wait' }).ok).toBe(true);
    expect(applyAction(state, { playerId: 'g', unitId: 'p2', action: 'wait' }).ok).toBe(true);

    expect(state.delayedPhase).toBe(true);
    expect(state.activeUnitId).toBe('p1');
    expect(state.preChoiceDoneIds.includes('p1')).toBe(true);
    expect(paladin.soulShatterCd).toBe(1);
    expect(paladin.wasEffected).toBe(true);
    expect(paladin.health).toBe(hpBeforeWait);
  });
});
