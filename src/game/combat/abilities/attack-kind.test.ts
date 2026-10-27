import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';

import { grantEffect, hasEffect } from '../effects';
import { createBattleState } from '../engine';
import { maybeRewardHighMorale } from '../morale';
import type { BattleState, BattleUnit, HeroClassStats } from '../types';
import { applyAbility, listPilotAbilities } from './registry';
import { createSummon } from './summon';

const hero = (code: string, over: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 500,
  damage: 30,
  armor: 0,
  initiative: 10,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 30,
  mana: 10,
  maxMana: 10,
  gold: 100,
  size: 1,
  ...over,
});

type Pick = { id: string; code: string; team: 0 | 1; row: 0 | 1; over?: Partial<HeroClassStats> };

function battle(picks: Pick[]): BattleState {
  const heroes = new Map<string, HeroClassStats>();
  for (const pick of picks) {
    heroes.set(pick.code, hero(pick.code, pick.over));
  }
  if (!heroes.has('Zombie')) {
    heroes.set('Zombie', hero('Zombie'));
  }
  return createBattleState({
    matchId: 'm',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: picks.map((pick, index) => ({
      id: pick.id,
      playerId: pick.team === 0 ? 'h' : 'g',
      heroClassCode: pick.code,
      row: pick.row,
      pickOrder: index + 1,
    })),
    heroes,
  });
}

const byId = (state: BattleState, id: string): BattleUnit =>
  state.units.find((unit) => unit.id === id)!;

const slotTargets = (state: BattleState, unit: BattleUnit, slot: number): string[] =>
  listPilotAbilities(state, unit).find((ability) => ability.slot === slot)!.legalTargetIds;

const meleeVsTwoRows = (code: string) =>
  battle([
    { id: 'p1', code, team: 0, row: 0 },
    { id: 'e1', code: 'Front', team: 1, row: 0 },
    { id: 'e2', code: 'Back', team: 1, row: 1 },
  ]);

let randomSpy: ReturnType<typeof spyOn> | null = null;

beforeEach(() => {
  randomSpy = spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  randomSpy?.mockRestore();
  randomSpy = null;
});

describe('melee reach is a property of the attack', () => {
  test('Assassin stiletto cannot reach the back row while the front is alive', () => {
    const state = meleeVsTwoRows('Assassin');
    expect(slotTargets(state, byId(state, 'p1'), 1)).toEqual(['e1']);
  });

  test('Witch heel (no bullets) cannot reach the back row', () => {
    const state = meleeVsTwoRows('Witch');
    const witch = byId(state, 'p1');
    witch.gun = 0;
    expect(slotTargets(state, witch, 1)).toEqual(['e1']);
  });

  test('Witch revolver reaches the back row', () => {
    const state = meleeVsTwoRows('Witch');
    expect(slotTargets(state, byId(state, 'p1'), 1)).toContain('e2');
  });

  test('Pyro flamethrower never hits the back row while the front is alive', () => {
    const state = meleeVsTwoRows('Pyro');
    const back = byId(state, 'e2');
    const before = back.health;
    expect(applyAbility(state, byId(state, 'p1'), { slot: 1 }).status).toBe('done');
    expect(back.health).toBe(before);
    expect(byId(state, 'e1').health).toBeLessThan(500);
  });
});

describe('weapon enchants and counters only on melee', () => {
  test('Paladin soul shatter with FIREDWEAPON: no BURNING, no counter', () => {
    const state = battle([
      { id: 'p1', code: 'Paladin', team: 0, row: 0 },
      { id: 'e1', code: 'Archlich', team: 1, row: 0 },
    ]);
    const paladin = byId(state, 'p1');
    const lich = byId(state, 'e1');
    grantEffect(paladin, 'FIREDWEAPON', 3, 0);
    grantEffect(lich, 'CONTR', 3, 0);
    const hpBefore = paladin.health;
    expect(applyAbility(state, paladin, { slot: 3, targetId: 'e1' }).status).toBe('done');
    expect(lich.health).toBeLessThan(lich.maxHp);
    expect(hasEffect(lich, 'BURNING')).toBe(false);
    expect(paladin.health).toBe(hpBefore);
  });

  test('Paladin blades with FIREDWEAPON set the target on fire', () => {
    const state = battle([
      { id: 'p1', code: 'Paladin', team: 0, row: 0 },
      { id: 'e1', code: 'Archlich', team: 1, row: 0 },
    ]);
    const paladin = byId(state, 'p1');
    grantEffect(paladin, 'FIREDWEAPON', 3, 0);
    expect(applyAbility(state, paladin, { slot: 1, targetId: 'e1' }).status).toBe('done');
    expect(hasEffect(byId(state, 'e1'), 'BURNING')).toBe(true);
  });

  test('ranged shot on a CONTR target does not trigger a counter', () => {
    const state = battle([
      { id: 'p1', code: 'Marauder', team: 0, row: 1 },
      { id: 'e1', code: 'Foe', team: 1, row: 0 },
    ]);
    const marauder = byId(state, 'p1');
    grantEffect(byId(state, 'e1'), 'CONTR', 3, 0);
    const hpBefore = marauder.health;
    expect(applyAbility(state, marauder, { slot: 1, targetId: 'e1' }).status).toBe('done');
    expect(marauder.health).toBe(hpBefore);
  });

  test('melee hit on a CONTR target triggers a counter', () => {
    const state = battle([
      { id: 'p1', code: 'Inquisitor', team: 0, row: 0 },
      { id: 'e1', code: 'Foe', team: 1, row: 0 },
    ]);
    const inquisitor = byId(state, 'p1');
    grantEffect(byId(state, 'e1'), 'CONTR', 3, 0);
    const hpBefore = inquisitor.health;
    expect(applyAbility(state, inquisitor, { slot: 1, targetId: 'e1' }).status).toBe('done');
    expect(inquisitor.health).toBeLessThan(hpBefore);
  });

  test('Knight spear ignores CONTR', () => {
    const state = battle([
      { id: 'p1', code: 'Knight', team: 0, row: 0 },
      { id: 'e1', code: 'Foe', team: 1, row: 0 },
    ]);
    const knight = byId(state, 'p1');
    grantEffect(byId(state, 'e1'), 'CONTR', 3, 0);
    const hpBefore = knight.health;
    expect(applyAbility(state, knight, { slot: 1, targetId: 'e1' }).status).toBe('done');
    expect(knight.health).toBe(hpBefore);
  });

  test('DemonLord triple strike scales with attack, not spell power', () => {
    const state = battle([
      { id: 'p1', code: 'DemonLord', team: 0, row: 0, over: { damage: 60, power: 1 } },
      { id: 'e1', code: 'Foe', team: 1, row: 0 },
    ]);
    const foe = byId(state, 'e1');
    expect(applyAbility(state, byId(state, 'p1'), { slot: 1, targetId: 'e1' }).status).toBe(
      'done'
    );
    expect(foe.maxHp - foe.health).toBeGreaterThanOrEqual(40);
  });
});

