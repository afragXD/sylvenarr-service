import { describe, expect, test } from 'bun:test';

import { dealDamage } from '../damage';
import { grantEffect } from '../effects';
import { applyAction, createBattleState } from '../engine';
import type { HeroClassStats } from '../types';
import { listPilotAbilities } from './registry';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 200,
  damage: 40,
  armor: 0,
  initiative: 40,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 40,
  mana: 15,
  maxMana: 15,
  gold: 100,
  size: 1,
  ...overrides,
});

describe('CUT-2026-11-01c AC-8 Dracolich', () => {
  test('fixture prayer: lvl 6 → +2 всей нежити включая себя, КД 2', () => {
    const state = createBattleState({
      matchId: 'ac8-prayer',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Dracolich', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Zombie', row: 0, pickOrder: 2 },
        { id: 'p3', playerId: 'h', heroClassCode: 'Knight', row: 1, pickOrder: 3 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Dracolich', hero('Dracolich')],
        ['Zombie', hero('Zombie')],
        ['Knight', hero('Knight')],
        ['B', hero('B')],
      ]),
    });
    const draco = state.units.find((u) => u.id === 'p1')!;
    const zombie = state.units.find((u) => u.id === 'p2')!;
    const knight = state.units.find((u) => u.id === 'p3')!;
    draco.lvl = 6;
    zombie.lvl = 3;
    knight.lvl = 4;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 3,
    });
    expect(result.ok).toBe(true);
    expect(draco.lvl).toBe(8); // +2
    expect(zombie.lvl).toBe(5);
    expect(knight.lvl).toBe(4); // не нежить
    expect(draco.abilityCds?.[3]).toBe(2);
  });

  test('fixture necro ×2 и skip второй цели', () => {
    const state = createBattleState({
      matchId: 'ac8-necro',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Dracolich', row: 0, pickOrder: 1 },
        { id: 'a1', playerId: 'h', heroClassCode: 'Archlich', row: 0, pickOrder: 2 },
        { id: 'a2', playerId: 'h', heroClassCode: 'Zombie', row: 1, pickOrder: 3 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Dracolich', hero('Dracolich')],
        ['Archlich', hero('Archlich')],
        ['Zombie', hero('Zombie')],
        ['B', hero('B')],
      ]),
    });
    const a1 = state.units.find((u) => u.id === 'a1')!;
    const a2 = state.units.find((u) => u.id === 'a2')!;
    a1.alive = false;
    a1.health = 0;
    a2.alive = false;
    a2.health = 0;
    state.graveyard.push(
      {
        unitId: 'a1',
        team: 0,
        heroClassCode: 'Archlich',
        displayName: 'Archlich',
        forbiddenResurrect: false,
      },
      {
        unitId: 'a2',
        team: 0,
        heroClassCode: 'Zombie',
        displayName: 'Zombie',
        forbiddenResurrect: false,
      }
    );
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    expect(
      applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        slot: 4,
      }).ok
    ).toBe(true);
    expect(state.pendingPrompt?.kind).toBe('dracolich_resurrect');
    expect(
      applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        choice: 'a1',
      }).ok
    ).toBe(true);
    expect(a1.alive).toBe(true);
    expect(state.pendingPrompt?.kind).toBe('dracolich_resurrect_2');
    expect(state.pendingPrompt?.options.map((o) => o.id)).toContain('skip');
    expect(state.pendingPrompt?.options.map((o) => o.id)).toContain('a2');
    expect(
      applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        choice: 'a2',
      }).ok
    ).toBe(true);
    expect(a2.alive).toBe(true);
    expect(state.pendingPrompt).toBeNull();
  });

  test('fixture necro: одна цель → после подъёма ход завершается без зависания', () => {
    const state = createBattleState({
      matchId: 'ac8-necro1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Dracolich', row: 0, pickOrder: 1 },
        { id: 'a1', playerId: 'h', heroClassCode: 'Zombie', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Dracolich', hero('Dracolich')],
        ['Zombie', hero('Zombie')],
        ['B', hero('B')],
      ]),
    });
    const a1 = state.units.find((u) => u.id === 'a1')!;
    a1.alive = false;
    a1.health = 0;
    state.graveyard.push({
      unitId: 'a1',
      team: 0,
      heroClassCode: 'Zombie',
      displayName: 'Zombie',
      forbiddenResurrect: false,
    });
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
    });
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      choice: 'a1',
    });
    expect(a1.alive).toBe(true);
    expect(state.pendingPrompt).toBeNull();
    expect(state.doneIds).toContain('p1');
  });

  test('fixture devour: MARKED броня 20→5; 19% казнь / 20% нет; CAPS; КД 3; FINALSTRIKE', () => {
    const state = createBattleState({
      matchId: 'ac8-devour',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Dracolich', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Dracolich', hero('Dracolich', { damage: 30, accuracy: 100, luck: 0 })],
        ['B', hero('B', { health: 100, armor: 20 })],
      ]),
    });
    const draco = state.units.find((u) => u.id === 'p1')!;
    const foe = state.units.find((u) => u.id === 'e1')!;
    foe.maxHp = 100;
    foe.health = 100;
    foe.armor = 20;

    // Метка: учитывается 5 брони (20 × 0.25).
    grantEffect(foe, 'MARKED', 2);
    const rawMarked = dealDamage(
      draco,
      foe,
      { kind: 'melee', damageMult: 1, armorIgnore: 0.75, forceHit: true },
      state
    );
    // Без метки armorIgnore 0 — броня 20 режет сильнее.
    foe.health = 100;
    const rawPlain = dealDamage(
      draco,
      foe,
      { kind: 'melee', damageMult: 1, armorIgnore: 0, forceHit: true },
      state
    );
    expect(rawMarked).toBeGreaterThan(rawPlain);

    // Тултип CAPS при цели < 20 %.
    foe.health = 19;
    foe.alive = true;
    let info = listPilotAbilities(state, draco).find((a) => a.slot === 5)!;
    expect(info.label).toContain('ЦЕЛЬ НИЖЕ 20 % ОЗ — СОЖРЁТ');

    foe.health = 20;
    info = listPilotAbilities(state, draco).find((a) => a.slot === 5)!;
    expect(info.label).toBe('Пожирание гада');

    // 19 % — казнь.
    foe.health = 19;
    foe.armor = 0;
    draco.damage = 1;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 5,
      targetId: 'e1',
    });
    expect(foe.alive).toBe(false);
    expect(draco.abilityCds?.[5]).toBe(3);

    // 20 % — без казни (отдельный бой).
    const state2 = createBattleState({
      matchId: 'ac8-devour20',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Dracolich', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Dracolich', hero('Dracolich', { damage: 1, accuracy: 100, luck: 0 })],
        ['B', hero('B', { health: 100, armor: 0 })],
      ]),
    });
    const foe2 = state2.units.find((u) => u.id === 'e1')!;
    foe2.maxHp = 100;
    foe2.health = 20;
    state2.activeUnitId = 'p1';
    state2.turnPlayerId = 'h';
    applyAction(state2, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 5,
      targetId: 'e1',
    });
    // Урон ~1–3 — цель жива (не казнь при ровно 20 %).
    expect(foe2.alive).toBe(true);
    expect(foe2.health).toBeGreaterThan(0);

    // FINALSTRIKE спасает от казни.
    const state3 = createBattleState({
      matchId: 'ac8-fs',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Dracolich', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Dracolich', hero('Dracolich', { damage: 1, accuracy: 100, luck: 0 })],
        ['B', hero('B', { health: 100, armor: 0 })],
      ]),
    });
    const foe3 = state3.units.find((u) => u.id === 'e1')!;
    foe3.maxHp = 100;
    foe3.health = 10;
    foe3.resists.FINALSTRIKE = { value: 0, wardCharges: 1 };
    state3.activeUnitId = 'p1';
    state3.turnPlayerId = 'h';
    applyAction(state3, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 5,
      targetId: 'e1',
    });
    expect(foe3.alive).toBe(true);
    expect(foe3.health).toBe(1);
  });

  test('fixture skip второго выбора некромантии', () => {
    const state = createBattleState({
      matchId: 'ac8-skip',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Dracolich', row: 0, pickOrder: 1 },
        { id: 'a1', playerId: 'h', heroClassCode: 'Zombie', row: 0, pickOrder: 2 },
        { id: 'a2', playerId: 'h', heroClassCode: 'Specter', row: 1, pickOrder: 3 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Dracolich', hero('Dracolich')],
        ['Zombie', hero('Zombie')],
        ['Specter', hero('Specter')],
        ['B', hero('B')],
      ]),
    });
    for (const id of ['a1', 'a2']) {
      const unit = state.units.find((u) => u.id === id)!;
      unit.alive = false;
      unit.health = 0;
      state.graveyard.push({
        unitId: id,
        team: 0,
        heroClassCode: unit.heroClassCode,
        displayName: unit.displayName,
        forbiddenResurrect: false,
      });
    }
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, { playerId: 'h', unitId: 'p1', action: 'ability', slot: 4 });
    applyAction(state, { playerId: 'h', unitId: 'p1', action: 'ability', choice: 'a1' });
    expect(state.pendingPrompt?.kind).toBe('dracolich_resurrect_2');
    applyAction(state, { playerId: 'h', unitId: 'p1', action: 'ability', choice: 'skip' });
    expect(state.pendingPrompt).toBeNull();
    expect(state.units.find((u) => u.id === 'a1')!.alive).toBe(true);
    expect(state.units.find((u) => u.id === 'a2')!.alive).toBe(false);
    expect(state.doneIds).toContain('p1');
  });
});
