import { describe, expect, test } from 'bun:test';

import { effectLogLabel } from '../effect-labels';
import { delEffect, grantEffect, tickEffectsOnTurnEnd, tickEffectsOnTurnStart } from '../effects';
import { applyAction, createBattleState } from '../engine';
import { applyCatalogStats } from '../transform';
import type { HeroClassStats } from '../types';

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

describe('CUT-2026-11-01c AC-12 Gall / accuracy / Death Sentence', () => {
  test('fixture gall-cast-l10: длительность 3, power 20', () => {
    const state = createBattleState({
      matchId: 'ac12-gall-cast',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Marauder', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Marauder', hero('Marauder')],
        ['Werewolf', hero('Werewolf', { health: 150, damage: 25 })],
        ['B', hero('B', { armor: 20, health: 500 })],
      ]),
    });
    const wolf = state.units.find((u) => u.id === 'p1')!;
    const foe = state.units.find((u) => u.id === 'e1')!;
    wolf.transformParentCode = 'Marauder';
    applyCatalogStats(state, wolf, 'Werewolf');
    wolf.lvl = 10;
    wolf.abilityCds = {};
    foe.armor = 20;
    foe.health = 500;
    foe.maxHp = 500;

    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const cast = applyAction(state, {
      action: 'ability',
      playerId: 'h',
      unitId: 'p1',
      slot: 4,
      targetId: 'e1',
    });
    expect(cast.ok).toBe(true);
    const gall = foe.effects.find((e) => e.id === 'GALL');
    expect(gall).toBeTruthy();
    expect(gall!.power).toBe(20); // 10 + L
    // Длительность при наложении 2+L//8=3; ход мог уже сдвинуть rounds.
    expect(gall!.rounds).toBeGreaterThanOrEqual(2);
    expect(gall!.rounds).toBeLessThanOrEqual(3);
  });

  test('fixture gall-l10: 3 тика ×20 Вода, −4 брони/тик, без возврата', () => {
    const state = createBattleState({
      matchId: 'ac12-gall-l10',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'C', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['B', hero('B')],
        ['C', hero('C', { armor: 20, health: 500 })],
      ]),
    });
    const foe = state.units.find((u) => u.id === 'e1')!;
    foe.armor = 20;
    foe.health = 500;
    foe.maxHp = 500;
    grantEffect(foe, 'GALL', 3, 20); // L10: 10+L урон, strip 5 // CUT-2026-11-09 AC-20
    expect(foe.armor).toBe(20); // наложение без снятия брони

    let totalDmg = 0;
    for (let i = 0; i < 3; i += 1) {
      foe.wasEffected = false;
      foe.effectsAgedThisRound = false;
      const current = foe.effects.find((e) => e.id === 'GALL');
      if (current) {
        current.fresh = undefined;
      }
      const beforeHp = foe.health;
      const beforeArmor = foe.armor;
      const startLog = tickEffectsOnTurnStart(foe);
      const lost = beforeHp - foe.health;
      totalDmg += lost;
      expect(lost).toBe(20);
      expect(foe.armor).toBe(beforeArmor - 5); // CUT-2026-11-09 AC-20
      expect(startLog.some((line) => line.includes('⟦WATER⟧'))).toBe(true);
      expect(startLog.some((line) => line.includes('Желчь') && line.includes('броню'))).toBe(true);
      tickEffectsOnTurnEnd(foe, state);
    }

    expect(totalDmg).toBe(60);
    expect(foe.armor).toBe(5); // CUT-2026-11-09 AC-20: 20 − 15
    expect(foe.effects.some((e) => e.id === 'GALL')).toBe(false);
  });

  test('fixture gall-floor: броня не ниже 0', () => {
    const state = createBattleState({
      matchId: 'ac12-gall-floor',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'C', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['B', hero('B')],
        ['C', hero('C', { armor: 3, health: 200 })],
      ]),
    });
    const foe = state.units.find((u) => u.id === 'e1')!;
    foe.armor = 3;
    grantEffect(foe, 'GALL', 2, 20); // L10 → strip 4
    const g = foe.effects.find((e) => e.id === 'GALL')!;
    g.fresh = undefined;
    foe.wasEffected = false;
    tickEffectsOnTurnStart(foe);
    expect(foe.armor).toBe(0);
  });

  test('fixture focused-labels: +/− имена, без «Сосредоточение»', () => {
    expect(effectLogLabel('FOCUSED')).toBe('Изменение точности');
    expect(effectLogLabel('FOCUSED', 15)).toBe('Повышение точности');
    expect(effectLogLabel('FOCUSED', -17)).toBe('Снижение точности');
    expect(effectLogLabel('FOCUSED', 15)).not.toContain('Сосредоточение');
    expect(effectLogLabel('FOCUSED', -17)).not.toContain('Сосредоточение');
  });

  test('fixture death-sentence: −броня наложить, возврат при снятии', () => {
    const state = createBattleState({
      matchId: 'ac12-death-sentence',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Witch', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Witch', hero('Witch', { mana: 20 })],
        ['B', hero('B', { armor: 30 })],
      ]),
    });
    const witch = state.units.find((u) => u.id === 'p1')!;
    const foe = state.units.find((u) => u.id === 'e1')!;
    witch.lvl = 10;
    foe.armor = 30;

    // power = 5 + floor((25 + 20) / 10) = 5 + 4 = 9
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const cast = applyAction(state, {
      action: 'ability',
      playerId: 'h',
      unitId: 'p1',
      slot: 3,
      targetId: 'e1',
    });
    expect(cast.ok).toBe(true);
    const ds = foe.effects.find((e) => e.id === 'DEATHSENTENCE');
    expect(ds).toBeTruthy();
    const power = ds!.power;
    expect(foe.armor).toBe(30 - power);
    expect(state.log.some((line) => line.toLowerCase().includes('смертный приговор'))).toBe(true);

    delEffect(foe, 'DEATHSENTENCE', state);
    expect(foe.armor).toBe(30);
  });
});
