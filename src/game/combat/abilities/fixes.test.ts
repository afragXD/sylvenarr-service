import { describe, expect, test } from 'bun:test';

import { applyAction, createBattleState } from '../engine';
import { grantEffect } from '../effects';
import type { HeroClassStats } from '../types';
import { goldGolemAbilities } from './gold-golem';
import { createSummon } from './summon';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 100,
  damage: 20,
  armor: 5,
  initiative: 40,
  dodge: 5,
  luck: 5,
  accuracy: 100,
  power: 20,
  mana: 10,
  gold: 100,
  size: 1,
  ...overrides,
});

const twoUnitState = (
  hostCode: string,
  guestCode: string,
  hostOverrides: Partial<HeroClassStats> = {},
  guestOverrides: Partial<HeroClassStats> = {},
  extraHeroes: Array<[string, HeroClassStats]> = []
) => {
  const heroes = new Map<string, HeroClassStats>([
    [hostCode, hero(hostCode, { initiative: 99, ...hostOverrides })],
    [guestCode, hero(guestCode, { initiative: 1, ...guestOverrides })],
    ...extraHeroes,
  ]);
  return createBattleState({
    matchId: 'm',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      { id: 'p1', playerId: 'h', heroClassCode: hostCode, row: 0, pickOrder: 1 },
      { id: 'p2', playerId: 'g', heroClassCode: guestCode, row: 0, pickOrder: 1 },
    ],
    heroes,
  });
};

