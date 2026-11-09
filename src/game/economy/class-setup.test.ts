import { describe, expect, test } from 'bun:test';

import { createBattleState } from '../combat/engine';
import { levelUpUnit } from '../combat/level';
import type { HeroClassStats } from '../combat/types';
import { getItem } from '../items/catalog';
import { itemCount, teamInventory } from '../items/inventory';
import { expectedClassPerks } from './class-setup';

const hero = (code: string, extra: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 200,
  damage: 20,
  armor: 10,
  initiative: 10,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 20,
  mana: 10,
  maxMana: 10,
  gold: 100,
  size: 1,
  ...extra,
});

const SPECIAL_CLASSES = [
  'Pyro',
  'Specter',
  'Witch',
  'Oracle',
  'OrcKing',
  'Knight',
  'Archlich',
  'Marauder',
  'DemonLord',
  'Abbess',
  'Detective',
] as const;

const INVENTORY_CLASSES = [
  'Assassin',
  'Abbess',
  'DemonLord',
  'Detective',
  'EvilTree',
  'Herbalist',
  'Inquisitor',
  'Archlich',
  'Marauder',
  'Oracle',
  'OrcKing',
  'Paladin',
  'Witch',
] as const;

function battle(
  classCode: string,
  opts?: { fairEnabled?: boolean; startingLevel?: number; foe?: string }
) {
  const foeCode = opts?.foe ?? (classCode === 'Assassin' ? 'Knight' : 'Assassin');
  const heroes = new Map<string, HeroClassStats>([
    [classCode, hero(classCode, { initiative: 20 })],
    [foeCode, hero(foeCode, { initiative: 5 })],
    ['Knight', hero('Knight')],
    ['Angel', hero('Angel')],
    ...SPECIAL_CLASSES.map((c) => [c, hero(c)] as const),
    ...INVENTORY_CLASSES.map((c) => [c, hero(c)] as const),
  ]);
  const state = createBattleState({
    matchId: `t10-${classCode}`,
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      { id: 'h1', playerId: 'h', heroClassCode: classCode, row: 0, pickOrder: 1 },
      { id: 'g1', playerId: 'g', heroClassCode: foeCode, row: 0, pickOrder: 1 },
    ],
    heroes,
    rules: {
      maxTeamSize: 8,
      maxRowSize: 4,
      maxRounds: 20,
      healthBonus: 1,
      startingLevel: opts?.startingLevel ?? 1,
      fairEnabled: opts?.fairEnabled ?? true,
      goldBonus: 1,
    },
  });
  const unit = state.units.find((u) => u.heroClassCode === classCode)!;
  return { state, unit };
}

