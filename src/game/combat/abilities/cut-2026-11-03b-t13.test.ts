import { describe, expect, test } from 'bun:test';
import { itemCount } from '../../items/inventory';
import { hasEffect } from '../effects';
import { applyAction, createBattleState } from '../engine';
import type { BattleRules, HeroClassStats } from '../types';
import { isStealBlockedByFair } from './detective';

const hero = (code: string, extra: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 200,
  damage: 20,
  armor: 0,
  initiative: 40,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 20,
  mana: 20,
  maxMana: 20,
  gold: 100,
  size: 1,
  ...extra,
});

const baseRules = (fairEnabled: boolean, extra: Partial<BattleRules> = {}): BattleRules => ({
  maxTeamSize: 8,
  maxRowSize: 4,
  maxRounds: 40,
  healthBonus: 1,
  startingLevel: 1,
  fairEnabled,
  fairFrequency: 5,
  shopSize: 8,
  goldBonus: 1,
  ...extra,
});

function battle(
  host: string,
  guest: string,
  fairEnabled: boolean,
  extraRules: Partial<BattleRules> = {}
) {
  const state = createBattleState({
    matchId: `t13-${host}`,
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      { id: 'h1', playerId: 'h', heroClassCode: host, row: 0, pickOrder: 1 },
      { id: 'g1', playerId: 'g', heroClassCode: guest, row: 0, pickOrder: 1 },
    ],
    heroes: new Map([
      [host, hero(host, { initiative: 50 })],
      [guest, hero(guest, { initiative: 5 })],
    ]),
    rules: baseRules(fairEnabled, extraRules),
  });
  if (state.phase === 'perks' && state.perkOffers) {
    for (const offer of state.perkOffers) {
      applyAction(state, {
        playerId: offer.playerId,
        unitId: offer.unitId,
        action: 'perk_skip',
      });
    }
  }
  state.phase = 'combat';
  state.perkOffers = null;
  state.fair = null;
  if (state.teams) {
    state.teams[0]!.inventory = [];
    state.teams[1]!.inventory = [];
  }
  return state;
}

