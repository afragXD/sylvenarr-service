import { afterEach, describe, expect, spyOn, test } from 'bun:test';

import { dealDamage, randInt } from './damage';
import { createBattleState } from './engine';
import type { HeroClassStats } from './types';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 500,
  damage: 30,
  armor: 0,
  initiative: 40,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 20,
  mana: 0,
  gold: 100,
  size: 1,
  ...overrides,
});

afterEach(() => {
  (Math.random as unknown as { mockRestore?: () => void }).mockRestore?.();
});

describe('evade / luck как в боте', () => {
  test('accuracy 100 и dodge 0: промаха нет (даже на «высоком» броске)', () => {
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A', { initiative: 99, accuracy: 100, luck: 0 })],
        ['B', hero('B', { initiative: 1, dodge: 0 })],
      ]),
    });
    const attacker = state.units.find((unit) => unit.id === 'p1')!;
    const defender = state.units.find((unit) => unit.id === 'p2')!;
    // randInt(1,100) → 100: раньше это был «крит-промах» из-за капа 95%.
    spyOn(Math, 'random').mockReturnValue(0.999);
    const hp = defender.health;
    const dealt = dealDamage(attacker, defender, { kind: 'melee' }, state);
    expect(dealt).toBeGreaterThan(0);
    expect(defender.health).toBeLessThan(hp);
    expect(state.log.some((line) => /промах|критический провал/i.test(line))).toBe(false);
  });

  test('отрицательная удача: крит-провал отменяет удар по цели', () => {
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A', { initiative: 99, accuracy: 100, luck: -100 })],
        ['B', hero('B', { initiative: 1, dodge: 0 })],
      ]),
    });
    const attacker = state.units.find((unit) => unit.id === 'p1')!;
    const defender = state.units.find((unit) => unit.id === 'p2')!;
    const moraleBefore = attacker.morale;
    const foeHp = defender.health;
    // Сначала evade (missChance = 0+1+95-100 = -4 → не промах), затем luck fail (100%).
    spyOn(Math, 'random').mockReturnValue(0);
    const dealt = dealDamage(attacker, defender, { kind: 'melee' }, state);
    expect(dealt).toBe(0);
    expect(defender.health).toBe(foeHp);
    expect(attacker.morale).toBe(moraleBefore - 5);
    expect(state.log.some((line) => /критический провал/i.test(line))).toBe(true);
  });

  test('банк уклонений тратится и даёт промах', () => {
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A', { initiative: 99, accuracy: 100 })],
        ['B', hero('B', { initiative: 1, dodge: 0 })],
      ]),
    });
    const attacker = state.units.find((unit) => unit.id === 'p1')!;
    const defender = state.units.find((unit) => unit.id === 'p2')!;
    defender.dodgeBank = 1;
    const foeHp = defender.health;
    const dealt = dealDamage(attacker, defender, { kind: 'melee' }, state);
    expect(dealt).toBe(0);
    expect(defender.dodgeBank).toBe(0);
    expect(defender.health).toBe(foeHp);
    expect(state.log.some((line) => /мастерски уклоняется/i.test(line))).toBe(true);
  });

  test('randInt sanity', () => {
    expect(randInt(1, 1)).toBe(1);
  });
});