describe('Zombie starting charge', () => {
  test('summoned Zombie has 1 charge', () => {
    const state = battle([
      { id: 'p1', code: 'Archlich', team: 0, row: 1 },
      { id: 'e1', code: 'Foe', team: 1, row: 0 },
    ]);
    const zombie = createSummon(state, {
      summoner: byId(state, 'p1'),
      heroCode: 'Zombie',
      row: 0,
      isLichSummon: true,
    });
    expect(zombie?.ultaCharges).toBe(1);
  });

  test('infected unit becomes a Zombie with 1 charge', () => {
    const state = battle([
      { id: 'p1', code: 'Zombie', team: 0, row: 0 },
      { id: 'e1', code: 'Foe', team: 1, row: 0 },
    ]);
    const zombie = byId(state, 'p1');
    zombie.lvl = 5;
    const foe = byId(state, 'e1');
    expect(applyAbility(state, zombie, { slot: 3, targetId: 'e1' }).status).toBe('done');
    expect(foe.heroClassCode).toBe('Zombie');
    expect(foe.ultaCharges).toBe(1);
  });
});

describe('ENSLAVED blocks suicide abilities', () => {
  test('Pyro self-immolation is disabled', () => {
    const state = battle([
      { id: 'p1', code: 'Pyro', team: 0, row: 0 },
      { id: 'p2', code: 'Ally', team: 0, row: 1 },
      { id: 'e1', code: 'Foe', team: 1, row: 0 },
    ]);
    const pyro = byId(state, 'p1');
    grantEffect(pyro, 'ENSLAVED', 2, 0);
    const meta = listPilotAbilities(state, pyro).find((ability) => ability.slot === 5)!;
    expect(meta.disabledReason).toBe('Нельзя под порабощением');
    expect(applyAbility(state, pyro, { slot: 5 }).status).toBe('reject');
  });

  test('Zombie kamikaze is disabled', () => {
    const state = battle([
      { id: 'p1', code: 'Zombie', team: 0, row: 0 },
      { id: 'e1', code: 'Foe', team: 1, row: 0 },
    ]);
    const zombie = byId(state, 'p1');
    grantEffect(zombie, 'ENSLAVED', 2, 0);
    const meta = listPilotAbilities(state, zombie).find((ability) => ability.slot === 4)!;
    expect(meta.disabledReason).toBe('Нельзя под порабощением');
    expect(applyAbility(state, zombie, { slot: 4, targetId: 'e1' }).status).toBe('reject');
  });
});

describe('high morale reward by class', () => {
  test('warrior gets +33% attack', () => {
    const state = battle([
      { id: 'p1', code: 'Knight', team: 0, row: 0, over: { damage: 30 } },
      { id: 'e1', code: 'Foe', team: 1, row: 0 },
    ]);
    const knight = byId(state, 'p1');
    knight.morale = 100;
    const before = knight.damage;
    maybeRewardHighMorale(state, knight);
    expect(hasEffect(knight, 'STRENGTH')).toBe(true);
    expect(hasEffect(knight, 'ABSOLUTEPOWER')).toBe(false);
    expect(knight.damage - before).toBe(Math.round(before * 0.33));
  });

  test('mage gets +25% spell power', () => {
    const state = battle([
      { id: 'p1', code: 'Archlich', team: 0, row: 1, over: { power: 40 } },
      { id: 'e1', code: 'Foe', team: 1, row: 0 },
    ]);
    const lich = byId(state, 'p1');
    lich.morale = 100;
    const before = lich.power;
    maybeRewardHighMorale(state, lich);
    expect(hasEffect(lich, 'ABSOLUTEPOWER')).toBe(true);
    expect(hasEffect(lich, 'STRENGTH')).toBe(false);
    expect(lich.power - before).toBe(Math.round(before * 0.25));
  });
});
