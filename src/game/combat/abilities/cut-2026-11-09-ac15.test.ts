import { describe, expect, test } from 'bun:test';

import { grantEffect, delEffect } from '../effects';
import { createBattleState } from '../engine';
import { consumeSrcFactor } from '../resists';
import { applyCatalogStats } from '../transform';
import type { BattleState, BattleUnit, HeroClassStats } from '../types';
import { applyAbility } from './registry';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 180,
  damage: 20,
  armor: 5,
  initiative: 20,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 20,
  mana: 20,
  maxMana: 20,
  gold: 0,
  size: code === 'Dracolich' || code === 'DemonLord' ? 2 : 1,
  ...overrides,
});

function fight(pairs: ReadonlyArray<readonly [string, string, 0 | 1, number]>): BattleState {
  const heroes = new Map<string, HeroClassStats>();
  const picks = pairs.map(([id, code, team, row], index) => {
    heroes.set(code, hero(code, team === 0 ? { initiative: 90 } : { initiative: 1 }));
    return {
      id,
      playerId: team === 0 ? 'h' : 'g',
      heroClassCode: code,
      row,
      pickOrder: index + 1,
    };
  });
  return createBattleState({
    matchId: 'ac15',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks,
    heroes,
    rules: {
      maxTeamSize: 8,
      maxRowSize: 4,
      maxRounds: 20,
      healthBonus: 1,
      startingLevel: 1,
      fairEnabled: false,
      goldBonus: 1,
    },
  });
}

function unit(state: BattleState, id: string): BattleUnit {
  const found = state.units.find((item) => item.id === id);
  if (!found) {
    throw new Error(id);
  }
  return found;
}

describe('CUT-2026-11-09 AC-15', () => {
  test('бес дважды: потраченный вард Превращения Драколича не возвращается', () => {
    const state = fight([
      ['witch', 'Witch', 0, 0],
      ['drake', 'Dracolich', 1, 0],
    ]);
    heroesImp(state);
    const witch = unit(state, 'witch');
    const drake = unit(state, 'drake');
    state.activeUnitId = witch.id;
    state.turnPlayerId = witch.playerId;
    witch.mana = 20;
    expect(drake.resists.POLYMORPH?.wardCharges).toBe(1);
    consumeSrcFactor(drake, 'POLYMORPH');
    expect(drake.resists.POLYMORPH?.wardCharges).toBeUndefined();
    for (let i = 0; i < 2; i += 1) {
      witch.abilityCds = { ...(witch.abilityCds ?? {}), 5: 0 };
      witch.mana = 20;
      const cast = applyAbility(state, witch, { slot: 5, targetId: drake.id });
      expect(cast.status).toBe('done');
      expect(drake.heroClassCode).toBe('Imp');
      delEffect(drake, 'IMPISH', state);
      expect(drake.heroClassCode).toBe('Dracolich');
      expect(drake.resists.POLYMORPH?.wardCharges).toBeUndefined();
    }
  });

  test('заражение Зомби возвращает снимок, а не дефолтный вард', () => {
    const state = fight([
      ['drake', 'Dracolich', 0, 0],
      ['foe', 'Knight', 1, 0],
    ]);
    state.catalog.Zombie = hero('Zombie', { health: 80, damage: 12 });
    const drake = unit(state, 'drake');
    consumeSrcFactor(drake, 'POLYMORPH');
    drake.transformParentCode = 'Dracolich';
    expect(applyCatalogStats(state, drake, 'Zombie')).toBe(true);
    grantEffect(drake, 'INFECTED', 2, 0);
    delEffect(drake, 'INFECTED', state);
    expect(drake.heroClassCode).toBe('Dracolich');
    expect(drake.resists.POLYMORPH?.wardCharges).toBeUndefined();
  });

  test('Мимик: вард Смерти Ассасина не восстанавливается после облика', () => {
    const state = fight([
      ['ash', 'Assassin', 0, 0],
      ['foe', 'Knight', 1, 0],
    ]);
    const ash = unit(state, 'ash');
    state.activeUnitId = ash.id;
    state.turnPlayerId = ash.playerId;
    consumeSrcFactor(ash, 'DEATH');
    const cast = applyAbility(state, ash, { slot: 2, targetId: 'foe' });
    expect(cast.status).toBe('done');
    expect(ash.heroClassCode).toBe('Knight');
    delEffect(ash, 'POLYMORPH', state);
    expect(ash.heroClassCode).toBe('Assassin');
    expect(ash.resists.DEATH?.wardCharges).toBeUndefined();
    expect(ash.resists.DEATH?.value).toBe(35);
  });
});

function heroesImp(state: BattleState): void {
  state.catalog.Imp = hero('Imp', { displayName: 'Бес', health: 40, damage: 5, armor: 0 });
}
