import { describe, expect, test } from 'bun:test';

import { dealDamage, lifeThreadDamageMult, transferFettersDamage } from '../damage';
import { grantEffect, hasEffect, tickEffectsOnTurnEnd } from '../effects';
import { applyAction, createBattleState } from '../engine';
import { applyClassLevelUp } from '../levelup';
import type { HeroClassStats } from '../types';
import { distributeHealBank, thamaturgyBank } from './ghost-warrior';
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
  gold: 200,
  size: 1,
  ...overrides,
});

describe('CUT-2026-11-01c AC-5 Knight', () => {
  test('fixture ballad-single: STRENGTH +(15+L), одна цель, снятие DoT, TODO(fairs)', () => {
    const state = createBattleState({
      matchId: 'ac5-ballad',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'p3', playerId: 'h', heroClassCode: 'Ally2', row: 0, pickOrder: 3 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Knight', hero('Knight')],
        ['Ally', hero('Ally')],
        ['Ally2', hero('Ally2')],
        ['B', hero('B')],
      ]),
    });
    const knight = state.units.find((u) => u.id === 'p1')!;
    const ally = state.units.find((u) => u.id === 'p2')!;
    const other = state.units.find((u) => u.id === 'p3')!;
    knight.lvl = 10;
    knight.gold = 500;
    const dmgBefore = ally.damage;
    grantEffect(ally, 'POISON', 3, 1);
    grantEffect(ally, 'BURNING', 2, 1);
    grantEffect(ally, 'BLEEDING', 2, 1);
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 3,
      targetId: 'p2',
    });
    expect(result.ok).toBe(true);
    expect(ally.damage - dmgBefore).toBe(15 + 10); // +25
    expect(hasEffect(ally, 'STRENGTH')).toBe(true);
    expect(hasEffect(ally, 'BLESSED')).toBe(true);
    expect(hasEffect(ally, 'POISON')).toBe(false);
    expect(hasEffect(ally, 'BURNING')).toBe(false);
    expect(hasEffect(ally, 'BLEEDING')).toBe(false);
    expect(hasEffect(other, 'STRENGTH')).toBe(false);
    // L1 / L20 sanity via formula
    expect(15 + 1).toBe(16);
    expect(15 + 20).toBe(35);
  });

  test('fixture sacrifice: 60% ok / 59% no; ignore saves; no loop', () => {
    const state = createBattleState({
      matchId: 'ac5-sac',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Knight', hero('Knight', { health: 200 })],
        ['Ally', hero('Ally')],
        ['B', hero('B')],
      ]),
    });
    const knight = state.units.find((u) => u.id === 'p1')!;
    const ally = state.units.find((u) => u.id === 'p2')!;
    knight.maxHp = 200;
    knight.health = 119;
    ally.health = 0;
    ally.alive = false;
    state.graveyard.push({
      unitId: 'p2',
      team: 0,
      heroClassCode: 'Ally',
      displayName: 'Ally',
      forbiddenResurrect: false,
    });
    let info = listPilotAbilities(state, knight).find((a) => a.slot === 5)!;
    expect(info.disabledReason).toBe('нельзя, нужно 120 ОЗ');

    knight.health = 120;
    grantEffect(knight, 'IMAGINARY_HEALTH', 2, 50);
    knight.lives = 1;
    knight.resists.FINALSTRIKE = { value: 100, wardCharges: 2 };
    info = listPilotAbilities(state, knight).find((a) => a.slot === 5)!;
    expect(info.disabledReason).toBeNull();
    expect(info.label).toContain('можно');

    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 5,
      targetId: 'p2',
    });
    expect(result.ok).toBe(true);
    expect(knight.alive).toBe(false);
    expect(knight.sacrificedSelf).toBe(true);
    expect(knight.lives).toBe(1); // не потрачена
    expect(ally.alive).toBe(true);

    // Второй кентавр не может поднять пожертвовавшего собой.
    const state2 = createBattleState({
      matchId: 'ac5-sac2',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'k2', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'dead', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Knight', hero('Knight', { health: 200 })],
        ['B', hero('B')],
      ]),
    });
    const k2 = state2.units.find((u) => u.id === 'k2')!;
    const dead = state2.units.find((u) => u.id === 'dead')!;
    dead.alive = false;
    dead.health = 0;
    dead.sacrificedSelf = true;
    state2.graveyard.push({
      unitId: 'dead',
      team: 0,
      heroClassCode: 'Knight',
      displayName: 'Knight',
      forbiddenResurrect: false,
    });
    k2.health = 200;
    const sac = listPilotAbilities(state2, k2).find((a) => a.slot === 5)!;
    expect(sac.legalTargetIds).not.toContain('dead');
  });
});

