import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { teamGold } from '../economy';
import { listPilotAbilities } from './abilities/registry';
import { dealDamage } from './damage';
import { grantEffect, hasEffect } from './effects';
import { applyAction, createBattleState, toBattleSummary } from './engine';
import { applyClassLevelUp } from './levelup';
import { setWard } from './resists';
import type { HeroClassStats } from './types';
import { battleApiJson, withSeed } from './test/seededRandom';

const FIXTURE_SEED = 20261101;
const FIXTURES_DIR = join(import.meta.dir, 'fixtures');

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

function writeFixtureJson(fixtureId: string, payload: string): void {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  writeFileSync(join(FIXTURES_DIR, `${fixtureId}.json`), payload, 'utf8');
}

describe('CUT-2026-11-01c deterministic fixtures + API JSON', () => {
  test('fixture ac2-inquisitor-ind1: ind > 0 даёт +16 брони / +10 силы', () => {
    withSeed(FIXTURE_SEED, () => {
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
      expect(unit.armor).toBe(26);
      expect(unit.power).toBe(30);
      const json = battleApiJson({
        fixtureId: 'ac2-inquisitor-ind1',
        seed: FIXTURE_SEED,
        log: state.log,
        units: state.units.map((u) => ({
          id: u.id,
          heroClassCode: u.heroClassCode,
          health: u.health,
          maxHp: u.maxHp,
          alive: u.alive,
        })),
      });
      writeFixtureJson('ac2-inquisitor-ind1', json);
      expect(json).toContain('"fixtureId": "ac2-inquisitor-ind1"');
    });
  });

  test('fixture ac15-marauder-gold: лог +N золота при level-up', () => {
    withSeed(FIXTURE_SEED, () => {
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
      const gain = after - before;
      expect(gain).toBeGreaterThanOrEqual(30);
      expect(gain).toBeLessThanOrEqual(50);
      const line = state.log.find((row) => row.includes('золота: усиление отряда'));
      expect(line).toBeTruthy();
      expect(line).toContain(`+${gain} золота`);
      const json = battleApiJson({
        fixtureId: 'ac15-marauder-gold',
        seed: FIXTURE_SEED,
        log: state.log,
        units: state.units.map((u) => ({
          id: u.id,
          heroClassCode: u.heroClassCode,
          health: u.health,
          maxHp: u.maxHp,
          alive: u.alive,
        })),
        teamGold: [after, teamGold(state, 1)],
      });
      writeFixtureJson('ac15-marauder-gold', json);
    });
  });

  test('fixture ac15c-contr-melee: CONTR отвечает на ближнюю атаку', () => {
    withSeed(FIXTURE_SEED, () => {
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
      expect(atk.health).toBeLessThan(hpBefore);
      expect(state.log.some((line) => line.includes('контрударом'))).toBe(true);
      expect(hasEffect(def, 'CONTR')).toBe(true);
      const summary = toBattleSummary(state);
      const json = battleApiJson({
        fixtureId: 'ac15c-contr-melee',
        seed: FIXTURE_SEED,
        log: summary.log,
        units: summary.units.map((u) => ({
          id: u.id,
          heroClassCode: u.heroClassCode,
          health: u.health,
          maxHp: u.maxHp,
          alive: u.alive,
        })),
      });
      writeFixtureJson('ac15c-contr-melee', json);
      expect(json).toContain('контрударом');
    });
  });

  test('fixture ac5-two-centaurs: снятие яда/ожога/крови; 59%; ward+lives', () => {
    withSeed(FIXTURE_SEED, () => {
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
      expect(hasEffect(k2, 'POISON')).toBe(true);
      expect(hasEffect(k2, 'BURNING')).toBe(true);
      expect(hasEffect(k2, 'BLEEDING')).toBe(true);

      // Баллада (слот 3) снимает яд/ожог/кровотечение с цели.
      if (state.teams?.[0]) {
        state.teams[0].gold = 500;
      }
      state.phase = 'combat';
      state.perkOffers = null;
      state.activeUnitId = 'p1';
      state.turnPlayerId = 'h';
      const ballad = applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        slot: 3,
        targetId: 'p2',
      });
      expect(ballad.ok).toBe(true);
      expect(hasEffect(k2, 'POISON')).toBe(false);
      expect(hasEffect(k2, 'BURNING')).toBe(false);
      expect(hasEffect(k2, 'BLEEDING')).toBe(false);

      // 59% — Самопожертвование недоступно; слот 5.
      k1.maxHp = 200;
      k1.health = Math.floor(200 * 0.59);
      const sac = listPilotAbilities(state, k1).find((a) => a.slot === 5);
      expect(sac?.disabledReason).toBeTruthy();

      // Урон себе сквозь вард / DEATHWARD / lives.
      k2.lives = 1;
      setWard(k2, 'WEAPON', 1);
      setWard(k2, 'DEATH', 1);
      dealDamage(k2, k2, { kind: 'melee', forceHit: true, source: 'WEAPON' }, state);
      expect(k2.alive).toBe(true);

      const json = battleApiJson({
        fixtureId: 'ac5-two-centaurs',
        seed: FIXTURE_SEED,
        log: state.log,
        units: state.units.map((u) => ({
          id: u.id,
          heroClassCode: u.heroClassCode,
          health: u.health,
          maxHp: u.maxHp,
          alive: u.alive,
        })),
      });
      writeFixtureJson('ac5-two-centaurs', json);
    });
  });

  test('fixture ac6-ranged-magic: попадание / промах / ranged / magic', () => {
    withSeed(FIXTURE_SEED, () => {
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
      expect(hit).toBeGreaterThan(0);

      def.dodgeBank = 1;
      const miss = dealDamage(atk, def, { kind: 'melee' }, state);
      expect(miss).toBe(0);

      def.dodgeBank = 0;
      const ranged = dealDamage(atk, def, { kind: 'ranged', forceHit: true }, state);
      expect(ranged).toBeGreaterThan(0);

      const magic = dealDamage(atk, def, { kind: 'magic', forceHit: true, source: 'FIRE' }, state);
      expect(magic).toBeGreaterThan(0);

      const json = battleApiJson({
        fixtureId: 'ac6-ranged-magic',
        seed: FIXTURE_SEED,
        log: state.log,
        units: state.units.map((u) => ({
          id: u.id,
          heroClassCode: u.heroClassCode,
          health: u.health,
          maxHp: u.maxHp,
          alive: u.alive,
        })),
      });
      writeFixtureJson('ac6-ranged-magic', json);
    });
  });
});
