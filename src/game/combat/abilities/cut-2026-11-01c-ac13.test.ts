import { describe, expect, test } from 'bun:test';

import { dealDamage, estimateDamageRange } from '../damage';
import { createBattleState } from '../engine';
import { ROW_BACK } from '../settings';
import type { HeroClassStats } from '../types';
import { listPilotAbilities } from './registry';
import { pyRound } from './abbess';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 200,
  damage: 40,
  armor: 10,
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

describe('CUT-2026-11-01c AC-13 damage preview', () => {
  test('fixture melee-preview: estimate совпадает с 20 фактическими ударами', () => {
    const state = createBattleState({
      matchId: 'ac13-melee-preview',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A', { damage: 40, accuracy: 100, luck: 0 })],
        ['B', hero('B', { armor: 10, dodge: 0, health: 5000 })],
      ]),
    });
    const atk = state.units.find((u) => u.id === 'p1')!;
    const def = state.units.find((u) => u.id === 'e1')!;
    def.health = 5000;
    def.maxHp = 5000;
    atk.critBank = 0;
    atk.luck = 0;

    const est = estimateDamageRange(atk, def, { kind: 'melee' });
    expect(est.blocked).toBe(false);
    expect(est.hitChance).toBe(100); // dodge 0, accuracy 100 → miss = 1+95-100 = −4 → 100%
    expect(est.minDamage).toBeLessThanOrEqual(est.maxDamage);

    const samples: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      def.health = 5000;
      const dealt = dealDamage(atk, def, { kind: 'melee', forceHit: true }, state);
      samples.push(dealt);
    }
    for (const dealt of samples) {
      expect(dealt).toBeGreaterThanOrEqual(est.minDamage);
      expect(dealt).toBeLessThanOrEqual(est.maxDamage);
    }
  });

  test('fixture low-damage: max < 10 помечается как низкий на клиенте (сервер даёт малые числа)', () => {
    const state = createBattleState({
      matchId: 'ac13-low-dmg',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A', { damage: 5, accuracy: 100 })],
        ['B', hero('B', { armor: 20, health: 200 })],
      ]),
    });
    const atk = state.units.find((u) => u.id === 'p1')!;
    const def = state.units.find((u) => u.id === 'e1')!;
    const est = estimateDamageRange(atk, def, { kind: 'melee' });
    // raw = max(1, round(5 - 20 + 0..2)) = 1
    expect(est.maxDamage).toBeLessThan(10);
    expect(est.minDamage).toBeGreaterThanOrEqual(0);
  });

  test('fixture abbess-heal-preview: power 49 → previewHeal 24–37', () => {
    const state = createBattleState({
      matchId: 'ac13-abbess-heal-preview',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Abbess', row: ROW_BACK, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Abbess', hero('Abbess', { power: 49, mana: 10, maxMana: 10, initiative: 99 })],
        ['Ally', hero('Ally')],
        ['B', hero('B')],
      ]),
    });
    const abbess = state.units.find((u) => u.id === 'p1')!;
    abbess.row = ROW_BACK;
    abbess.power = 49;
    abbess.mana = 10;
    const hand = listPilotAbilities(state, abbess).find((a) => a.slot === 2);
    expect(hand).toBeTruthy();
    expect(hand!.previewHealMin).toBe(pyRound(49 * 0.6)); // CUT-2026-11-09 AC-4
    expect(hand!.previewHealMax).toBe(pyRound(49 * 0.85)); // CUT-2026-11-09 AC-4
    expect(hand!.previewHealMin).toBe(29);
    expect(hand!.previewHealMax).toBe(42);
  });
});