describe('class economy setup (T10)', () => {
  test('при fairEnabled false перки и инвентарь не выдаются', () => {
    const { state, unit } = battle('Witch', { fairEnabled: false });
    expect(unit.perks ?? []).toEqual([]);
    expect(unit.merchant).toBeUndefined();
    expect(unit.develop).toBeUndefined();
    expect(teamInventory(state, unit.team)).toEqual([]);
  });

  test('базово MISC, merchant 0, develop 6', () => {
    const { unit } = battle('Angel');
    expect(unit.perks).toEqual(['MISC']);
    expect(unit.merchant).toBe(0);
    expect(unit.develop).toBe(6);
  });

  test('классовые перки и навыки по таблице', () => {
    expect(expectedClassPerks('Pyro')).toEqual(['MISC', 'TECHNO']);
    expect(expectedClassPerks('Specter')).toEqual(['MISC', 'BONUS_MOVEMENT']);
    expect(expectedClassPerks('Witch')).toEqual(['TECHNO', 'TALISMANS']);
    expect(expectedClassPerks('Oracle')).toEqual(['MISC', 'SCROLLS']);
    expect(expectedClassPerks('OrcKing')).toEqual(['MISC', 'MILITARY']);
    expect(expectedClassPerks('Knight')).toEqual(['MISC', 'LOWHP_EXTRATURN']);
    expect(expectedClassPerks('Archlich')).toEqual(['MISC', 'ORBS']);
    expect(expectedClassPerks('Marauder')).toEqual(['MISC', 'DOUBLE_USING_INVENTORY']);
    expect(expectedClassPerks('DemonLord')).toEqual(['MISC', 'TALISMANS']);
    expect(expectedClassPerks('Abbess')).toEqual(['MISC', 'RELICS']); // CUT-2026-11-09 AC-6
    expect(expectedClassPerks('Detective')).toEqual(['MISC']);

    const abbess = battle('Abbess');
    expect(abbess.unit.perks).toEqual(['MISC', 'RELICS']); // CUT-2026-11-09 AC-6
    expect(abbess.unit.merchant).toBe(0); // CUT-2026-11-09 AC-6
    expect(abbess.unit.develop).toBe(6);

    const det = battle('Detective');
    expect(det.unit.develop).toBe(5);
    expect(det.unit.perks).toEqual(['MISC']);

    const witch = battle('Witch');
    expect(witch.unit.perks).toEqual(['TECHNO', 'TALISMANS']);
    expect(witch.unit.perks).not.toContain('MISC');
  });

  test('стартовые инвентари по классам', () => {
    const evil = battle('EvilTree');
    expect(teamInventory(evil.state, evil.unit.team)).toEqual([347]);

    const orc = battle('OrcKing');
    const orcInv = teamInventory(orc.state, orc.unit.team);
    expect(orcInv).toContain(619);
    expect(orcInv.length).toBe(2);
    expect(getItem(orcInv.find((c) => c !== 619)!)?.tier).toBe(1);

    const pal = battle('Paladin');
    const palCode = teamInventory(pal.state, pal.unit.team)[0]!;
    expect(getItem(palCode)?.category).toBe(5);
    expect(getItem(palCode)?.tier).toBeGreaterThanOrEqual(1);
    expect(getItem(palCode)?.tier).toBeLessThanOrEqual(3);

    const herb = battle('Herbalist');
    expect(getItem(teamInventory(herb.state, herb.unit.team)[0]!)?.tier).toBe(1);

    const demon = battle('DemonLord');
    expect(teamInventory(demon.state, demon.unit.team).length).toBe(2);
    for (const code of teamInventory(demon.state, demon.unit.team)) {
      const tier = getItem(code)!.tier;
      expect(tier).toBeGreaterThanOrEqual(2);
      expect(tier).toBeLessThanOrEqual(4);
    }

    const witch = battle('Witch');
    const wInv = teamInventory(witch.state, witch.unit.team);
    expect(wInv.length).toBeGreaterThanOrEqual(1);
    expect(wInv.length).toBeLessThanOrEqual(2);
  });

  test('Paladin: 475 при hiddenLvl % 7 === 0 (economyOn)', () => {
    const { state, unit } = battle('Paladin', { fairEnabled: true });
    const before = itemCount(state, unit.team, 475);
    unit.hiddenLvl = 7;
    unit.lvl = 7;
    levelUpUnit(unit, 1, state);
    expect(itemCount(state, unit.team, 475)).toBe(before + 1);

    const off = battle('Paladin', { fairEnabled: false });
    off.unit.hiddenLvl = 7;
    off.unit.lvl = 7;
    levelUpUnit(off.unit, 1, off.state);
    expect(itemCount(off.state, off.unit.team, 475)).toBe(0);
  });

  test('Assassin: 107 при stage % 4 === 0 && ind > 0', () => {
    const { state, unit } = battle('Assassin', { fairEnabled: true });
    state.stage = 4;
    const before = itemCount(state, unit.team, 107);
    levelUpUnit(unit, 1, state);
    expect(itemCount(state, unit.team, 107)).toBe(before + 1);

    const off = battle('Assassin', { fairEnabled: false });
    off.state.stage = 4;
    levelUpUnit(off.unit, 1, off.state);
    expect(itemCount(off.state, off.unit.team, 107)).toBe(0);

    const other = battle('Assassin', { fairEnabled: true });
    other.state.stage = 3;
    const b2 = itemCount(other.state, other.unit.team, 107);
    levelUpUnit(other.unit, 1, other.state);
    expect(itemCount(other.state, other.unit.team, 107)).toBe(b2);
  });
});
