import { describe, expect, test } from 'bun:test';

import { dealDamage } from './damage';
import { resistsForClass } from './defaultResists';
import {
  applyResistMultiplier,
  changeResist,
  setImmunity,
  setWard,
  summarizeResists,
} from './resists';
import type { BattleState, BattleUnit } from './types';

const unit = (overrides: Partial<BattleUnit> = {}): BattleUnit => ({
  id: 'u1',
  playerId: 'p',
  team: 0,
  heroClassCode: 'A',
  displayName: 'Цель',
  row: 0,
  column: 0,
  maxHp: 200,
  health: 200,
  damage: 20,
  armor: 0,
  initiative: 10,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  attackStyle: 'melee',
  power: 10,
  mana: 0,
  gold: 0,
  lvl: 1,
  defending: false,
  alive: true,
  effects: [],
  resists: {},
  isSummon: false,
  summonerId: null,
  horseIsDead: false,
  authority: 0,
  maxSummons: 0,
  cumRage: 0,
  lichGrade: 0,
  isLichSummon: false,
  ultaCharges: 0,
  darts: 0,
  deathNote: 0,
  deathNoteCd: 0,
  gun: 0,
  forbiddenResurrect: false,
  polymorphSavedArmor: -1,
  transformParentCode: null,
  critBank: 0,
  enslavedOriginTeam: null,
  enslavedOriginPlayerId: null,
  ...overrides,
});

const emptyState = (): BattleState =>
  ({
    log: [],
    units: [],
    graveyard: [],
  }) as unknown as BattleState;

describe('ResistManager', () => {
  test('positive resist reduces damage', () => {
    const defender = unit({ resists: { WEAPON: { value: 50 } } });
    const attacker = unit({
      id: 'a',
      displayName: 'Атак',
      damage: 40,
      accuracy: 100,
      luck: 0,
    });
    const before = defender.health;
    const dmg = dealDamage(attacker, defender, {
      damageMult: 1,
      armorIgnore: 1,
      forceHit: true,
    });
    expect(dmg).toBeGreaterThan(0);
    expect(before - defender.health).toBe(dmg);
    expect(dmg).toBeLessThanOrEqual(Math.round(40 * 0.5) + 5);
  });

  test('negative resist amplifies damage', () => {
    const defender = unit({ resists: { FIRE: { value: -50 } } });
    const attacker = unit({
      id: 'a',
      displayName: 'Маг',
      attackStyle: 'magic',
      power: 40,
      accuracy: 100,
      luck: 0,
    });
    const applied = applyResistMultiplier(defender, 'FIRE');
    expect(applied.multiplier).toBe(1.5);
  });

  test('ward zeroes damage and spends charge', () => {
    const defender = unit({ resists: { WEAPON: { value: 0, wardCharges: 1 } } });
    const attacker = unit({
      id: 'a',
      displayName: 'Атак',
      damage: 40,
      accuracy: 100,
      luck: 0,
    });
    const state = emptyState();
    const dmg = dealDamage(
      attacker,
      defender,
      { damageMult: 1, armorIgnore: 1, forceHit: true },
      state
    );
    expect(dmg).toBe(0);
    expect(defender.health).toBe(200);
    expect(defender.resists.WEAPON?.wardCharges).toBeUndefined();
    expect(state.log.some((line) => line.includes('вард'))).toBe(true);
  });

  test('immunity stably blocks', () => {
    const defender = unit();
    setImmunity(defender, 'DEATH');
    const first = applyResistMultiplier(defender, 'DEATH');
    const second = applyResistMultiplier(defender, 'DEATH');
    expect(first.multiplier).toBe(0);
    expect(second.multiplier).toBe(0);
    expect(first.blocked).toBe(true);
  });

  test('changeResist and defaults', () => {
    const ghost = unit({ resists: resistsForClass('GhostWarrior') });
    expect(ghost.resists.DEATH?.value).toBe(85);
    changeResist(ghost, 'WEAPON', 10);
    expect(ghost.resists.WEAPON?.value).toBe(30);
    setWard(ghost, 'ARROWS', 2);
    const rows = summarizeResists(ghost);
    expect(rows.some((row) => row.source === 'ARROWS' && row.wardCharges === 2)).toBe(true);
  });

  test('Ectoplasm weapon ward from defaults', () => {
    const ecto = unit({
      displayName: 'Эктоплазма',
      resists: resistsForClass('Ectoplasm'),
    });
    const attacker = unit({
      id: 'a',
      damage: 30,
      accuracy: 100,
      luck: 0,
    });
    const state = emptyState();
    expect(
      dealDamage(attacker, ecto, { damageMult: 1, armorIgnore: 1, forceHit: true }, state)
    ).toBe(0);
    expect(
      dealDamage(attacker, ecto, { damageMult: 1, armorIgnore: 1, forceHit: true }, state)
    ).toBeGreaterThan(0);
  });
});