describe('CUT-2026-11-03b T13 ability↔items', () => {
  test('Herbalist slot 4: off — хил; on — крафт из пула', () => {
    const off = battle('Herbalist', 'Assassin', false);
    const herbOff = off.units.find((u) => u.heroClassCode === 'Herbalist')!;
    herbOff.health = herbOff.maxHp - 20;
    off.activeUnitId = herbOff.id;
    off.turnPlayerId = 'h';
    const hpBefore = herbOff.health;
    expect(
      applyAction(off, {
        playerId: 'h',
        unitId: herbOff.id,
        action: 'ability',
        slot: 4,
      }).ok
    ).toBe(true);
    expect(herbOff.health).toBeGreaterThan(hpBefore);
    expect(itemCount(off, 0, 237) + itemCount(off, 0, 147)).toBe(0);

    const on = battle('Herbalist', 'Assassin', true);
    const herb = on.units.find((u) => u.heroClassCode === 'Herbalist')!;
    herb.lvl = 10;
    on.activeUnitId = herb.id;
    on.turnPlayerId = 'h';
    const invBefore = on.teams![0]!.inventory.length;
    // randInt(0,7)=0 → код 237
    const rnd = Math.random;
    Math.random = () => 0;
    try {
      expect(
        applyAction(on, {
          playerId: 'h',
          unitId: herb.id,
          action: 'ability',
          slot: 4,
        }).ok
      ).toBe(true);
    } finally {
      Math.random = rnd;
    }
    expect(on.teams![0]!.inventory.length).toBe(invBefore + 1);
    expect(itemCount(on, 0, 237)).toBe(1);
  });

  test('Herbalist slot 4 on: код 0 — неудача без предмета', () => {
    const on = battle('Herbalist', 'Assassin', true);
    const herb = on.units.find((u) => u.heroClassCode === 'Herbalist')!;
    on.activeUnitId = herb.id;
    on.turnPlayerId = 'h';
    // индекс 5 → 0 в пуле: floor(r*8)=5 → r=5/8
    const rnd = Math.random;
    Math.random = () => 5 / 8;
    try {
      expect(
        applyAction(on, {
          playerId: 'h',
          unitId: herb.id,
          action: 'ability',
          slot: 4,
        }).ok
      ).toBe(true);
    } finally {
      Math.random = rnd;
    }
    expect(on.teams![0]!.inventory.length).toBe(0);
    expect(on.log.some((l) => l.includes('мутное варево'))).toBe(true);
  });

  test('Demiurge slot 5: off — без предмета; on — предмет по тиру', () => {
    const off = battle('Demiurge', 'Assassin', false);
    const dOff = off.units.find((u) => u.heroClassCode === 'Demiurge')!;
    dOff.mana = 20;
    dOff.lvl = 5;
    off.activeUnitId = dOff.id;
    off.turnPlayerId = 'h';
    expect(
      applyAction(off, {
        playerId: 'h',
        unitId: dOff.id,
        action: 'ability',
        slot: 5,
      }).ok
    ).toBe(true);
    expect(off.teams![0]!.inventory.length).toBe(0);
    expect(off.log.some((l) => l.includes('философский камень'))).toBe(true); // CUT-2026-11-09 AC-10

    const on = battle('Demiurge', 'Assassin', true);
    const d = on.units.find((u) => u.heroClassCode === 'Demiurge')!;
    d.mana = 20;
    d.lvl = 5;
    on.activeUnitId = d.id;
    on.turnPlayerId = 'h';
    expect(
      applyAction(on, {
        playerId: 'h',
        unitId: d.id,
        action: 'ability',
        slot: 5,
      }).ok
    ).toBe(true);
    expect(on.teams![0]!.inventory.length).toBe(1);
    expect(on.log.some((l) => l.includes('создаёт'))).toBe(true);
  });

  test('Detective slot 2: off — яд ряда; on — prompt; кража; блок у ярмарки', () => {
    const off = battle('Detective', 'Assassin', false);
    const detOff = off.units.find((u) => u.heroClassCode === 'Detective')!;
    const enemy = off.units.find((u) => u.team === 1)!;
    detOff.ultaCharges = 2;
    off.activeUnitId = detOff.id;
    off.turnPlayerId = 'h';
    expect(
      applyAction(off, {
        playerId: 'h',
        unitId: detOff.id,
        action: 'ability',
        slot: 2,
        targetId: enemy.id,
      }).ok
    ).toBe(true);
    expect(off.pendingPrompt).toBeNull();

    const on = battle('Detective', 'Assassin', true);
    const det = on.units.find((u) => u.heroClassCode === 'Detective')!;
    det.ultaCharges = 2;
    det.lvl = 10;
    on.teams![1]!.inventory = [237, 237, 147];
    on.stage = 3; // 3 % 5 = 3 — не блок
    on.activeUnitId = det.id;
    on.turnPlayerId = 'h';
    expect(isStealBlockedByFair(on)).toBe(false);
    expect(
      applyAction(on, {
        playerId: 'h',
        unitId: det.id,
        action: 'ability',
        slot: 2,
      }).ok
    ).toBe(true);
    expect(on.pendingPrompt?.kind).toBe('detective_diversion');
    expect(on.pendingPrompt?.options.some((o) => o.id === 'steal:237')).toBe(true);
    expect(on.pendingPrompt?.options.some((o) => o.id === 'poison')).toBe(true);

    const rnd = Math.random;
    Math.random = () => 0; // успех кражи
    try {
      expect(
        applyAction(on, {
          playerId: 'h',
          unitId: det.id,
          action: 'ability',
          slot: 2,
          choice: 'steal:237',
        }).ok
      ).toBe(true);
    } finally {
      Math.random = rnd;
    }
    expect(itemCount(on, 0, 237)).toBe(1);
    expect(itemCount(on, 1, 237)).toBe(1);

    // блок у ярмарки: stage % 5 ∈ {0,1,4}
    on.stage = 5;
    expect(isStealBlockedByFair(on)).toBe(true);
    on.activeUnitId = det.id;
    on.turnPlayerId = 'h';
    expect(
      applyAction(on, {
        playerId: 'h',
        unitId: det.id,
        action: 'ability',
        slot: 2,
      }).ok
    ).toBe(true);
    // После кражи prompt сброшен; новый вызов у ярмарки — без steal:*.
    const nearFairPrompt = on.pendingPrompt;
    expect(nearFairPrompt).toBeTruthy();
    expect(nearFairPrompt && nearFairPrompt.options.every((o) => !o.id.startsWith('steal:'))).toBe(
      true
    );
  });

  test('Detective on: отравить отряд через prompt', () => {
    const on = battle('Detective', 'Assassin', true);
    const det = on.units.find((u) => u.heroClassCode === 'Detective')!;
    const enemy = on.units.find((u) => u.team === 1)!;
    det.ultaCharges = 2;
    on.stage = 3;
    on.activeUnitId = det.id;
    on.turnPlayerId = 'h';
    applyAction(on, { playerId: 'h', unitId: det.id, action: 'ability', slot: 2 });
    expect(
      applyAction(on, {
        playerId: 'h',
        unitId: det.id,
        action: 'ability',
        slot: 2,
        choice: 'poison',
      }).ok
    ).toBe(true);
    expect(det.ultaCharges).toBe(1);
    expect(hasEffect(enemy, 'POISON')).toBe(true);
  });
});
