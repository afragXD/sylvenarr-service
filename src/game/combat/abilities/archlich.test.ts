import { describe, expect, test } from 'bun:test';

import { createBattleState } from '../engine';
import type { BattleState, BattleUnit, HeroClassStats } from '../types';
import { archlichAbilities } from './archlich';
import { createSummon } from './summon';

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
  mana: 30,
  gold: 200,
  size: 1,
  ...overrides,
});

function ownedSummons(state: BattleState, masterId: string): BattleUnit[] {
  return state.units.filter((unit) => unit.alive && unit.isSummon && unit.summonerId === masterId);
}

function evolve(state: BattleState, actor: BattleUnit, targetId: string, choice?: string) {
  return archlichAbilities.apply(state, actor, { slot: 2, targetId, choice });
}

describe('Archlich evolution keeps the original master', () => {
  test('чужая нежить остаётся саммоном своего лича', () => {
    const heroes = new Map([
      ['Archlich', hero('Archlich')],
      ['Zombie', hero('Zombie', { health: 40 })],
      ['SkeletonChampion', hero('SkeletonChampion', { health: 80 })],
      ['GhostWarrior', hero('GhostWarrior', { health: 90 })],
      ['EvilTree', hero('EvilTree', { health: 90 })],
      ['B', hero('B')],
    ]);
    const state = createBattleState({
      matchId: 'm-lich-master',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'owner', playerId: 'h', heroClassCode: 'Archlich', row: 1, pickOrder: 1 },
        { id: 'caster', playerId: 'h', heroClassCode: 'Archlich', row: 1, pickOrder: 2 },
        { id: 'foe', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const owner = state.units.find((unit) => unit.id === 'owner');
    const caster = state.units.find((unit) => unit.id === 'caster');
    if (!owner || !caster) {
      throw new Error('missing lich');
    }
    owner.lvl = 4;
    owner.mana = 30;
    caster.lvl = 8;
    caster.mana = 30;

    const zombie = createSummon(state, {
      summoner: owner,
      heroCode: 'Zombie',
      row: 0,
      isLichSummon: true,
    });
    expect(zombie).toBeTruthy();

    const first = evolve(state, caster, zombie!.id);
    expect(first.status).toBe('done');
    expect(zombie!.lichGrade).toBe(1);
    expect(zombie!.summonerId).toBe(owner.id);

    const second = evolve(state, caster, zombie!.id);
    expect(second.status).toBe('done');
    const skeleton = state.units.find((unit) => unit.alive && unit.heroClassCode === 'SkeletonChampion');
    expect(skeleton).toBeTruthy();
    expect(skeleton!.summonerId).toBe(owner.id);
    expect(skeleton!.lvl).toBe(caster.lvl);
    expect(skeleton!.isLichSummon).toBe(true);
    expect(ownedSummons(state, owner.id).map((unit) => unit.id)).toEqual([skeleton!.id]);
    expect(ownedSummons(state, caster.id)).toHaveLength(0);

    expect(evolve(state, caster, skeleton!.id).status).toBe('done');
    expect(evolve(state, caster, skeleton!.id).status).toBe('done');
    const pending = evolve(state, caster, skeleton!.id);
    expect(pending.status).toBe('pending');
    const ghost = evolve(state, caster, skeleton!.id, 'ghost');
    expect(ghost.status).toBe('done');

    const warrior = state.units.find((unit) => unit.alive && unit.heroClassCode === 'GhostWarrior');
    expect(warrior).toBeTruthy();
    expect(warrior!.summonerId).toBe(owner.id);
    expect(warrior!.lvl).toBe(caster.lvl);
    expect(warrior!.isLichSummon).toBe(true);
    expect(state.units.some((unit) => unit.id === skeleton!.id)).toBe(false);
    expect(ownedSummons(state, owner.id).map((unit) => unit.id)).toEqual([warrior!.id]);
    expect(ownedSummons(state, caster.id)).toHaveLength(0);
  });
});
