import { describe, expect, test } from 'bun:test';

import { markDeadIfNeeded } from '../damage';
import { healUnit, trySpendMana } from '../effects';
import { createBattleState } from '../engine';
import { applyClassLevelUp } from '../levelup';
import type { BattleState, HeroClassStats } from '../types';
import { bumpsUntilHiddenMod } from './charge-hints';
import { applyAbility } from './registry';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 200,
  damage: 20,
  armor: 0,
  initiative: 10,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 20,
  mana: 10,
  maxMana: 10,
  gold: 0,
  size: 1,
  ...overrides,
});

function duel(code: string): BattleState {
  return createBattleState({
    matchId: 'rest',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      { id: 'a', playerId: 'h', heroClassCode: code, row: 0, pickOrder: 1 },
      { id: 'b', playerId: 'g', heroClassCode: 'Foe', row: 0, pickOrder: 1 },
    ],
    heroes: new Map([
      [code, hero(code, { initiative: 90 })],
      ['Foe', hero('Foe', { initiative: 1, health: 400, mana: 8, maxMana: 8 })],
    ]),
  });
}

describe('CUT-2026-11-09 хвост', () => {
  test('оковы: X×(5+⌊L/4⌋) Жизнью, мана цели сглаза не сгорает', () => {
    const state = duel('Specter');
    const actor = state.units.find((unit) => unit.id === 'a')!;
    const foe = state.units.find((unit) => unit.id === 'b')!;
    state.activeUnitId = actor.id;
    actor.lvl = 1;
    foe.mana = 8;
    const beforeMana = foe.mana;
    const cast = applyAbility(state, actor, { slot: 3, targetId: 'b' });
    expect(cast.status).toBe('done');
    expect(foe.mana).toBe(beforeMana);
    expect(foe.effects.some((effect) => effect.id === 'MAGIC_SHACKLES')).toBe(true);
    const shackles = foe.effects.find((effect) => effect.id === 'MAGIC_SHACKLES');
    expect(shackles?.casterLvl).toBe(1);
    const hp = foe.health;
    expect(trySpendMana(foe, 2)).toBeNull();
    expect(foe.health).toBe(hp - 2 * (5 + Math.floor(1 / 4)));
  });

  test('Патриарх: заряд на повышениях при скрытом уровне 7 и 14', () => {
    const state = duel('Patriarch');
    const actor = state.units.find((unit) => unit.id === 'a')!;
    expect(actor.ultaCharges).toBe(1);
    for (let round = 1; round <= 20; round += 1) {
      state.stage = round;
      const before = actor.hiddenLvl;
      applyClassLevelUp(actor, 1, state);
      if (before % 7 === 0) {
        expect(actor.ultaCharges).toBeGreaterThan(1);
      }
    }
    expect(actor.hiddenLvl).toBe(21);
    expect(actor.ultaCharges).toBe(1 + 2);
    expect(bumpsUntilHiddenMod(1, 7)).toBe(7);
    expect(bumpsUntilHiddenMod(7, 7)).toBe(1);
  });

  test('оковы любви копируют лечение один раз и рвутся смертью', () => {
    const state = duel('Patriarch');
    const actor = state.units.find((unit) => unit.id === 'a')!;
    const allyHero = hero('Ally', { initiative: 1 });
    state.catalog.Ally = allyHero;
    state.units.push({
      ...actor,
      id: 'ally',
      heroClassCode: 'Ally',
      displayName: 'Союзник',
      health: 50,
      maxHp: 100,
      effects: [],
    });
    actor.mana = 10;
    actor.health = 40;
    const cast = applyAbility(state, actor, { slot: 5, targetId: 'ally' });
    expect(cast.status).toBe('done');
    const ally = state.units.find((unit) => unit.id === 'ally')!;
    const before = ally.health;
    healUnit(actor, 10);
    expect(ally.health).toBe(before + 10);
    ally.health = 1;
    actor.health = 0;
    actor.lives = 0;
    markDeadIfNeeded(state, actor);
    expect(ally.effects.some((effect) => effect.id === 'LOVE_SHACKLES')).toBe(false);
  });

  test('Белый маг: прирост маны 1–3, не 0', () => {
    const state = duel('Demiurge');
    const actor = state.units.find((unit) => unit.id === 'a')!;
    actor.mana = 0;
    actor.maxMana = 8;
    const seen = new Set<number>();
    for (let i = 0; i < 40; i += 1) {
      actor.mana = 0;
      const before = actor.mana;
      applyClassLevelUp(actor, 1, state);
      seen.add(actor.mana - before);
      actor.lvl = 1;
      actor.hiddenLvl = 1;
    }
    expect(seen.has(0)).toBe(false);
    expect([...seen].every((value) => value >= 1 && value <= 3)).toBe(true);
  });
});
