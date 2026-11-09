import { describe, expect, test } from 'bun:test';

import { ITEM_CATALOG } from '../../items/catalog';
import { addItem, itemCount } from '../../items/inventory';
import { applyItemAction } from '../../items/use';
import { ITEM_PERK_BY_CATEGORY } from '../../perks/catalog';
import { grantEffect, hasEffect } from '../effects';
import { applyAction, createBattleState } from '../engine';
import type { BattleState, BattleUnit, HeroClassStats } from '../types';
import { PILOT_CLASS_CODES, listPilotAbilities } from './registry';
import { alliesOf, enemiesOf } from './targets';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 200,
  damage: 30,
  armor: 0,
  initiative: 10,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 20,
  mana: 20,
  maxMana: 20,
  gold: 500,
  size: 1,
  ...overrides,
});

const fairRules = {
  maxTeamSize: 8,
  maxRowSize: 4,
  maxRounds: 20,
  healthBonus: 1,
  startingLevel: 1,
  fairEnabled: true,
  goldBonus: 1,
};

function battle(hostCode: string): BattleState {
  const heroes = new Map<string, HeroClassStats>([
    [hostCode, hero(hostCode, { initiative: 80 })],
    ['Ally', hero('Ally', { initiative: 1 })],
    ['Foe', hero('Foe', { initiative: 1 })],
  ]);
  return createBattleState({
    matchId: `ac1-${hostCode}`,
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      { id: 'actor', playerId: 'h', heroClassCode: hostCode, row: 0, pickOrder: 1 },
      { id: 'ally', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
      { id: 'foe', playerId: 'g', heroClassCode: 'Foe', row: 0, pickOrder: 1 },
    ],
    heroes,
    rules: fairRules,
  });
}

function byId(state: BattleState, id: string): BattleUnit {
  const unit = state.units.find((item) => item.id === id);
  if (!unit) {
    throw new Error(id);
  }
  return unit;
}

