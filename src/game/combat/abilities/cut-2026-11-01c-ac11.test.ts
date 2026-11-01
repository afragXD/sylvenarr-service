import { describe, expect, test } from 'bun:test';

import { applyAction, createBattleState } from '../engine';
import { setWard } from '../resists';
import { applyCatalogStats } from '../transform';
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

/** Порог Азарта: health < maxHp * 0.33 → +(14+L) пп. */
export function finishingCritBonus(lvl: number, health: number, maxHp: number): number {
  return maxHp > 0 && health < maxHp * 0.33 ? 14 + lvl : 0;
}

describe('CUT-2026-11-01c AC-11 Werewolf / Inquisitor', () => {
  test('fixture setWard: cumulative=false не копит; true копит', () => {
    const state = createBattleState({
      matchId: 'ac11-ward',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'C', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['B', hero('B')],
        ['C', hero('C')],
      ]),
    });
    const unit = state.units.find((u) => u.id === 'p1')!;
    setWard(unit, 'WEAPON', 1);
    setWard(unit, 'WEAPON', 1);
    expect(unit.resists.WEAPON?.wardCharges).toBe(1);
    setWard(unit, 'WEAPON', 1, true);
    expect(unit.resists.WEAPON?.wardCharges).toBe(2);
    setWard(unit, 'WEAPON', 1, true);
    expect(unit.resists.WEAPON?.wardCharges).toBe(3);
  });

  test('fixture moon-call: keepTurn, КД 4, кап 2 варда', () => {
    const state = createBattleState({
      matchId: 'ac11-moon',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Marauder', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Marauder', hero('Marauder')],
        ['Werewolf', hero('Werewolf', { health: 150, damage: 25 })],
        ['B', hero('B')],
      ]),
    });
    const wolf = state.units.find((u) => u.id === 'p1')!;
    wolf.transformParentCode = 'Marauder';
    applyCatalogStats(state, wolf, 'Werewolf');
    wolf.resists.WEAPON = undefined;
    wolf.abilityCds = {};

    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const first = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 5,
    });
    expect(first.ok).toBe(true);
    expect(wolf.resists.WEAPON?.wardCharges).toBe(1);
    expect(wolf.abilityCds?.[5]).toBe(4);
    // Ход не потрачен — всё ещё активен.
    expect(state.activeUnitId).toBe('p1');
    expect(state.doneIds.includes('p1')).toBe(false);

    // КД блокирует сразу.
    const blocked = listPilotAbilities(state, wolf).find((a) => a.slot === 5)!;
    expect(blocked.disabledReason).toContain('Кулдаун');

    // Симулируем 4 тика КД и второй/третий зов.
    wolf.abilityCds = {};
    applyAction(state, { playerId: 'h', unitId: 'p1', action: 'ability', slot: 5 });
    expect(wolf.resists.WEAPON?.wardCharges).toBe(2);
    expect(state.activeUnitId).toBe('p1');

    wolf.abilityCds = {};
    applyAction(state, { playerId: 'h', unitId: 'p1', action: 'ability', slot: 5 });
    expect(wolf.resists.WEAPON?.wardCharges).toBe(2); // кап Р-3
  });

  test('fixture azart: 32% → +19 при L5; 33% → 0', () => {
    expect(finishingCritBonus(5, 32, 100)).toBe(19);
    expect(finishingCritBonus(5, 33, 100)).toBe(0);
    expect(finishingCritBonus(5, 32.9, 100)).toBe(19);

    const state = createBattleState({
      matchId: 'ac11-azart',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Inquisitor', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Inquisitor', hero('Inquisitor', { luck: 0, accuracy: 100 })],
        ['B', hero('B', { health: 100, armor: 0 })],
      ]),
    });
    const inq = state.units.find((u) => u.id === 'p1')!;
    const foe = state.units.find((u) => u.id === 'e1')!;
    inq.lvl = 5;
    foe.maxHp = 100;
    foe.health = 32;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 1,
      targetId: 'e1',
    });
    expect(state.log.some((line) => line.includes('азарт добивания (+19 пп крита'))).toBe(
      true
    );

    const state2 = createBattleState({
      matchId: 'ac11-azart33',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Inquisitor', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Inquisitor', hero('Inquisitor', { luck: 0, accuracy: 100 })],
        ['B', hero('B', { health: 100, armor: 0 })],
      ]),
    });
    const inq2 = state2.units.find((u) => u.id === 'p1')!;
    const foe2 = state2.units.find((u) => u.id === 'e1')!;
    inq2.lvl = 5;
    foe2.maxHp = 100;
    foe2.health = 33;
    state2.activeUnitId = 'p1';
    state2.turnPlayerId = 'h';
    applyAction(state2, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 1,
      targetId: 'e1',
    });
    expect(state2.log.some((line) => line.includes('азарт добивания'))).toBe(false);
  });
});
