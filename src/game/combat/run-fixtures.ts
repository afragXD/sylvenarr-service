/**
 * Реальный прогон фикстур CUT-2026-11-01c → combat/fixtures/runs/<id>.json
 * Usage: bun src/game/combat/run-fixtures.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { teamGold } from '../economy';
import { listPilotAbilities } from './abilities/registry';
import { createSummon } from './abilities/summon';
import { degradationSquareTargets } from './abilities/targets';
import {
  massDegradationBaseChance,
  massDegradationLevelLoss,
} from './abilities/witch';
import { pyRound } from './abilities/abbess';
import { dealDamage, estimateDamageRange, markDeadIfNeeded } from './damage';
import {
  addMentalIllness,
  applyIllnessTurnStart,
  applyMasochismRoundStart,
  applyMaxMoraleReward,
  maybePunishLowMorale,
  maxMorale,
} from './morale';
import { grantEffect, hasEffect } from './effects';
import { applyAction, createBattleState, toBattleSummary } from './engine';
import { levelUpUnit } from './level';
import { applyClassLevelUp } from './levelup';
import { setWard } from './resists';
import { ROW_BACK } from './settings';
import { applyCatalogStats } from './transform';
import type { BattleState, HeroClassStats } from './types';
import { battleApiJson, withSeed } from './test/seededRandom';

const SEED = 20261101;
const RUNS_DIR = join(import.meta.dir, 'fixtures', 'runs');
const RUN_SHA =
  process.env.GIT_SHA?.trim() ||
  process.env.COMMIT_SHA?.trim() ||
  Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: join(import.meta.dir, '../../..') })
    .stdout.toString()
    .trim() ||
  'unknown';
const RUN_AT = new Date().toISOString();

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

function snap(state: BattleState, extra: Record<string, unknown> = {}) {
  const summary = toBattleSummary(state);
  return {
    log: summary.log,
    units: summary.units.map((u) => ({
      id: u.id,
      heroClassCode: u.heroClassCode,
      health: u.health,
      maxHp: u.maxHp,
      alive: u.alive,
      morale: u.morale,
      mana: u.mana,
      lvl: u.lvl,
      damage: u.damage,
      power: u.power,
      armor: u.armor,
      accuracy: u.accuracy,
    })),
    teamGold: [teamGold(state, 0), teamGold(state, 1)] as [number, number],
    ...extra,
  };
}

function writeRun(fixtureId: string, result: Record<string, unknown>) {
  mkdirSync(RUNS_DIR, { recursive: true });
  const payload = {
    fixtureId,
    seed: SEED,
    sha: RUN_SHA,
    ranAt: RUN_AT,
    result,
  };
  writeFileSync(join(RUNS_DIR, `${fixtureId}.json`), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`ok ${fixtureId}`);
}

function duel(
  hostCode: string,
  guestCode = 'B',
  hostOver: Partial<HeroClassStats> = {},
  guestOver: Partial<HeroClassStats> = {},
  matchId = 'ac1',
) {
  return createBattleState({
    matchId,
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      { id: 'p1', playerId: 'h', heroClassCode: hostCode, row: 0, pickOrder: 1 },
      { id: 'e1', playerId: 'g', heroClassCode: guestCode, row: 0, pickOrder: 1 },
    ],
    heroes: new Map([
      [hostCode, hero(hostCode, { initiative: 99, ...hostOver })],
      [guestCode, hero(guestCode, { initiative: 1, ...guestOver })],
    ]),
  });
}

const runners: Record<string, () => Record<string, unknown>> = {
  ac1() {
    const state = duel('Knight');
    return snap(state, { note: 'base duel' });
  },

  'ac1-max-morale-life'() {
    const state = duel('Knight');
    const unit = state.units.find((u) => u.id === 'p1')!;
    const cap = maxMorale(unit);
    unit.lives = 0;
    unit.morale = cap;
    applyMaxMoraleReward(unit, state);
    return snap(state, { maxMorale: cap, lives: unit.lives, morale: unit.morale });
  },

  'ac1-spend-life'() {
    const state = duel('Knight', 'B', { health: 150 });
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.resists = {};
    unit.maxHp = 150;
    unit.health = 0;
    unit.lives = 1;
    markDeadIfNeeded(state, unit);
    return snap(state, { initiative: unit.initiative });
  },

  'ac1-low-morale-mage'() {
    const state = duel('Pyro', 'B', { power: 50, mana: 15 });
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.power = 50;
    unit.morale = -90;
    let applied = false;
    for (let i = 0; i < 80 && !applied; i += 1) {
      unit.power = 50;
      unit.effects = unit.effects.filter((e) => e.id !== 'ABSOLUTEPOWER');
      maybePunishLowMorale(state, unit);
      if (hasEffect(unit, 'ABSOLUTEPOWER')) {
        applied = true;
      }
    }
    return snap(state, { applied, power: unit.power });
  },

  'ac1-low-morale-warrior'() {
    const state = duel('Knight', 'B', { damage: 40 });
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.damage = 40;
    unit.morale = -90;
    let applied = false;
    for (let i = 0; i < 80 && !applied; i += 1) {
      unit.damage = 40;
      unit.effects = unit.effects.filter((e) => e.id !== 'STRENGTH');
      maybePunishLowMorale(state, unit);
      if (hasEffect(unit, 'STRENGTH')) {
        applied = true;
      }
    }
    return snap(state, { applied, damage: unit.damage });
  },

  'ac1-paranoia'() {
    const state = createBattleState({
      matchId: 'ac1-paranoia',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Tank', row: 0, pickOrder: 2 },
        { id: 'p3', playerId: 'h', heroClassCode: 'Fragile', row: 1, pickOrder: 3 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Knight', hero('Knight', { initiative: 99, damage: 40, accuracy: 100, luck: 0 })],
        ['Tank', hero('Tank', { initiative: 1, health: 200, dodge: 0 })],
        ['Fragile', hero('Fragile', { initiative: 1, health: 40, dodge: 0, armor: 0 })],
        ['B', hero('B', { initiative: 1 })],
      ]),
    });
    const knight = state.units.find((u) => u.id === 'p1')!;
    const fragile = state.units.find((u) => u.id === 'p3')!;
    fragile.health = 15;
    const tank = state.units.find((u) => u.id === 'p2')!;
    tank.health = 180;
    addMentalIllness(state, knight, 1);
    knight.illness = true;
    applyIllnessTurnStart(state, knight);
    return snap(state);
  },

  'ac1-apathy'() {
    const state = duel('Knight');
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.dodge = 20;
    unit.luck = 15;
    unit.initiative = 40;
    addMentalIllness(state, unit, 2);
    return snap(state, {
      dodge: unit.dodge,
      luck: unit.luck,
      initiative: unit.initiative,
    });
  },

  'schizo-items'() {
    const state = createBattleState({
      matchId: 'schizo-items',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A')],
        ['B', hero('B')],
      ]),
      rules: {
        maxTeamSize: 8,
        maxRowSize: 4,
        maxRounds: 20,
        healthBonus: 1,
        startingLevel: 1,
        fairEnabled: true,
        goldBonus: 1,
      },
    });
    const unit = state.units.find((u) => u.id === 'p1')!;
    state.teams![0]!.inventory = [237, 147, 307];
    state.teams![0]!.gold = 500;
    unit.accuracy = 100;
    addMentalIllness(state, unit, 3);
    return snap(state, {
      inventory: state.teams![0]!.inventory,
      accuracy: unit.accuracy,
      illnessKind: unit.illnessKind,
    });
  },

  'schizo-empty'() {
    const state = createBattleState({
      matchId: 'schizo-empty',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A')],
        ['B', hero('B')],
      ]),
      rules: {
        maxTeamSize: 8,
        maxRowSize: 4,
        maxRounds: 20,
        healthBonus: 1,
        startingLevel: 1,
        fairEnabled: true,
        goldBonus: 1,
      },
    });
    const unit = state.units.find((u) => u.id === 'p1')!;
    state.teams![0]!.inventory = [];
    state.teams![0]!.gold = 500;
    unit.accuracy = 100;
    const goldBefore = teamGold(state, 0);
    addMentalIllness(state, unit, 3);
    const goldAfter = teamGold(state, 0);
    return snap(state, {
      inventory: state.teams![0]!.inventory,
      goldBefore,
      goldAfter,
      illnessKind: unit.illnessKind,
    });
  },

  'ac1-degradation'() {
    const state = duel('Knight');
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.lvl = 9;
    unit.hiddenLvl = 9;
    unit.mana = 8;
    unit.perks = ['MISC', 'LUCKYBASTARD'];
    (state as { rules: BattleState['rules'] }).rules = { ...state.rules, fairEnabled: true };
    addMentalIllness(state, unit, 4);
    return snap(state, { perks: unit.perks, lvl: unit.lvl, mana: unit.mana });
  },

  'ac1-masochism'() {
    const state = duel('Knight', 'B', { damage: 40, power: 25 });
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.damage = 40;
    unit.power = 25;
    unit.armor = 50;
    unit.health = 100;
    addMentalIllness(state, unit, 5);
    unit.illness = true;
    applyMasochismRoundStart(state);
    return snap(state, { health: unit.health });
  },

  'ac2-beer-phrase'() {
    const state = createBattleState({
      matchId: 'ac2-beer-phrase',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'BeerElemental', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['BeerElemental', hero('BeerElemental', { initiative: 99 })],
        ['Ally', hero('Ally', { initiative: 1 })],
        ['B', hero('B', { initiative: 1 })],
      ]),
    });
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 1,
      targetId: 'p2',
    });
    return snap(state);
  },

  'ac2-mind-beer-pyro'() {
    // Как в unit-тесте: Demiurge slot 3 «подчиняет» → удар элементаля WEAPON, не FIRE.
    const state = createBattleState({
      matchId: 'ac2-mind-beer-pyro',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Demiurge', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'BeerElemental', row: 0, pickOrder: 1 },
        { id: 'e2', playerId: 'g', heroClassCode: 'Pyro', row: 0, pickOrder: 2 },
      ],
      heroes: new Map([
        ['Demiurge', hero('Demiurge', { initiative: 99, mana: 15, power: 30 })],
        ['BeerElemental', hero('BeerElemental', { initiative: 1, damage: 40, accuracy: 100 })],
        ['Pyro', hero('Pyro', { initiative: 1, health: 200 })],
      ]),
    });
    const pyro = state.units.find((u) => u.id === 'e2')!;
    const beer = state.units.find((u) => u.id === 'e1')!;
    pyro.health = 30;
    pyro.lvl = 1;
    setWard(pyro, 'FIRE', 5);
    beer.health = 180;
    beer.lvl = 1;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 3,
      targetId: 'e1',
    });
    const subordinated = state.log.some((line) => line.includes('подчиняет'));
    return snap(state, {
      subordinated,
      hasWeaponLog: state.log.some((line) => line.includes('⟦WEAPON⟧')),
      hasFireLog: state.log.some((line) => line.includes('⟦FIRE⟧')),
    });
  },

  'ac2-assassin-mimic-mana'() {
    const state = createBattleState({
      matchId: 'ac2-assassin-mimic-mana',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Assassin', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Paladin', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Assassin', hero('Assassin', { initiative: 99, mana: 10, maxMana: 10 })],
        ['Paladin', hero('Paladin', { initiative: 1, mana: 10, maxMana: 10 })],
        ['B', hero('B', { initiative: 1 })],
      ]),
    });
    const assassin = state.units.find((u) => u.id === 'p1')!;
    assassin.mana = 4;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 2,
      targetId: 'p2',
    });
    return snap(state, {
      heroClassCode: assassin.heroClassCode,
      mana: assassin.mana,
    });
  },

  'ac2-eternal-hunger'() {
    const state = createBattleState({
      matchId: 'ac2-eternal-hunger',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Werewolf', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Werewolf', hero('Werewolf', { initiative: 99, damage: 40, accuracy: 100, health: 200 })],
        ['B', hero('B', { initiative: 1, armor: 20, health: 500 })],
      ]),
    });
    const wolf = state.units.find((u) => u.id === 'p1')!;
    const foe = state.units.find((u) => u.id === 'e1')!;
    const armorBefore = foe.armor;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 2,
      targetId: 'e1',
    });
    const after = listPilotAbilities(state, wolf).find((a) => a.slot === 2);
    return snap(state, {
      armorBefore,
      armorAfter: foe.armor,
      disabledReason: after?.disabledReason ?? null,
    });
  },

  'ac2-inquisitor-ind0'() {
    const state = createBattleState({
      matchId: 'ac2-inquisitor-ind0',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Inquisitor', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Inquisitor', hero('Inquisitor', { armor: 10, power: 20 })],
        ['B', hero('B')],
      ]),
    });
    state.stage = 5;
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.armor = 10;
    unit.power = 20;
    applyClassLevelUp(unit, 0, state);
    const after0 = { armor: unit.armor, power: unit.power };
    levelUpUnit(unit, 1, state);
    return snap(state, { afterInd0: after0, afterInd1: { armor: unit.armor, power: unit.power } });
  },

  'ac2-inquisitor-ind1'() {
    const state = createBattleState({
      matchId: 'ac2-inquisitor-ind1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Inquisitor', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Inquisitor', hero('Inquisitor', { armor: 10, power: 20 })],
        ['B', hero('B')],
      ]),
    });
    state.stage = 5;
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.armor = 10;
    unit.power = 20;
    applyClassLevelUp(unit, 1, state);
    return snap(state, { armor: unit.armor, power: unit.power });
  },

  'ac5-ballad'() {
    const state = createBattleState({
      matchId: 'ac5-ballad',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Knight', hero('Knight')],
        ['Ally', hero('Ally')],
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
    const knight = state.units.find((u) => u.id === 'p1')!;
    const ally = state.units.find((u) => u.id === 'p2')!;
    knight.lvl = 10;
    state.teams![0]!.gold = 500;
    grantEffect(ally, 'POISON', 3, 1);
    grantEffect(ally, 'BURNING', 2, 1);
    grantEffect(ally, 'BLEEDING', 2, 1);
    state.phase = 'combat';
    state.perkOffers = null;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 3,
      targetId: 'p2',
    });
    return snap(state, {
      poison: hasEffect(ally, 'POISON'),
      burning: hasEffect(ally, 'BURNING'),
      bleeding: hasEffect(ally, 'BLEEDING'),
      strength: hasEffect(ally, 'STRENGTH'),
    });
  },

  'ac5-sac'() {
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
    const blocked = listPilotAbilities(state, knight).find((a) => a.slot === 5)?.disabledReason;
    knight.health = 120;
    ally.health = 0;
    ally.alive = false;
    state.graveyard.push({
      unitId: 'p2',
      team: 0,
      heroClassCode: 'Ally',
      displayName: 'Ally',
      forbiddenResurrect: false,
    });
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 5,
      targetId: 'p2',
    });
    return snap(state, {
      blockedAt119: blocked,
      knightAlive: knight.alive,
      allyAlive: ally.alive,
      sacrificedSelf: knight.sacrificedSelf,
    });
  },

  'ac5-sac2'() {
    const state = createBattleState({
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
    const k2 = state.units.find((u) => u.id === 'k2')!;
    const dead = state.units.find((u) => u.id === 'dead')!;
    dead.alive = false;
    dead.health = 0;
    dead.sacrificedSelf = true;
    state.graveyard.push({
      unitId: 'dead',
      team: 0,
      heroClassCode: 'Knight',
      displayName: 'Knight',
      forbiddenResurrect: false,
    });
    k2.health = 200;
    const sac = listPilotAbilities(state, k2).find((a) => a.slot === 5)!;
    return snap(state, { legalTargetIds: sac.legalTargetIds });
  },

  'ac5-two-centaurs'() {
    const state = createBattleState({
      matchId: 'ac5-two-centaurs',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Knight', hero('Knight', { initiative: 99, health: 200 })],
        ['B', hero('B', { initiative: 1 })],
      ]),
    });
    const k1 = state.units.find((u) => u.id === 'p1')!;
    const k2 = state.units.find((u) => u.id === 'p2')!;
    grantEffect(k2, 'POISON', 2, 5);
    grantEffect(k2, 'BURNING', 2, 5);
    grantEffect(k2, 'BLEEDING', 2, 5);
    if (state.teams?.[0]) state.teams[0].gold = 500;
    state.phase = 'combat';
    state.perkOffers = null;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 3,
      targetId: 'p2',
    });
    k1.maxHp = 200;
    k1.health = Math.floor(200 * 0.59);
    const sac = listPilotAbilities(state, k1).find((a) => a.slot === 5);
    k2.lives = 1;
    setWard(k2, 'WEAPON', 1);
    setWard(k2, 'DEATH', 1);
    dealDamage(k2, k2, { kind: 'melee', forceHit: true, source: 'WEAPON' }, state);
    return snap(state, {
      cleared: {
        poison: hasEffect(k2, 'POISON'),
        burning: hasEffect(k2, 'BURNING'),
        bleeding: hasEffect(k2, 'BLEEDING'),
      },
      sacDisabled: sac?.disabledReason ?? null,
      k2Alive: k2.alive,
    });
  },

  'ac6-pr'() {
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
    const ally = state.units.find((u) => u.id === 'p2')!;
    const foe = state.units.find((u) => u.id === 'e1')!;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
      targetId: 'p2',
    });
    ally.armor = 0;
    foe.damage = 40;
    const atkHp = foe.health;
    const dealt = dealDamage(
      foe,
      ally,
      { kind: 'melee', damageMult: 1, armorIgnore: 1, forceHit: true },
      state,
    );
    const missHp = foe.health;
    foe.accuracy = 0;
    ally.dodge = 100;
    dealDamage(foe, ally, { kind: 'melee', damageMult: 1 }, state);
    return snap(state, {
      dealt,
      reflected: atkHp - missHp,
      missNoReflect: foe.health === missHp,
      hasPainReflect: hasEffect(ally, 'PAIN_REFLECT'),
    });
  },

  'ac6-chain'() {
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
      state,
    );
    return snap(state, {
      dealt,
      aDelta: aBefore - a.health,
      bDelta: bBefore - b.health,
    });
  },

  'ac6-ranged-magic'() {
    const state = createBattleState({
      matchId: 'ac6-ranged-magic',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 1, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A', { damage: 40, power: 40, accuracy: 100, luck: 0 })],
        ['B', hero('B', { armor: 0, dodge: 0, health: 500 })],
      ]),
    });
    const atk = state.units.find((u) => u.id === 'p1')!;
    const def = state.units.find((u) => u.id === 'e1')!;
    const hit = dealDamage(atk, def, { kind: 'melee', forceHit: true }, state);
    def.dodgeBank = 1;
    const miss = dealDamage(atk, def, { kind: 'melee' }, state);
    def.dodgeBank = 0;
    const ranged = dealDamage(atk, def, { kind: 'ranged', forceHit: true }, state);
    const magic = dealDamage(atk, def, { kind: 'magic', forceHit: true, source: 'FIRE' }, state);
    return snap(state, { hit, miss, ranged, magic });
  },

  'ac6-fetters'() {
    // Два носителя Оков (GhostWarrior): цель — враг при ОЗ < 50%.
    const state = createBattleState({
      matchId: 'ac6-fetters',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'GhostWarrior', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'GhostWarrior', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['GhostWarrior', hero('GhostWarrior', { initiative: 99, mana: 20, health: 200 })],
        ['B', hero('B', { health: 200 })],
      ]),
    });
    const gw1 = state.units.find((u) => u.id === 'p1')!;
    const foe = state.units.find((u) => u.id === 'e1')!;
    gw1.maxHp = 200;
    gw1.health = 80;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
      targetId: 'e1',
    });
    return snap(state, {
      ok: result.ok,
      fettersTargetId: gw1.fettersTargetId ?? null,
      foeId: foe.id,
    });
  },

  'ac8-prayer'() {
    const state = createBattleState({
      matchId: 'ac8-prayer',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Dracolich', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Zombie', row: 0, pickOrder: 2 },
        { id: 'p3', playerId: 'h', heroClassCode: 'Knight', row: 1, pickOrder: 3 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Dracolich', hero('Dracolich')],
        ['Zombie', hero('Zombie')],
        ['Knight', hero('Knight')],
        ['B', hero('B')],
      ]),
    });
    const draco = state.units.find((u) => u.id === 'p1')!;
    const zombie = state.units.find((u) => u.id === 'p2')!;
    const knight = state.units.find((u) => u.id === 'p3')!;
    draco.lvl = 6;
    zombie.lvl = 3;
    knight.lvl = 4;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 3,
    });
    return snap(state, {
      ok: result.ok,
      levels: { draco: draco.lvl, zombie: zombie.lvl, knight: knight.lvl },
      cd: draco.abilityCds?.[3] ?? null,
    });
  },

  'ac8-necro'() {
    const state = createBattleState({
      matchId: 'ac8-necro',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Dracolich', row: 0, pickOrder: 1 },
        { id: 'a1', playerId: 'h', heroClassCode: 'Archlich', row: 0, pickOrder: 2 },
        { id: 'a2', playerId: 'h', heroClassCode: 'Zombie', row: 1, pickOrder: 3 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Dracolich', hero('Dracolich')],
        ['Archlich', hero('Archlich')],
        ['Zombie', hero('Zombie')],
        ['B', hero('B')],
      ]),
    });
    const a1 = state.units.find((u) => u.id === 'a1')!;
    const a2 = state.units.find((u) => u.id === 'a2')!;
    a1.alive = false;
    a1.health = 0;
    a2.alive = false;
    a2.health = 0;
    state.graveyard.push(
      {
        unitId: 'a1',
        team: 0,
        heroClassCode: 'Archlich',
        displayName: 'Archlich',
        forbiddenResurrect: false,
      },
      {
        unitId: 'a2',
        team: 0,
        heroClassCode: 'Zombie',
        displayName: 'Zombie',
        forbiddenResurrect: false,
      },
    );
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const first = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
      targetId: 'a1',
    });
    return snap(state, { firstOk: first.ok, a1Alive: a1.alive, prompt: state.prompt ?? null });
  },

  'ac8-necro1'() {
    const state = createBattleState({
      matchId: 'ac8-necro1',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Dracolich', row: 0, pickOrder: 1 },
        { id: 'a1', playerId: 'h', heroClassCode: 'Zombie', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Dracolich', hero('Dracolich')],
        ['Zombie', hero('Zombie')],
        ['B', hero('B')],
      ]),
    });
    const a1 = state.units.find((u) => u.id === 'a1')!;
    a1.alive = false;
    a1.health = 0;
    state.graveyard.push({
      unitId: 'a1',
      team: 0,
      heroClassCode: 'Zombie',
      displayName: 'Zombie',
      forbiddenResurrect: false,
    });
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
      targetId: 'a1',
    });
    return snap(state, { ok: result.ok, a1Alive: a1.alive, activeUnitId: state.activeUnitId });
  },

  'ac8-skip'() {
    const state = createBattleState({
      matchId: 'ac8-skip',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Dracolich', row: 0, pickOrder: 1 },
        { id: 'a1', playerId: 'h', heroClassCode: 'Zombie', row: 0, pickOrder: 2 },
        { id: 'a2', playerId: 'h', heroClassCode: 'Specter', row: 1, pickOrder: 3 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Dracolich', hero('Dracolich')],
        ['Zombie', hero('Zombie')],
        ['Specter', hero('Specter')],
        ['B', hero('B')],
      ]),
    });
    for (const id of ['a1', 'a2']) {
      const unit = state.units.find((u) => u.id === id)!;
      unit.alive = false;
      unit.health = 0;
      state.graveyard.push({
        unitId: id,
        team: 0,
        heroClassCode: unit.heroClassCode,
        displayName: unit.displayName,
        forbiddenResurrect: false,
      });
    }
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, { playerId: 'h', unitId: 'p1', action: 'ability', slot: 4 });
    applyAction(state, { playerId: 'h', unitId: 'p1', action: 'ability', choice: 'a1' });
    const promptBefore = state.pendingPrompt?.kind ?? null;
    applyAction(state, { playerId: 'h', unitId: 'p1', action: 'ability', choice: 'skip' });
    return snap(state, {
      promptBefore,
      promptAfter: state.pendingPrompt,
      a1Alive: state.units.find((u) => u.id === 'a1')!.alive,
    });
  },

  'ac8-devour'() {
    const state = createBattleState({
      matchId: 'ac8-devour',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Dracolich', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Dracolich', hero('Dracolich', { initiative: 99 })],
        ['B', hero('B', { armor: 20, health: 500 })],
      ]),
    });
    const foe = state.units.find((u) => u.id === 'e1')!;
    grantEffect(foe, 'MARKED', 2, 0);
    foe.health = Math.floor(foe.maxHp * 0.19);
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 5,
      targetId: 'e1',
    });
    return snap(state, { foeAlive: foe.alive, foeArmor: foe.armor, hpRatio: 0.19 });
  },

  'ac8-devour20'() {
    const state = createBattleState({
      matchId: 'ac8-devour20',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Dracolich', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Dracolich', hero('Dracolich', { initiative: 99 })],
        ['B', hero('B', { armor: 20, health: 500 })],
      ]),
    });
    const foe = state.units.find((u) => u.id === 'e1')!;
    foe.health = Math.ceil(foe.maxHp * 0.2);
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 5,
      targetId: 'e1',
    });
    return snap(state, { foeAlive: foe.alive, hpRatio: 0.2 });
  },

  'ac8-fs'() {
    const state = createBattleState({
      matchId: 'ac8-fs',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Dracolich', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Dracolich', hero('Dracolich', { initiative: 99 })],
        ['B', hero('B', { health: 500 })],
      ]),
    });
    const foe = state.units.find((u) => u.id === 'e1')!;
    foe.health = Math.floor(foe.maxHp * 0.19);
    setWard(foe, 'FINALSTRIKE', 1);
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 5,
      targetId: 'e1',
    });
    return snap(state, {
      foeAlive: foe.alive,
      finalStrikeWard: foe.resists.FINALSTRIKE?.wardCharges ?? null,
    });
  },

  'ac9-sq'() {
    const state = createBattleState({
      matchId: 'ac9-sq',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'w', playerId: 'h', heroClassCode: 'Witch', row: 0, pickOrder: 1 },
        { id: 'f0', playerId: 'g', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'f1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 2 },
        { id: 'b0', playerId: 'g', heroClassCode: 'C', row: 1, pickOrder: 3 },
        { id: 'b1', playerId: 'g', heroClassCode: 'D', row: 1, pickOrder: 4 },
      ],
      heroes: new Map([
        ['Witch', hero('Witch')],
        ['A', hero('A')],
        ['B', hero('B')],
        ['C', hero('C')],
        ['D', hero('D')],
      ]),
    });
    const witch = state.units.find((u) => u.id === 'w')!;
    const f0 = state.units.find((u) => u.id === 'f0')!;
    const ids = degradationSquareTargets(state, witch, f0).map((u) => u.id);
    return snap(state, { squareIds: ids });
  },

  'ac9-cast'() {
    const state = createBattleState({
      matchId: 'ac9-cast',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'w', playerId: 'h', heroClassCode: 'Witch', row: 0, pickOrder: 1 },
        { id: 'f0', playerId: 'g', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'f1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 2 },
        { id: 'b0', playerId: 'g', heroClassCode: 'C', row: 1, pickOrder: 3 },
        { id: 'b1', playerId: 'g', heroClassCode: 'D', row: 1, pickOrder: 4 },
      ],
      heroes: new Map([
        ['Witch', hero('Witch', { mana: 20 })],
        ['A', hero('A')],
        ['B', hero('B')],
        ['C', hero('C')],
        ['D', hero('D')],
      ]),
    });
    const witch = state.units.find((u) => u.id === 'w')!;
    witch.lvl = 10;
    witch.mana = 20;
    for (const id of ['f0', 'f1', 'b0', 'b1']) {
      const u = state.units.find((x) => x.id === id)!;
      u.lvl = 10;
    }
    state.activeUnitId = 'w';
    state.turnPlayerId = 'h';
    // force success via seed path already; chance chain metadata:
    const chain = (() => {
      let c = massDegradationBaseChance(10);
      const out = [c];
      for (let i = 0; i < 3; i += 1) {
        c = Math.max(0, c - 15);
        out.push(c);
      }
      return out;
    })();
    applyAction(state, {
      playerId: 'h',
      unitId: 'w',
      action: 'ability',
      slot: 4,
      targetId: 'f0',
    });
    return snap(state, {
      mana: witch.mana,
      cd: witch.abilityCds?.[4] ?? null,
      chain,
      primaryLoss: massDegradationLevelLoss(10, true),
      otherLoss: massDegradationLevelLoss(10, false),
      levels: Object.fromEntries(
        ['f0', 'f1', 'b0', 'b1'].map((id) => [id, state.units.find((u) => u.id === id)!.lvl]),
      ),
    });
  },

  'ac9-ward'() {
    const state = createBattleState({
      matchId: 'ac9-ward',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'w', playerId: 'h', heroClassCode: 'Witch', row: 0, pickOrder: 1 },
        { id: 'inq', playerId: 'g', heroClassCode: 'Inquisitor', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Witch', hero('Witch', { mana: 20 })],
        ['Inquisitor', hero('Inquisitor')],
      ]),
    });
    const witch = state.units.find((u) => u.id === 'w')!;
    const inq = state.units.find((u) => u.id === 'inq')!;
    witch.lvl = 10;
    const before = inq.lvl;
    inq.resists.MIND = { value: 0 };
    const wardBefore = inq.resists.LOWERINGLEVEL?.wardCharges ?? 0;
    state.activeUnitId = 'w';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'w',
      action: 'ability',
      slot: 4,
      targetId: 'inq',
    });
    return snap(state, {
      lvlBefore: before,
      lvlAfter: inq.lvl,
      loweringWardBefore: wardBefore,
      loweringWardAfter: inq.resists.LOWERINGLEVEL?.wardCharges ?? 0,
    });
  },

  'ac10-mentor'() {
    const state = createBattleState({
      matchId: 'ac10-mentor',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Incub', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Incub', hero('Incub', { mana: 20 })],
        ['B', hero('B')],
        ['Ectoplasm', hero('Ectoplasm')],
      ]),
    });
    const incub = state.units.find((u) => u.id === 'p1')!;
    incub.lvl = 10;
    incub.maxSummons = 2;
    const summon = createSummon(state, {
      summoner: incub,
      heroCode: 'Ectoplasm',
      row: 0,
      level: 4,
    })!;
    state.doneIds.push(summon.id);
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
      targetId: summon.id,
    });
    return snap(state, { summonLvl: summon.lvl, lucky: hasEffect(summon, 'LUCKY') });
  },

  'ac10-doc'() {
    const state = createBattleState({
      matchId: 'ac10-doc',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'inc', playerId: 'h', heroClassCode: 'Incub', row: 0, pickOrder: 1 },
        { id: 'orc', playerId: 'h', heroClassCode: 'Oracle', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Incub', hero('Incub')],
        ['Oracle', hero('Oracle')],
        ['B', hero('B')],
      ]),
    });
    const incub = state.units.find((u) => u.id === 'inc')!;
    const oracle = state.units.find((u) => u.id === 'orc')!;
    const incubSlots = listPilotAbilities(state, incub).map((a) => ({
      slot: a.slot,
      label: a.label,
    }));
    const oracleSlots = listPilotAbilities(state, oracle).map((a) => ({
      slot: a.slot,
      label: a.label,
    }));
    return snap(state, { incubSlots, oracleSlots });
  },

  'ac10-whip'() {
    const state = createBattleState({
      matchId: 'ac10-whip',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Incub', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Incub', hero('Incub', { initiative: 99, mana: 20 })],
        ['B', hero('B', { health: 300 })],
      ]),
    });
    const foe = state.units.find((u) => u.id === 'e1')!;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 2,
      targetId: 'e1',
    });
    return snap(state, {
      foeEffects: foe.effects.map((e) => ({ id: e.id, rounds: e.rounds })),
    });
  },

  'ac11-ward'() {
    const state = createBattleState({
      matchId: 'ac11-ward',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'C', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['B', hero('B')],
        ['C', hero('C')],
      ]),
    });
    const unit = state.units.find((u) => u.id === 'p1')!;
    setWard(unit, 'WEAPON', 1);
    setWard(unit, 'WEAPON', 1);
    const afterFalse = unit.resists.WEAPON?.wardCharges ?? null;
    setWard(unit, 'WEAPON', 1, true);
    setWard(unit, 'WEAPON', 1, true);
    return snap(state, {
      afterNonCumulative: afterFalse,
      afterCumulative: unit.resists.WEAPON?.wardCharges ?? null,
    });
  },

  'ac11-moon'() {
    const state = createBattleState({
      matchId: 'ac11-moon',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Marauder', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Marauder', hero('Marauder')],
        ['Werewolf', hero('Werewolf', { health: 150, damage: 25 })],
        ['B', hero('B')],
      ]),
    });
    const wolf = state.units.find((u) => u.id === 'p1')!;
    wolf.transformParentCode = 'Marauder';
    applyCatalogStats(state, wolf, 'Werewolf');
    wolf.abilityCds = {};
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    const first = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 5,
    });
    return snap(state, {
      firstOk: first.ok,
      activeStill: state.activeUnitId,
      weaponWard: wolf.resists.WEAPON?.wardCharges ?? null,
      cd: wolf.abilityCds?.[5] ?? null,
    });
  },

  'ac11-azart'() {
    const state = createBattleState({
      matchId: 'ac11-azart',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Inquisitor', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Inquisitor', hero('Inquisitor')],
        ['B', hero('B', { health: 100 })],
      ]),
    });
    const foe = state.units.find((u) => u.id === 'e1')!;
    foe.maxHp = 100;
    foe.health = 32;
    const bonus =
      foe.maxHp > 0 && foe.health < foe.maxHp * 0.33 ? 14 + 5 : 0;
    return snap(state, { hp: foe.health, maxHp: foe.maxHp, finishingBonusAtL5: bonus });
  },

  'ac11-azart33'() {
    const state = createBattleState({
      matchId: 'ac11-azart33',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Inquisitor', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Inquisitor', hero('Inquisitor')],
        ['B', hero('B', { health: 100 })],
      ]),
    });
    const foe = state.units.find((u) => u.id === 'e1')!;
    foe.maxHp = 100;
    foe.health = 33;
    const bonus =
      foe.maxHp > 0 && foe.health < foe.maxHp * 0.33 ? 14 + 5 : 0;
    return snap(state, { hp: foe.health, maxHp: foe.maxHp, finishingBonusAtL5: bonus });
  },

  'ac12-gall-l10'() {
    const state = createBattleState({
      matchId: 'ac12-gall-l10',
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
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
      targetId: 'e1',
    });
    const gall = foe.effects.find((e) => e.id === 'GALL');
    return snap(state, {
      gall: gall ? { rounds: gall.rounds, power: gall.power } : null,
      armor: foe.armor,
    });
  },

  'ac13-melee-preview'() {
    const state = createBattleState({
      matchId: 'ac13-melee-preview',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A', { damage: 40, accuracy: 100, luck: 0 })],
        ['B', hero('B', { armor: 10, dodge: 0, health: 5000 })],
      ]),
    });
    const atk = state.units.find((u) => u.id === 'p1')!;
    const def = state.units.find((u) => u.id === 'e1')!;
    def.health = 5000;
    def.maxHp = 5000;
    atk.critBank = 0;
    atk.luck = 0;
    const est = estimateDamageRange(atk, def, { kind: 'melee' });
    const samples: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      def.health = 5000;
      samples.push(dealDamage(atk, def, { kind: 'melee', forceHit: true }, state));
    }
    return snap(state, { estimate: est, samples });
  },

  'ac13-low-dmg'() {
    const state = createBattleState({
      matchId: 'ac13-low-dmg',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A', { damage: 5, accuracy: 100 })],
        ['B', hero('B', { armor: 20, health: 200 })],
      ]),
    });
    const atk = state.units.find((u) => u.id === 'p1')!;
    const def = state.units.find((u) => u.id === 'e1')!;
    const est = estimateDamageRange(atk, def, { kind: 'melee' });
    return snap(state, { estimate: est });
  },

  'ac13-abbess-heal-preview'() {
    const state = createBattleState({
      matchId: 'ac13-abbess-heal-preview',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Abbess', row: ROW_BACK, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Abbess', hero('Abbess', { power: 49, mana: 10, maxMana: 10, initiative: 99 })],
        ['Ally', hero('Ally')],
        ['B', hero('B')],
      ]),
    });
    const abbess = state.units.find((u) => u.id === 'p1')!;
    abbess.row = ROW_BACK;
    abbess.power = 49;
    abbess.mana = 10;
    const hand = listPilotAbilities(state, abbess).find((a) => a.slot === 2)!;
    return snap(state, {
      previewHealMin: hand.previewHealMin,
      previewHealMax: hand.previewHealMax,
      expectedMin: pyRound(49 * 0.5),
      expectedMax: pyRound(49 * 0.75),
    });
  },

  'ac15-marauder-gold'() {
    const state = createBattleState({
      matchId: 'ac15-marauder-gold',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Marauder', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Marauder', hero('Marauder', { displayName: 'Мародёр' })],
        ['B', hero('B')],
      ]),
    });
    const unit = state.units.find((u) => u.id === 'p1')!;
    const before = teamGold(state, 0);
    applyClassLevelUp(unit, 1, state);
    const after = teamGold(state, 0);
    return snap(state, { goldBefore: before, goldAfter: after, gain: after - before });
  },

  'ac15c-contr-melee'() {
    const state = createBattleState({
      matchId: 'ac15c-contr-melee',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A', { damage: 10, accuracy: 100, luck: 0 })],
        ['B', hero('B', { damage: 30, health: 200 })],
      ]),
    });
    const atk = state.units.find((u) => u.id === 'p1')!;
    const def = state.units.find((u) => u.id === 'e1')!;
    def.lvl = 4;
    grantEffect(def, 'CONTR', 2, 0);
    const hpBefore = atk.health;
    dealDamage(atk, def, { kind: 'melee', forceHit: true }, state);
    return snap(state, {
      hpBefore,
      hpAfter: atk.health,
      contrRounds: def.effects.find((e) => e.id === 'CONTR')?.rounds ?? null,
    });
  },
};

const ids = Object.keys(runners);
let failed = 0;
for (const id of ids) {
  try {
    withSeed(SEED, () => {
      const result = runners[id]!();
      // гарантируем наличие/fixtureId в результате для proof
      const api = battleApiJson({
        fixtureId: id,
        seed: SEED,
        log: (result.log as string[]) ?? [],
        units: (result.units as Array<{
          id: string;
          heroClassCode: string;
          health: number;
          maxHp: number;
          alive: boolean;
        }>) ?? [],
        teamGold: result.teamGold as [number, number] | undefined,
      });
      writeRun(id, { ...result, apiJson: JSON.parse(api) });
    });
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${id}`, err);
    writeRun(id, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

console.log(`done: ${ids.length - failed}/${ids.length} ok, seed=${SEED}`);
if (failed > 0) {
  process.exitCode = 1;
}