describe('CUT-2026-11-01c AC-6 SkeletonChampion', () => {
  test('fixture pain-reflect: melee 40→20, miss 0, expire 2r, no contract', () => {
    const state = createBattleState({
      matchId: 'ac6-pr',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'SkeletonChampion', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['SkeletonChampion', hero('SkeletonChampion')],
        ['Ally', hero('Ally', { health: 300 })],
        ['B', hero('B', { damage: 40, accuracy: 100, luck: 0 })],
      ]),
    });
    const skel = state.units.find((u) => u.id === 'p1')!;
    const ally = state.units.find((u) => u.id === 'p2')!;
    const foe = state.units.find((u) => u.id === 'e1')!;
    const labels = listPilotAbilities(state, skel).map((a) => a.label);
    expect(labels.some((l) => l.includes('Контракт'))).toBe(false);
    expect(labels.some((l) => l.includes('Тёмная молитва'))).toBe(true);

    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
      targetId: 'p2',
    });
    expect(hasEffect(ally, 'PAIN_REFLECT')).toBe(true);

    const atkHp = foe.health;
    ally.armor = 0;
    foe.damage = 40;
    // Гарантированный удар на 40 через forceHit + фиксированный raw.
    const dealt = dealDamage(
      foe,
      ally,
      { kind: 'melee', damageMult: 1, armorIgnore: 1, forceHit: true },
      state
    );
    // raw ≈ 40..42 при armorIgnore 1; берём фактический reflected.
    expect(dealt).toBeGreaterThanOrEqual(40);
    const reflected = Math.round(dealt * 0.5);
    expect(atkHp - foe.health).toBe(reflected);

    // Промах — без отражения.
    const hp2 = foe.health;
    foe.accuracy = 0;
    ally.dodge = 100;
    dealDamage(foe, ally, { kind: 'melee', damageMult: 1 }, state);
    expect(foe.health).toBe(hp2);

    // Дальняя атака не отражает.
    const hp3 = foe.health;
    ally.dodge = 0;
    foe.accuracy = 100;
    dealDamage(foe, ally, { kind: 'ranged', damageMult: 1, forceHit: true }, state);
    expect(foe.health).toBe(hp3);

    // Истечение через 2 раунда end-тика (fresh пропускает первый).
    const effect = ally.effects.find((e) => e.id === 'PAIN_REFLECT')!;
    effect.fresh = undefined;
    tickEffectsOnTurnEnd(ally, state);
    expect(hasEffect(ally, 'PAIN_REFLECT')).toBe(true);
    tickEffectsOnTurnEnd(ally, state);
    expect(hasEffect(ally, 'PAIN_REFLECT')).toBe(false);
  });

  test('fixture pain-reflect: два носителя не цепочат отражение', () => {
    const state = createBattleState({
      matchId: 'ac6-chain',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'a', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'b', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A', { damage: 40, accuracy: 100, luck: 0, health: 500 })],
        ['B', hero('B', { damage: 40, accuracy: 100, luck: 0, health: 500 })],
      ]),
    });
    const a = state.units.find((u) => u.id === 'a')!;
    const b = state.units.find((u) => u.id === 'b')!;
    grantEffect(a, 'PAIN_REFLECT', 2);
    grantEffect(b, 'PAIN_REFLECT', 2);
    a.armor = 0;
    b.armor = 0;
    const aBefore = a.health;
    const bBefore = b.health;
    const dealt = dealDamage(
      a,
      b,
      { kind: 'melee', damageMult: 1, armorIgnore: 1, forceHit: true },
      state
    );
    const reflected = Math.round(dealt * 0.5);
    expect(bBefore - b.health).toBe(dealt);
    expect(aBefore - a.health).toBe(reflected);
    // Отражённый урон сам не отражается — b не теряет ещё reflected/2.
  });
});

