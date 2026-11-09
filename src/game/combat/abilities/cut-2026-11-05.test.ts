import { describe, expect, test } from 'bun:test';

import { grantEffect, hasEffect } from '../effects';
import { applyAction, createBattleState } from '../engine';
import { resistsForClass } from '../defaultResists';
import type { HeroClassStats } from '../types';
import { applyAbility } from './registry';
import { archlichAbilities } from './archlich';
import { ghostWarriorAbilities } from './ghost-warrior';

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

describe('CUT-2026-11-05', () => {
  test('Mermaid heal costs 1 MP and scales with power', () => {
    const state = createBattleState({
      matchId: 'cut05-mermaid-heal',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'm', playerId: 'h', heroClassCode: 'Mermaid', row: 0, pickOrder: 1 },
        { id: 'a', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'e', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Mermaid', hero('Mermaid', { mana: 10, power: 10 })],
        ['Ally', hero('Ally')],
        ['B', hero('B')],
      ]),
    });
    const mermaid = state.units.find((u) => u.id === 'm')!;
    const ally = state.units.find((u) => u.id === 'a')!;
    ally.maxHp = 100;
    ally.health = 50;
    mermaid.power = 10;
    const healLow = applyAbility(state, mermaid, { slot: 1, targetId: 'a' });
    expect(healLow.status).toBe('done');
    expect(mermaid.mana).toBe(8); // CUT-2026-11-09 AC-2
    const healedLow = ally.health;

    mermaid.mana = 10;
    mermaid.power = 30;
    ally.health = 50;
    applyAbility(state, mermaid, { slot: 1, targetId: 'a' });
    expect(ally.health - healedLow).toBeGreaterThan(0);
  });

  test('GhostWarrior harvest self-buff only', () => {
    const state = createBattleState({
      matchId: 'cut05-harvest',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'g', playerId: 'h', heroClassCode: 'GhostWarrior', row: 0, pickOrder: 1 },
        { id: 'e', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['GhostWarrior', hero('GhostWarrior', { accuracy: 100 })],
        ['B', hero('B', { health: 500 })],
      ]),
    });
    const gw = state.units.find((u) => u.id === 'g')!;
    const foe = state.units.find((u) => u.id === 'e')!;
    const foeHp = foe.health;
    const logLen = state.log.length;
    const outcome = applyAbility(state, gw, { slot: 2 });
    expect(outcome.status).toBe('done');
    expect(foe.health).toBe(foeHp);
    expect(gw.critBank).toBe(1);
    expect(hasEffect(gw, 'FOCUSED')).toBe(true);
    expect(state.log.slice(logLen).some((line) => /чёрная жатва/i.test(line))).toBe(true);
    expect(state.log.slice(logLen).some((line) => /бьёт/i.test(line))).toBe(false);
  });

  test('GhostWarrior fetters blocked at HP >= 50%', () => {
    const state = createBattleState({
      matchId: 'cut05-fetters',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'g', playerId: 'h', heroClassCode: 'GhostWarrior', row: 0, pickOrder: 1 },
        { id: 'e', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['GhostWarrior', hero('GhostWarrior')],
        ['B', hero('B')],
      ]),
    });
    const gw = state.units.find((u) => u.id === 'g')!;
    gw.health = Math.ceil(gw.maxHp * 0.5);
    const meta = ghostWarriorAbilities.listAbilities(state, gw).find((a) => a.slot === 4);
    expect(meta?.disabledReason).toBe('Нужно ОЗ < 50%');
  });

  test('Detective economy-off poison: 50+2L% and 2 rounds', () => {
    const state = createBattleState({
      matchId: 'cut05-det',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'd', playerId: 'h', heroClassCode: 'Detective', row: 0, pickOrder: 1 },
        { id: 'e', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Detective', hero('Detective')],
        ['B', hero('B')],
      ]),
      rules: {
        maxTeamSize: 8,
        maxRowSize: 4,
        maxRounds: 20,
        healthBonus: 1,
        startingLevel: 1,
        fairEnabled: false,
        goldBonus: 1,
      },
    });
    const det = state.units.find((u) => u.id === 'd')!;
    det.lvl = 25;
    det.ultaCharges = 1;
    state.activeUnitId = 'd';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'd',
      action: 'ability',
      slot: 2,
      targetId: 'e',
    });
    expect(result.ok).toBe(true);
    const foe = state.units.find((u) => u.id === 'e')!;
    const poison = foe.effects.find((e) => e.id === 'POISON');
    expect(poison?.rounds).toBe(2);
    expect(50 + det.lvl * 2).toBe(100);
  });

  test('Archlich spends mana via trySpendMana (shackles burn)', () => {
    const state = createBattleState({
      matchId: 'cut05-lich',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'l', playerId: 'h', heroClassCode: 'Archlich', row: 0, pickOrder: 1 },
        { id: 'e', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Archlich', hero('Archlich', { mana: 10 })],
        ['B', hero('B', { health: 500, dodge: 0 })],
      ]),
    });
    const lich = state.units.find((u) => u.id === 'l')!;
    grantEffect(lich, 'MAGIC_SHACKLES', 3, 0);
    const hpBefore = lich.health;
    const outcome = archlichAbilities.apply(state, lich, { slot: 4, targetId: 'e' });
    expect(outcome.status).toBe('done');
    expect(lich.mana).toBe(8);
    expect(lich.health).toBeLessThan(hpBefore);
  });

  test('Mermaid freeze rejects under SILENCE', () => {
    const state = createBattleState({
      matchId: 'cut05-silence',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'm', playerId: 'h', heroClassCode: 'Mermaid', row: 0, pickOrder: 1 },
        { id: 'e', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Mermaid', hero('Mermaid', { mana: 10 })],
        ['B', hero('B')],
      ]),
    });
    const mermaid = state.units.find((u) => u.id === 'm')!;
    grantEffect(mermaid, 'SILENCE', 2, 0);
    const outcome = applyAbility(state, mermaid, { slot: 2, targetId: 'e' });
    expect(outcome.status).toBe('reject');
    expect(outcome.message).toContain('Немота');
  });

  test('giant STUN resists: Titan 60 ward 1', () => {
    const titan = resistsForClass('Titan').STUN;
    expect(titan?.value).toBe(40); // CUT-2026-11-09 AC-6
    expect(titan?.wardCharges).toBe(1);
    expect(resistsForClass('DemonLord').STUN?.value).toBe(25); // CUT-2026-11-09 AC-5
    expect(resistsForClass('Dracolich').STUN?.value).toBe(25); // CUT-2026-11-09 AC-7
  });
});