describe('combat fixes', () => {
  test('Mermaid enslave: жертва ходит под контролем, затем возвращается', () => {
    const state = twoUnitState('Mermaid', 'B', {}, { health: 300 });
    const mermaid = state.units.find((unit) => unit.id === 'p1')!;
    expect(mermaid.ultaCharges).toBe(1);
    const cast = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 3,
      targetId: 'p2',
    });
    expect(cast.ok).toBe(true);
    const foe = state.units.find((unit) => unit.id === 'p2')!;
    expect(foe.team).toBe(0);
    expect(foe.playerId).toBe('h');
    // Ход жертвы наступает под контролем поработителя.
    expect(state.activeUnitId).toBe('p2');
    expect(state.turnPlayerId).toBe('h');
    // Жертва ходит (защита) — эффект спадает в конце её хода.
    const act = applyAction(state, { playerId: 'h', unitId: 'p2', action: 'defend' });
    expect(act.ok).toBe(true);
    expect(foe.effects.some((effect) => effect.id === 'ENSLAVED')).toBe(false);
    expect(foe.team).toBe(1);
    expect(foe.playerId).toBe('g');
  });

  test('Mermaid enslave: саммоны очарованного хозяина возвращаются с ним', () => {
    const heroes = new Map([
      ['Mermaid', hero('Mermaid', { initiative: 99 })],
      ['Demiurge', hero('Demiurge', { initiative: 50, mana: 20 })],
      ['Ectoplasm', hero('Ectoplasm', { health: 40, damage: 8 })],
      ['C', hero('C', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm-enslave-summon',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Mermaid', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'g', heroClassCode: 'Demiurge', row: 0, pickOrder: 1 },
        { id: 'p3', playerId: 'h', heroClassCode: 'C', row: 1, pickOrder: 2 },
      ],
      heroes,
    });
    const cast = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 3,
      targetId: 'p2',
    });
    expect(cast.ok).toBe(true);
    const mage = state.units.find((unit) => unit.id === 'p2')!;
    expect(mage.team).toBe(0);
    expect(state.activeUnitId).toBe('p2');
    expect(state.turnPlayerId).toBe('h');
    const summon = applyAction(state, {
      playerId: 'h',
      unitId: 'p2',
      action: 'ability',
      slot: 4,
    });
    expect(summon.ok).toBe(true);
    const slime = state.units.find(
      (unit) => unit.isSummon && unit.summonerId === 'p2' && unit.alive
    )!;
    expect(slime).toBeTruthy();
    // Ход жертвы завершён призывом — ENSLAVED спадает, хозяин и саммон возвращаются.
    expect(mage.effects.some((effect) => effect.id === 'ENSLAVED')).toBe(false);
    expect(mage.team).toBe(1);
    expect(mage.playerId).toBe('g');
    expect(slime.team).toBe(1);
    expect(slime.playerId).toBe('g');
  });

  test('Archlich slot 3 ритуал: саммон +1+master.lvl//4 уровней', () => {
    const heroes = new Map([
      ['Archlich', hero('Archlich', { initiative: 99, mana: 10 })],
      ['Zombie', hero('Zombie', { health: 50, damage: 10 })],
      ['C', hero('C', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm-ritual',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Archlich', row: 0, pickOrder: 1 },
        { id: 'p3', playerId: 'g', heroClassCode: 'C', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const lich = state.units.find((unit) => unit.id === 'p1')!;
    lich.lvl = 8;
    lich.hiddenLvl = 8;
    lich.maxSummons = 2;
    const zombie = createSummon(state, {
      summoner: lich,
      heroCode: 'Zombie',
      row: 0,
      isLichSummon: true,
    });
    expect(zombie).toBeTruthy();
    const before = zombie!.lvl;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const cast = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 3,
      targetId: zombie!.id,
    });
    expect(cast.ok).toBe(true);
    // 1 + floor(8/4) = 3
    expect(zombie!.lvl).toBe(before + 3);
    expect(state.log.some((line) => line.includes('+3 ур.'))).toBe(true);
  });

  test('Archlich slot 5 поглощает уровни союзника', () => {
    const heroes = new Map([
      ['Archlich', hero('Archlich', { initiative: 99, mana: 10 })],
      ['B', hero('B', { initiative: 50, health: 100 })],
      ['C', hero('C', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Archlich', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'B', row: 0, pickOrder: 2 },
        { id: 'p3', playerId: 'g', heroClassCode: 'C', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const lich = state.units.find((unit) => unit.id === 'p1')!;
    const victim = state.units.find((unit) => unit.id === 'p2')!;
    expect(lich.maxSummons).toBe(1);
    victim.lvl = 8;
    const before = lich.lvl;
    lich.mana = 2;
    const noMana = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 5,
      targetId: 'p2',
    });
    expect(noMana.ok).toBe(false);
    expect(victim.alive).toBe(true);

    lich.mana = 10;
    const cast = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 5,
      targetId: 'p2',
    });
    expect(cast.ok).toBe(true);
    expect(victim.alive).toBe(false);
    // max(1, round(8 * 0.5)) = 4 уровня.
    expect(lich.lvl).toBe(before + 4);
  });

  test('EvilTree slot 5 «Взращивание»: 4 МР → +3 уровней цели', () => {
    const heroes = new Map([
      ['EvilTree', hero('EvilTree', { initiative: 99, mana: 10 })],
      ['B', hero('B', { initiative: 50 })],
      ['C', hero('C', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'EvilTree', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'B', row: 0, pickOrder: 2 },
        { id: 'p3', playerId: 'g', heroClassCode: 'C', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const tree = state.units.find((unit) => unit.id === 'p1')!;
    tree.lvl = 3;
    const ally = state.units.find((unit) => unit.id === 'p2')!;
    const cast = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 5,
      targetId: 'p2',
    });
    expect(cast.ok).toBe(true);
    expect(tree.mana).toBe(6);
    expect(ally.lvl).toBe(1 + 3);
  });

  test('Patriarch воскрешение: ½ maxHp, ½ инициативы, повторно нельзя', () => {
    const heroes = new Map([
      ['Patriarch', hero('Patriarch', { initiative: 99, mana: 10 })],
      ['B', hero('B', { initiative: 50, health: 120 })],
      ['C', hero('C', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Patriarch', row: 1, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'B', row: 0, pickOrder: 2 },
        { id: 'p3', playerId: 'g', heroClassCode: 'C', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const fallen = state.units.find((unit) => unit.id === 'p2')!;
    const maxHpBefore = fallen.maxHp;
    const iniBefore = fallen.initiative;
    fallen.alive = false;
    fallen.health = 0;
    state.graveyard.push({
      unitId: 'p2',
      team: 0,
      heroClassCode: 'B',
      displayName: 'B',
      forbiddenResurrect: false,
    });
    const cast = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 3,
    });
    expect(cast.ok).toBe(true);
    expect(state.pendingPrompt?.kind).toBe('patriarch_resurrect');
    const pick = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 3,
      choice: 'p2',
    });
    expect(pick.ok).toBe(true);
    expect(fallen.alive).toBe(true);
    expect(fallen.maxHp).toBe(Math.max(1, Math.floor(maxHpBefore / 2)));
    expect(fallen.health).toBe(fallen.maxHp);
    expect(fallen.initiative).toBe(Math.max(1, Math.floor(iniBefore / 2)));
    expect(fallen.forbiddenResurrect).toBe(true);
    expect(state.graveyard.some((entry) => entry.unitId === 'p2')).toBe(false);
  });

  test('Witch slot 4: вард LOWERINGLEVEL инквизитора блокирует деградацию', () => {
    const state = twoUnitState('Witch', 'Inquisitor', { mana: 10 }, {});
    const witch = state.units.find((unit) => unit.id === 'p1')!;
    // 70 + 15 * 2 = 100% — дрейн точно дойдёт до проверки варда.
    witch.lvl = 15;
    const foe = state.units.find((unit) => unit.id === 'p2')!;
    expect((foe.resists.LOWERINGLEVEL?.wardCharges ?? 0) > 0).toBe(true);
    const lvlBefore = foe.lvl;
    const cast = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
      targetId: 'p2',
    });
    expect(cast.ok).toBe(true);
    expect(foe.lvl).toBe(lvlBefore);
    expect(foe.resists.LOWERINGLEVEL?.wardCharges ?? 0).toBe(0);
  });

  test('Marauder slot 4: вард от оружия при превращении', () => {
    const state = twoUnitState(
      'Marauder',
      'B',
      {},
      {},
      [['Werewolf', hero('Werewolf', { health: 150, damage: 25 })]]
    );
    const marauder = state.units.find((unit) => unit.id === 'p1')!;
    marauder.ultaCharges = 1;
    const cast = applyAction(state, { playerId: 'h', unitId: 'p1', action: 'ability', slot: 4 });
    expect(cast.ok).toBe(true);
    expect(marauder.heroClassCode).toBe('Werewolf');
    expect(marauder.resists.WEAPON?.wardCharges).toBe(Math.floor(marauder.lvl / 7) + 1);
    // Имя в логе — до трансформации (не «Оборотень превращается в оборотня»).
    expect(state.log.some((line) => line.startsWith('Marauder превращается в оборотня'))).toBe(
      true
    );
  });

  test('GoldGolem slot 4 ABSOLUTEPOWER always 1 round', () => {
    const heroes = new Map([
      ['GoldGolem', hero('GoldGolem', { initiative: 99 })],
      ['B', hero('B', { initiative: 50, power: 40 })],
      ['C', hero('C', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm-golem-power',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'GoldGolem', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'B', row: 0, pickOrder: 2 },
        { id: 'p3', playerId: 'g', heroClassCode: 'C', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const cast = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
    });
    expect(cast.ok).toBe(true);
    const ally = state.units.find((unit) => unit.id === 'p2')!;
    const buff = ally.effects.find((effect) => effect.id === 'ABSOLUTEPOWER');
    expect(buff).toBeTruthy();
    expect(buff!.rounds).toBe(1);
  });

  test('GoldGolem preChoice: вард LOWERINGLEVEL союзнику', () => {
    const heroes = new Map([
      ['GoldGolem', hero('GoldGolem', { initiative: 99 })],
      ['B', hero('B', { initiative: 50 })],
      ['C', hero('C', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'm',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'GoldGolem', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'B', row: 0, pickOrder: 2 },
        { id: 'p3', playerId: 'g', heroClassCode: 'C', row: 0, pickOrder: 1 },
      ],
      heroes,
    });
    const ally = state.units.find((unit) => unit.id === 'p2')!;
    const golem = state.units.find((unit) => unit.id === 'p1')!;
    // 50% шанс — повторяем, пока не сработает (до 200 попыток для надёжности).
    let applied = (ally.resists.LOWERINGLEVEL?.wardCharges ?? 0) > 0;
    for (let attempt = 0; attempt < 200 && !applied; attempt += 1) {
      goldGolemAbilities.preChoice?.(state, golem);
      applied = (ally.resists.LOWERINGLEVEL?.wardCharges ?? 0) > 0;
    }
    expect(applied).toBe(true);
    expect(ally.effects.some((effect) => effect.id === 'MIND_WARD')).toBe(false);
  });

  test('MAGIC_SHACKLES: самоубийство маной сразу помечает смерть', () => {
    const state = twoUnitState('Mermaid', 'B', { mana: 10 }, { health: 300 });
    const mermaid = state.units.find((unit) => unit.id === 'p1')!;
    grantEffect(mermaid, 'MAGIC_SHACKLES', 3, 0);
    mermaid.health = 10;
    const cast = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
      targetId: 'p2',
    });
    // burn = 2 * (10 + floor(lvl/4)) = 20 > 10 ОЗ — русалка сгорает оковами.
    expect(cast.ok).toBe(true);
    expect(mermaid.alive).toBe(false);
    expect(mermaid.health).toBe(0);
    expect(state.graveyard.some((entry) => entry.unitId === 'p1')).toBe(true);
  });
});