describe('CUT-2026-11-09 AC-1', () => {
  test('враги не видят невидимого, союзники в массовом списке остаются', () => {
    const state = battle('Knight');
    const actor = byId(state, 'actor');
    const ally = byId(state, 'ally');
    const foe = byId(state, 'foe');
    grantEffect(foe, 'INVISIBLE', 2, 25);
    grantEffect(ally, 'INVISIBLE', 2, 25);
    expect(enemiesOf(state, actor).map((unit) => unit.id)).not.toContain('foe');
    expect(alliesOf(state, actor).map((unit) => unit.id)).toContain('ally');
    expect(foe.dodge).toBe(0);
  });

  test('все классы и слоты не отдают невидимого в цели и не тратят ход', () => {
    for (const code of PILOT_CLASS_CODES) {
      const state = battle(code);
      const actor = byId(state, 'actor');
      state.activeUnitId = actor.id;
      state.turnPlayerId = actor.playerId;
      grantEffect(byId(state, 'foe'), 'INVISIBLE', 2, 25);
      grantEffect(byId(state, 'ally'), 'INVISIBLE', 2, 25);
      const beforeDone = [...state.doneIds];
      for (const ability of listPilotAbilities(state, actor)) {
        expect(ability.legalTargetIds).not.toContain('foe');
        expect(ability.legalTargetIds).not.toContain('ally');
        const cast = applyAction(state, {
          playerId: actor.playerId,
          unitId: actor.id,
          action: 'ability',
          slot: ability.slot,
          targetId: 'foe',
        });
        expect(cast.ok).toBe(false);
        if (!cast.ok) {
          expect(cast.message).toBe('Цель невидима');
        }
        expect(state.activeUnitId).toBe(actor.id);
        expect(state.doneIds).toEqual(beforeDone);
        expect(hasEffect(byId(state, 'foe'), 'INVISIBLE')).toBe(true);
      }
    }
  });

  test('базовая атака по невидимому не тратит ход', () => {
    const state = battle('Goblin');
    const actor = state.units.find((unit) => unit.playerId === 'h')!;
    state.activeUnitId = actor.id;
    state.turnPlayerId = actor.playerId;
    const foe = byId(state, 'foe');
    grantEffect(foe, 'INVISIBLE', 2, 25);
    const hp = foe.health;
    const cast = applyAction(state, {
      playerId: actor.playerId,
      unitId: actor.id,
      action: 'attack',
      targetId: 'foe',
    });
    expect(cast.ok).toBe(false);
    if (!cast.ok) {
      expect(cast.message).toBe('Цель невидима');
    }
    expect(foe.health).toBe(hp);
    expect(state.activeUnitId).toBe(actor.id);
  });

  test('защита и ожидание не снимают невидимость, атака снимает после удара', () => {
    const state = battle('Knight');
    const actor = byId(state, 'actor');
    state.activeUnitId = actor.id;
    state.turnPlayerId = actor.playerId;
    grantEffect(actor, 'INVISIBLE', 2, 25);
    const defended = applyAction(state, {
      playerId: actor.playerId,
      unitId: actor.id,
      action: 'defend',
    });
    expect(defended.ok).toBe(true);
    expect(hasEffect(actor, 'INVISIBLE')).toBe(true);
    state.activeUnitId = actor.id;
    state.turnPlayerId = actor.playerId;
    state.doneIds = state.doneIds.filter((id) => id !== actor.id);
    const waited = applyAction(state, {
      playerId: actor.playerId,
      unitId: actor.id,
      action: 'wait',
    });
    expect(waited.ok).toBe(true);
    expect(hasEffect(actor, 'INVISIBLE')).toBe(true);
    state.activeUnitId = actor.id;
    state.turnPlayerId = actor.playerId;
    state.doneIds = state.doneIds.filter((id) => id !== actor.id);
    state.delayedIds = state.delayedIds.filter((id) => id !== actor.id);
    const attacked = applyAction(state, {
      playerId: actor.playerId,
      unitId: actor.id,
      action: 'attack',
      targetId: 'foe',
    });
    expect(attacked.ok).toBe(true);
    expect(hasEffect(actor, 'INVISIBLE')).toBe(false);
  });

  test('детектив под невидимостью достаёт задний ряд, затем открывается', () => {
    const heroes = new Map<string, HeroClassStats>([
      ['Detective', hero('Detective', { initiative: 90 })],
      ['Block', hero('Block', { initiative: 1 })],
      ['Back', hero('Back', { initiative: 1 })],
    ]);
    const state = createBattleState({
      matchId: 'det-invis',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'det', playerId: 'h', heroClassCode: 'Detective', row: 1, pickOrder: 1 },
        { id: 'block', playerId: 'g', heroClassCode: 'Block', row: 0, pickOrder: 1 },
        { id: 'back', playerId: 'g', heroClassCode: 'Back', row: 1, pickOrder: 2 },
      ],
      heroes,
      rules: fairRules,
    });
    const det = byId(state, 'det');
    state.activeUnitId = det.id;
    state.turnPlayerId = det.playerId;
    grantEffect(det, 'INVISIBLE', 2, 25);
    const slot = listPilotAbilities(state, det).find((ability) => ability.slot === 1);
    expect(slot?.legalTargetIds).toContain('back');
    const cast = applyAction(state, {
      playerId: det.playerId,
      unitId: det.id,
      action: 'ability',
      slot: 1,
      targetId: 'back',
    });
    expect(cast.ok).toBe(true);
    expect(hasEffect(det, 'INVISIBLE')).toBe(false);
  });

  test('предметы не бьют невидимого и не тратятся', () => {
    const state = battle('Knight');
    const actor = byId(state, 'actor');
    state.activeUnitId = actor.id;
    state.turnPlayerId = actor.playerId;
    const ally = byId(state, 'ally');
    const foe = byId(state, 'foe');
    ally.isSummon = true;
    foe.isSummon = true;
    foe.heroClassCode = 'Zombie';
    grantEffect(actor, 'INVISIBLE', 2, 25);
    grantEffect(ally, 'INVISIBLE', 2, 25);
    grantEffect(foe, 'INVISIBLE', 2, 25);
    for (const item of ITEM_CATALOG) {
      if (item.sellOnly || item.target === 'sellOnly') {
        continue;
      }
      const perk = ITEM_PERK_BY_CATEGORY.get(item.category);
      actor.perks = perk ? [perk.id] : [];
      addItem(state, actor.team, item.code, 1);
      const targetId =
        item.target === 'self'
          ? actor.id
          : item.target === 'ally' || item.target === 'allySummon'
            ? 'ally'
            : 'foe';
      const before = itemCount(state, actor.team, item.code);
      const result = applyItemAction(state, actor, { itemCode: item.code, targetId });
      if (item.target === 'self') {
        if (!result.ok) {
          expect(result.message).not.toBe('Цель невидима');
        }
      } else {
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toBe('Цель невидима');
        }
        expect(itemCount(state, actor.team, item.code)).toBe(before);
        expect(hasEffect(actor, 'INVISIBLE')).toBe(true);
      }
    }
  });
});