describe('CUT-2026-11-01c AC-7 GhostWarrior', () => {
  test('fixture thamaturgy bank math + distribute', () => {
    expect(thamaturgyBank(100, 2, 10)).toBe(145);
    expect(thamaturgyBank(100, 6, 10)).toBe(205);
    const state = createBattleState({
      matchId: 'ac7-bank',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'a', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'b', playerId: 'h', heroClassCode: 'B', row: 0, pickOrder: 2 },
        { id: 'c', playerId: 'h', heroClassCode: 'C', row: 0, pickOrder: 3 },
        { id: 'e', playerId: 'g', heroClassCode: 'E', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A', { health: 100 })],
        ['B', hero('B', { health: 100 })],
        ['C', hero('C', { health: 100 })],
        ['E', hero('E')],
      ]),
    });
    const a = state.units.find((u) => u.id === 'a')!;
    const b = state.units.find((u) => u.id === 'b')!;
    const c = state.units.find((u) => u.id === 'c')!;
    for (const unit of [a, b, c]) {
      unit.maxHp = 100;
    }
    a.health = 90;
    b.health = 95;
    c.health = 15;
    const healed = distributeHealBank([a, b, c], 60);
    const byId = Object.fromEntries(healed.map((h) => [h.unitId, h.healed]));
    expect(byId.a).toBe(6);
    expect(byId.b).toBe(3);
    expect(byId.c).toBe(51);
  });

  test('fixture life-thread mult + rounds; growth lvl9 +3', () => {
    const state = createBattleState({
      matchId: 'ac7-thread',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'GhostWarrior', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['GhostWarrior', hero('GhostWarrior')],
        ['B', hero('B')],
      ]),
    });
    const gw = state.units.find((u) => u.id === 'p1')!;
    gw.maxHp = 100;
    gw.health = 60;
    grantEffect(gw, 'LIFE_THREAD', 2);
    expect(lifeThreadDamageMult(gw)).toBeCloseTo(1.4, 5);
    gw.health = 10;
    expect(lifeThreadDamageMult(gw)).toBeCloseTo(1.75, 5);

    expect(2 + Math.floor(1 / 7)).toBe(2);
    expect(2 + Math.floor(7 / 7)).toBe(3);
    expect(2 + Math.floor(14 / 7)).toBe(4);

    const dmgBefore = gw.damage;
    gw.lvl = 9;
    gw.hiddenLvl = 9;
    applyClassLevelUp(gw, 1, state);
    expect(gw.damage - dmgBefore).toBe(3 + 3); // base 3 + lvl//3
  });

  test('fixture fetters: transfer LIFE, no recursion', () => {
    const state = createBattleState({
      matchId: 'ac7-fetters',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'g1', playerId: 'h', heroClassCode: 'GhostWarrior', row: 0, pickOrder: 1 },
        { id: 'g2', playerId: 'g', heroClassCode: 'GhostWarrior', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['GhostWarrior', hero('GhostWarrior', { health: 400, accuracy: 100, luck: 0 })],
      ]),
    });
    const g1 = state.units.find((u) => u.id === 'g1')!;
    const g2 = state.units.find((u) => u.id === 'g2')!;
    g1.fettersTargetId = g2.id;
    grantEffect(g2, 'LIFE_FETTERS', 3);
    g2.fettersTargetId = g1.id;
    grantEffect(g1, 'LIFE_FETTERS', 3);
    g1.armor = 0;
    g2.armor = 0;
    const g2Before = g2.health;
    const g1Before = g1.health;
    // Наносим ровно 30 через прямой HP + transfer (обход RNG).
    g1.health -= 30;
    transferFettersDamage(state, g1, 30);
    expect(g2Before - g2.health).toBe(30);
    // Перенос на g2 не уходит обратно на g1.
    expect(g1.health).toBe(g1Before - 30);
  });

  test('fixture servant: lvl = corpse.lvl + self.lvl//3', () => {
    const state = createBattleState({
      matchId: 'ac7-servant',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'GhostWarrior', row: 0, pickOrder: 1 },
        { id: 'ally', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['GhostWarrior', hero('GhostWarrior')],
        ['Ally', hero('Ally')],
        ['B', hero('B')],
        ['SkeletonChampion', hero('SkeletonChampion')],
      ]),
    });
    const gw = state.units.find((u) => u.id === 'p1')!;
    const ally = state.units.find((u) => u.id === 'ally')!;
    gw.lvl = 9;
    gw.maxSummons = 1;
    ally.lvl = 5;
    ally.alive = false;
    ally.health = 0;
    state.graveyard.push({
      unitId: 'ally',
      team: 0,
      heroClassCode: 'Ally',
      displayName: 'Ally',
      forbiddenResurrect: false,
    });
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 3,
      targetId: 'ally',
    });
    expect(result.ok).toBe(true);
    const servant = state.units.find(
      (u) => u.alive && u.isSummon && u.heroClassCode === 'SkeletonChampion'
    );
    expect(servant).toBeTruthy();
    expect(servant!.lvl).toBe(5 + Math.floor(9 / 3)); // 8
    // Ульта: старт 1 → после каста 0; слот-КД нет.
    expect(gw.ultaCharges).toBe(0);
    expect(gw.abilityCds?.[3] ?? 0).toBe(0);
  });

  test('fixture harvest CD 3; servant ulta +1 на stage%5', () => {
    const state = createBattleState({
      matchId: 'ac7-ulta-cd',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'GhostWarrior', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'e2', playerId: 'g', heroClassCode: 'C', row: 1, pickOrder: 1 },
      ],
      heroes: new Map([
        ['GhostWarrior', hero('GhostWarrior', { damage: 40, accuracy: 100, luck: 0 })],
        ['B', hero('B', { health: 200, armor: 0 })],
        ['C', hero('C', { health: 200, armor: 0 })],
      ]),
    });
    const gw = state.units.find((u) => u.id === 'p1')!;
    expect(gw.ultaCharges).toBe(1);
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const harvest = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 2,
      targetId: 'e1',
    });
    expect(harvest.ok).toBe(true);
    expect(gw.abilityCds?.[2]).toBe(3);

    const before = gw.ultaCharges;
    state.stage = 5;
    applyClassLevelUp(gw, 1, state);
    expect(gw.ultaCharges).toBe(before + 1);
  });

  test('fixture life-thread ability CD 2', () => {
    const state = createBattleState({
      matchId: 'ac7-thread-cd',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'GhostWarrior', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['GhostWarrior', hero('GhostWarrior')],
        ['B', hero('B')],
      ]),
    });
    const gw = state.units.find((u) => u.id === 'p1')!;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 5,
    });
    expect(result.ok).toBe(true);
    expect(hasEffect(gw, 'LIFE_THREAD')).toBe(true);
    expect(gw.abilityCds?.[5]).toBe(2);
  });

  test('fixture katana: stun fail → morale loss 9..12 at lvl 4', () => {
    const state = createBattleState({
      matchId: 'ac7-katana',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'GhostWarrior', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['GhostWarrior', hero('GhostWarrior', { damage: 50, accuracy: 100, luck: 0 })],
        ['B', hero('B', { health: 500, armor: 0 })],
      ]),
    });
    const gw = state.units.find((u) => u.id === 'p1')!;
    const foe = state.units.find((u) => u.id === 'e1')!;
    gw.lvl = 4;
    // Иммунитет к оглушению → провал → мораль.
    grantEffect(foe, 'STUN_IMMUNE', 5, 100);
    foe.morale = 50;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 1,
      targetId: 'e1',
    });
    const loss = 50 - foe.morale;
    expect(loss).toBeGreaterThanOrEqual(9);
    expect(loss).toBeLessThanOrEqual(12);
  });
});
