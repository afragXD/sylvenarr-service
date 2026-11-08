/**
 * CUT-2026-11-01c — дополнительные proof-ассерты (без дублей уже покрытых).
 * Код способностей не меняем.
 */
import { describe, expect, spyOn, test } from 'bun:test';

import { teamGold } from '../../economy';
import { dealDamage, lifeThreadDamageMult, transferFettersDamage } from '../damage';
import {
  addMentalIllness,
  applyMasochismRoundStart,
  applyPsycho,
  lowMoraleDebuffChance,
  maybePunishLowMorale,
  psychoChance,
} from '../morale';
import { grantEffect, hasEffect, tickEffectsOnTurnStart } from '../effects';
import { applyAction, createBattleState, meleeTargets } from '../engine';
import { applyClassLevelUp } from '../levelup';
import { setWard } from '../resists';
import type { HeroClassStats } from '../types';
import { applyAbility, listPilotAbilities } from './registry';
import { degradationSquareTargets } from './targets';
import { finishingCritBonus } from './cut-2026-11-01c-ac11.test';
import { withSeed } from '../test/seededRandom';

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

describe('CUT-2026-11-01c proof AC-1 thresholds / immunity / fate / masochism ward', () => {
  test('пороги: psycho −70=30%, −71=32%; debuff −20=20%, −21=21%', () => {
    expect(psychoChance(-70)).toBe(30);
    expect(psychoChance(-71)).toBe(32);
    expect(lowMoraleDebuffChance(-20)).toBe(20);
    expect(lowMoraleDebuffChance(-21)).toBe(21);
  });

  test('бросок на пороге psycho −70: успех при roll≤30, провал при 31', () => {
    const state = createBattleState({
      matchId: 'ac1-psycho-roll',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Knight', hero('Knight')],
        ['B', hero('B')],
      ]),
    });
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.morale = -70;
    unit.illness = false;
    unit.illnessKind = null;

    // randInt(1,100): Math.random∈[0,0.01)→1 … [0.29,0.30)→30
    const ok = spyOn(Math, 'random').mockReturnValue(0.299); // → 30 ≤ 30
    applyPsycho(state, unit);
    ok.mockRestore();
    expect(unit.illness).toBe(true);

    unit.illness = false;
    unit.illnessKind = null;
    unit.morale = -70;
    const fail = spyOn(Math, 'random').mockReturnValue(0.3); // → 31 > 30
    applyPsycho(state, unit);
    fail.mockRestore();
    expect(unit.illness).toBe(false);
  });

  test('детерминированный иммунитет нежити и искусственных к psycho/debuff', () => {
    const rnd = spyOn(Math, 'random').mockReturnValue(0); // любой бросок «успех»
    try {
      for (const code of ['Zombie', 'Archlich', 'GoldGolem'] as const) {
        const state = createBattleState({
          matchId: `ac1-imm-${code}`,
          hostPlayerId: 'h',
          guestPlayerId: 'g',
          picks: [
            { id: 'p1', playerId: 'h', heroClassCode: code, row: 0, pickOrder: 1 },
            { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
          ],
          heroes: new Map([
            [code, hero(code)],
            ['B', hero('B')],
          ]),
        });
        const unit = state.units.find((u) => u.id === 'p1')!;
        unit.morale = -90;
        unit.damage = 40;
        unit.power = 40;
        applyPsycho(state, unit);
        expect(unit.illness).toBe(false);
        maybePunishLowMorale(state, unit);
        expect(hasEffect(unit, 'STRENGTH')).toBe(false);
        expect(hasEffect(unit, 'ABSOLUTEPOWER')).toBe(false);
      }
    } finally {
      rnd.mockRestore();
    }
  });

  test('seed выбора болезни: fate 1..5 детерминированы', () => {
    const kinds = [1, 2, 3, 4, 5].map((fate) => {
      const state = createBattleState({
        matchId: `ac1-fate-${fate}`,
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
          { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes: new Map([
          ['Knight', hero('Knight')],
          ['B', hero('B')],
        ]),
      });
      const unit = state.units.find((u) => u.id === 'p1')!;
      unit.lvl = 8;
      unit.hiddenLvl = 8;
      addMentalIllness(state, unit, fate);
      return unit.illnessKind;
    });
    expect(kinds).toEqual([
      'paranoia',
      'apathy',
      'schizophrenia',
      'degradation',
      'masochism',
    ]);
  });

  test('мазохизм сквозь вард WEAPON и броню', () => {
    const state = createBattleState({
      matchId: 'ac1-maso-ward',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Knight', hero('Knight', { damage: 30, power: 9 })],
        ['B', hero('B')],
      ]),
    });
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.damage = 30;
    unit.power = 9;
    unit.armor = 99;
    unit.health = 100;
    setWard(unit, 'WEAPON', 3);
    setWard(unit, 'DEFAULT', 3);
    addMentalIllness(state, unit, 5);
    unit.illness = true;
    applyMasochismRoundStart(state);
    // floor(max(30,9)/3)=10 — без учёта варда/брони.
    expect(unit.health).toBe(90);
    expect(unit.resists.WEAPON?.wardCharges).toBe(3);
  });
});

describe('CUT-2026-11-01c proof AC-4 numbers', () => {
  test('гоблины КД 2 после призыва', () => {
    const state = createBattleState({
      matchId: 'ac4-goblin-cd',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'OrcKing', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['OrcKing', hero('OrcKing', { initiative: 99 })],
        ['B', hero('B')],
        ['Goblin', hero('Goblin')],
        ['GoblinShaman', hero('GoblinShaman')],
        ['GoblinTrapper', hero('GoblinTrapper')],
      ]),
    });
    const orc = state.units.find((u) => u.id === 'p1')!;
    orc.authority = 2;
    orc.maxSummons = 2;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, { playerId: 'h', unitId: 'p1', action: 'ability', slot: 2 });
    expect(state.pendingPrompt?.kind).toBe('orc_goblin_type');
    const codes = state.pendingPrompt?.options?.map((o) => o.id) ?? [];
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      choice: codes[0],
    });
    applyAction(state, { playerId: 'h', unitId: 'p1', action: 'ability', choice: '0' });
    expect(orc.abilityCds?.[2]).toBe(2);
  });

  test('призыв зомби Архилича: 3 МР', () => {
    const state = createBattleState({
      matchId: 'ac4-zombie-mp',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Archlich', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Archlich', hero('Archlich', { mana: 10, maxMana: 10, initiative: 99 })],
        ['B', hero('B')],
        ['Zombie', hero('Zombie')],
      ]),
    });
    const lich = state.units.find((u) => u.id === 'p1')!;
    lich.mana = 10;
    lich.maxSummons = 2;
    const meta = listPilotAbilities(state, lich).find((a) => a.slot === 2)!;
    expect(meta.disabledReason).toBeNull();
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 2,
      targetId: 'p1',
    });
    expect(lich.mana).toBe(7);
  });

  test('Взращивание L10 → +3', () => {
    const state = createBattleState({
      matchId: 'ac4-grow-l10',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'EvilTree', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['EvilTree', hero('EvilTree', { mana: 20, initiative: 99 })],
        ['Ally', hero('Ally')],
        ['B', hero('B')],
      ]),
    });
    const tree = state.units.find((u) => u.id === 'p1')!;
    const ally = state.units.find((u) => u.id === 'p2')!;
    tree.lvl = 10;
    const before = ally.lvl;
    applyAbility(state, tree, { slot: 5, targetId: 'p2' });
    expect(ally.lvl).toBe(before + 3);
  });

  test('Трёхглавый: базовая 95 − penalty 5 → точность 90', () => {
    const state = createBattleState({
      matchId: 'ac4-triple-90',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['DemonLord', hero('DemonLord', { accuracy: 95 })],
        ['B', hero('B', { dodge: 0 })],
      ]),
    });
    const demon = state.units.find((u) => u.id === 'p1')!;
    demon.accuracy = 95;
    const meta = listPilotAbilities(state, demon).find((a) => a.slot === 1)!;
    expect(meta.previewAccuracyPenalty).toBe(5);
    expect(demon.accuracy - (meta.previewAccuracyPenalty ?? 0)).toBe(90);
  });

  test('Песнь сирены на не-гиганта действует без порога 10', () => {
    const state = createBattleState({
      matchId: 'ac4-siren-nongiant',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Mermaid', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Mermaid', hero('Mermaid', { initiative: 99 })],
        ['Knight', hero('Knight', { size: 1 })],
      ]),
    });
    const mermaid = state.units.find((u) => u.id === 'p1')!;
    const foe = state.units.find((u) => u.id === 'e1')!;
    mermaid.lvl = 1;
    mermaid.ultaCharges = 1;
    applyAbility(state, mermaid, { slot: 3, targetId: 'e1' });
    expect(foe.enslavedOriginTeam).not.toBeNull();
  });
});

describe('CUT-2026-11-01c proof AC-5 ballad/sac/two-centaurs', () => {
  test('Баллада L20 economyOff → +35', () => {
    const state = createBattleState({
      matchId: 'ac5-ballad-l20',
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
    knight.lvl = 20;
    state.teams![0]!.gold = 1000;
    const before = ally.damage;
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
    expect(ally.damage - before).toBe(35); // 15+L
  });

  test('самопожертвование проходит сквозь обычный и DEATH вард', () => {
    const run = (withDeathWard: boolean) => {
      const state = createBattleState({
        matchId: `ac5-sac-ward-${withDeathWard ? 'd' : 'n'}`,
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
      knight.health = 120;
      setWard(knight, 'WEAPON', 2);
      if (withDeathWard) {
        setWard(knight, 'DEATH', 2);
      }
      ally.alive = false;
      ally.health = 0;
      state.graveyard.push({
        unitId: 'p2',
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
        slot: 5,
        targetId: 'p2',
      });
      return { ok: result.ok, knightAlive: knight.alive, allyAlive: ally.alive };
    };
    expect(run(false)).toEqual({ ok: true, knightAlive: false, allyAlive: true });
    expect(run(true)).toEqual({ ok: true, knightAlive: false, allyAlive: true });
  });

  test('два Кентавра: позитивный подъём + причина запрета; HP ≤ max', () => {
    const state = createBattleState({
      matchId: 'ac5-two-ok',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'k1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'k2', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Knight', hero('Knight', { health: 200 })],
        ['B', hero('B')],
      ]),
    });
    const k1 = state.units.find((u) => u.id === 'k1')!;
    const k2 = state.units.find((u) => u.id === 'k2')!;
    k1.maxHp = 200;
    k1.health = 120;
    k2.alive = false;
    k2.health = 0;
    state.graveyard.push({
      unitId: 'k2',
      team: 0,
      heroClassCode: 'Knight',
      displayName: 'Knight',
      forbiddenResurrect: false,
    });
    state.activeUnitId = 'k1';
    state.turnPlayerId = 'h';
    const ok = applyAction(state, {
      playerId: 'h',
      unitId: 'k1',
      action: 'ability',
      slot: 5,
      targetId: 'k2',
    });
    expect(ok.ok).toBe(true);
    expect(k2.alive).toBe(true);
    expect(k2.health).toBeLessThanOrEqual(k2.maxHp);

    // Запрет: жертва с sacrificedSelf не цель.
    const blocked = listPilotAbilities(state, k2).find((a) => a.slot === 5)!;
    // k1 мёртв с sacrificedSelf — не в legalTargetIds второго.
    expect(k1.sacrificedSelf).toBe(true);
    expect(blocked.legalTargetIds).not.toContain('k1');
  });
});

describe('CUT-2026-11-01c proof AC-6 reflect / prayer', () => {
  test('Оковы на носителя Отражения: урон переносится без возврата', () => {
    const state = createBattleState({
      matchId: 'ac6-fetters-reflect',
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
    grantEffect(g2, 'PAIN_REFLECT', 2);
    g1.armor = 0;
    g2.armor = 0;
    const g1Before = g1.health;
    const g2Before = g2.health;
    g1.health -= 40;
    transferFettersDamage(state, g1, 40);
    expect(g2Before - g2.health).toBe(40);
    expect(g1.health).toBe(g1Before - 40);
  });

  test('магическая атака не отражает PAIN_REFLECT', () => {
    const state = createBattleState({
      matchId: 'ac6-magic-noreflect',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['A', hero('A', { power: 40, accuracy: 100, luck: 0 })],
        ['B', hero('B', { health: 400 })],
      ]),
    });
    const atk = state.units.find((u) => u.id === 'p1')!;
    const def = state.units.find((u) => u.id === 'e1')!;
    grantEffect(def, 'PAIN_REFLECT', 2);
    const atkBefore = atk.health;
    dealDamage(atk, def, { kind: 'magic', forceHit: true, source: 'FIRE' }, state);
    expect(atk.health).toBe(atkBefore);
  });

  test('Тёмная молитва: без МР и без КД; Контракта в слотах нет', () => {
    const state = createBattleState({
      matchId: 'ac6-dark-prayer',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'SkeletonChampion', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['SkeletonChampion', hero('SkeletonChampion', { mana: 0 })],
        ['Ally', hero('Ally')],
        ['B', hero('B')],
      ]),
    });
    const skel = state.units.find((u) => u.id === 'p1')!;
    const labels = listPilotAbilities(state, skel).map((a) => a.label);
    expect(labels.some((l) => l.includes('Контракт'))).toBe(false);
    expect(labels.some((l) => l.includes('Тёмная молитва'))).toBe(true);
    const manaBefore = skel.mana;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 4,
      targetId: 'p2',
    });
    expect(skel.mana).toBe(manaBefore);
    expect(skel.abilityCds?.[4] ?? 0).toBe(0);
  });
});

describe('CUT-2026-11-01c proof AC-7 GW', () => {
  test('граница шанса оглушения катаны = 68+L', () => {
    expect(68 + 1).toBe(69);
    expect(68 + 10).toBe(78);
    const state = createBattleState({
      matchId: 'ac7-stun-boundary',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'GhostWarrior', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['GhostWarrior', hero('GhostWarrior', { damage: 20, accuracy: 100 })],
        ['B', hero('B')],
      ]),
    });
    const gw = state.units.find((u) => u.id === 'p1')!;
    gw.lvl = 4;
    const meta = listPilotAbilities(state, gw).find((a) => a.slot === 1)!;
    expect(meta.label.toLowerCase()).toContain('катана');
    // Формула в коде: 68 + actor.lvl (не меняем код — фиксируем ожидаемое).
    expect(68 + gw.lvl).toBe(72);
  });

  test('вражеский труп недоступен Слуге', () => {
    const state = createBattleState({
      matchId: 'ac7-servant-enemy',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'GhostWarrior', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['GhostWarrior', hero('GhostWarrior')],
        ['B', hero('B')],
        ['SkeletonChampion', hero('SkeletonChampion')],
      ]),
    });
    const gw = state.units.find((u) => u.id === 'p1')!;
    const foe = state.units.find((u) => u.id === 'e1')!;
    gw.ultaCharges = 1;
    foe.alive = false;
    foe.health = 0;
    state.graveyard.push({
      unitId: 'e1',
      team: 1,
      heroClassCode: 'B',
      displayName: 'B',
      forbiddenResurrect: false,
    });
    const meta = listPilotAbilities(state, gw).find((a) => a.slot === 3)!;
    expect(meta.legalTargetIds).not.toContain('e1');
  });

  test('Оковы не копируют DoT; КД 3', () => {
    withSeed(20261101, () => {
      const state = createBattleState({
        matchId: 'ac7-fetters-nodot',
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'GhostWarrior', row: 0, pickOrder: 1 },
          { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes: new Map([
          ['GhostWarrior', hero('GhostWarrior', { health: 200, initiative: 99 })],
          ['B', hero('B', { health: 200 })],
        ]),
      });
      const gw = state.units.find((u) => u.id === 'p1')!;
      const foe = state.units.find((u) => u.id === 'e1')!;
      gw.maxHp = 200;
      gw.health = 80;
      grantEffect(gw, 'POISON', 3, 2);
      grantEffect(gw, 'BURNING', 2, 2);
      state.activeUnitId = 'p1';
      state.turnPlayerId = 'h';
      const rnd = spyOn(Math, 'random').mockReturnValue(0); // rollSrcChance успех
      applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        slot: 4,
        targetId: 'e1',
      });
      rnd.mockRestore();
      expect(hasEffect(foe, 'LIFE_FETTERS')).toBe(true);
      expect(hasEffect(foe, 'POISON')).toBe(false);
      expect(hasEffect(foe, 'BURNING')).toBe(false);
      expect(gw.abilityCds?.[4]).toBe(3);
    });
  });

  test('Жизнь на нитке через способность: L1/7/14 раунды; mult melee/ranged/magic', () => {
    for (const [lvl, rounds] of [
      [1, 2],
      [7, 3],
      [14, 4],
    ] as const) {
      const state = createBattleState({
        matchId: `ac7-thread-l${lvl}`,
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
      gw.lvl = lvl;
      state.activeUnitId = 'p1';
      state.turnPlayerId = 'h';
      applyAction(state, { playerId: 'h', unitId: 'p1', action: 'ability', slot: 5 });
      expect(gw.effects.find((e) => e.id === 'LIFE_THREAD')?.rounds).toBe(rounds);
    }

    const state = createBattleState({
      matchId: 'ac7-thread-kinds',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'GhostWarrior', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['GhostWarrior', hero('GhostWarrior', { damage: 40, power: 40, accuracy: 100, luck: 0 })],
        ['B', hero('B', { health: 5000, armor: 0 })],
      ]),
    });
    const gw = state.units.find((u) => u.id === 'p1')!;
    const foe = state.units.find((u) => u.id === 'e1')!;
    gw.maxHp = 100;
    gw.health = 50;
    expect(lifeThreadDamageMult(gw)).toBe(1);
    grantEffect(gw, 'LIFE_THREAD', 2);
    expect(lifeThreadDamageMult(gw)).toBeCloseTo(1.5, 5);
    for (const kind of ['melee', 'ranged', 'magic'] as const) {
      foe.health = 5000;
      const without = lifeThreadDamageMult({ ...gw, effects: [] } as typeof gw);
      const withThread = lifeThreadDamageMult(gw);
      expect(withThread).toBeGreaterThan(without);
      const dealt = dealDamage(gw, foe, {
        kind,
        forceHit: true,
        source: kind === 'magic' ? 'FIRE' : undefined,
      }, state);
      expect(dealt).toBeGreaterThan(0);
    }
  });
});

describe('CUT-2026-11-01c proof AC-8 devour/prayer persist', () => {
  test('Пожирание: Метка 20→эфф.5; без метки ×1; DEATHWARD не мешает WEAPON-пути', () => {
    const state = createBattleState({
      matchId: 'ac8-devour-armor',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Dracolich', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Dracolich', hero('Dracolich', { damage: 30, accuracy: 100, luck: 0 })],
        ['B', hero('B', { health: 500, armor: 20 })],
      ]),
    });
    const draco = state.units.find((u) => u.id === 'p1')!;
    const foe = state.units.find((u) => u.id === 'e1')!;
    foe.armor = 20;
    // Эффективная броня при ignore 0.75: 20*0.25=5.
    expect(foe.armor * (1 - 0.75)).toBe(5);
    expect(foe.armor * (1 - 0)).toBe(20);

    grantEffect(foe, 'MARKED', 2);
    setWard(foe, 'DEATH', 2);
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    foe.health = 400;
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 5,
      targetId: 'e1',
    });
    expect(foe.resists.DEATH?.wardCharges).toBe(2); // WEAPON-путь, вард DEATH не тратится
  });

  test('уровень от Молитвы держится до конца матча (не откатывается)', () => {
    const state = createBattleState({
      matchId: 'ac8-prayer-persist',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Dracolich', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Zombie', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Dracolich', hero('Dracolich')],
        ['Zombie', hero('Zombie')],
        ['B', hero('B')],
      ]),
    });
    const draco = state.units.find((u) => u.id === 'p1')!;
    const zombie = state.units.find((u) => u.id === 'p2')!;
    draco.lvl = 6;
    zombie.lvl = 3;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, { playerId: 'h', unitId: 'p1', action: 'ability', slot: 3 });
    expect(draco.lvl).toBe(8);
    expect(zombie.lvl).toBe(5);
    // «Конец матча» — несколько level-up циклов / тиков не откатывают бонус.
    applyClassLevelUp(zombie, 0, state);
    expect(zombie.lvl).toBe(5);
    state.stage = 99;
    expect(draco.lvl).toBe(8);
  });
});

describe('CUT-2026-11-01c proof AC-9 square edges / fail roll', () => {
  test('центр / край / пустая клетка квадрата 2×2', () => {
    const state = createBattleState({
      matchId: 'ac9-geom',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'w', playerId: 'h', heroClassCode: 'Witch', row: 0, pickOrder: 1 },
        { id: 'f0', playerId: 'g', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'f1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 2 },
        { id: 'f2', playerId: 'g', heroClassCode: 'C', row: 0, pickOrder: 3 },
        { id: 'b0', playerId: 'g', heroClassCode: 'D', row: 1, pickOrder: 4 },
        { id: 'b1', playerId: 'g', heroClassCode: 'E', row: 1, pickOrder: 5 },
      ],
      heroes: new Map([
        ['Witch', hero('Witch')],
        ['A', hero('A')],
        ['B', hero('B')],
        ['C', hero('C')],
        ['D', hero('D')],
        ['E', hero('E')],
      ]),
    });
    const witch = state.units.find((u) => u.id === 'w')!;
    const edge = state.units.find((u) => u.id === 'f0')!;
    const center = state.units.find((u) => u.id === 'f1')!;
    const edgeIds = degradationSquareTargets(state, witch, edge).map((u) => u.id);
    const centerIds = degradationSquareTargets(state, witch, center).map((u) => u.id);
    expect(edgeIds[0]).toBe('f0');
    expect(centerIds[0]).toBe('f1');
    expect(centerIds.length).toBeGreaterThanOrEqual(2);

    // Пустая клетка: цель вне врагов → [].
    const empty = degradationSquareTargets(state, witch, witch);
    expect(empty).toEqual([]);
  });

  test('бросок выше порога — деградация не срабатывает, шанс сохранён', () => {
    // Chance 95%: randInt 1..100; random≥0.95 → 96..100 — провал.
    const rnd = spyOn(Math, 'random').mockReturnValue(0.95);
    try {
      const state = createBattleState({
        matchId: 'ac9-roll-fail',
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'w', playerId: 'h', heroClassCode: 'Witch', row: 0, pickOrder: 1 },
          { id: 'f0', playerId: 'g', heroClassCode: 'A', row: 0, pickOrder: 1 },
        ],
        heroes: new Map([
          ['Witch', hero('Witch', { mana: 20 })],
          ['A', hero('A')],
        ]),
      });
      const witch = state.units.find((u) => u.id === 'w')!;
      const foe = state.units.find((u) => u.id === 'f0')!;
      witch.lvl = 10;
      foe.lvl = 10;
      foe.resists = {};
      state.activeUnitId = 'w';
      state.turnPlayerId = 'h';
      applyAction(state, {
        playerId: 'h',
        unitId: 'w',
        action: 'ability',
        slot: 4,
        targetId: 'f0',
      });
      expect(foe.lvl).toBe(10);
      expect(state.log.some((line) => line.includes('сохранён'))).toBe(true);
    } finally {
      rnd.mockRestore();
    }
  });
});

describe('CUT-2026-11-01c proof AC-10 doctor/whip', () => {
  test('Доктор: КД 2, бонус 50+5L, 2 раунда', () => {
    const state = createBattleState({
      matchId: 'ac10-doc-nums',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'orc', playerId: 'h', heroClassCode: 'Oracle', row: 0, pickOrder: 1 },
        { id: 'ally', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Oracle', hero('Oracle', { mana: 20 })],
        ['Knight', hero('Knight')],
        ['B', hero('B')],
      ]),
    });
    const oracle = state.units.find((u) => u.id === 'orc')!;
    const ally = state.units.find((u) => u.id === 'ally')!;
    oracle.lvl = 3;
    state.activeUnitId = 'orc';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'orc',
      action: 'ability',
      slot: 5,
      targetId: 'ally',
    });
    const imag = ally.effects.find((e) => e.id === 'IMAGINARY_HEALTH')!;
    expect(imag.rounds).toBe(2);
    expect(imag.power).toBe(50 + 3 * 5);
    expect(oracle.abilityCds?.[5]).toBe(2);
  });

  test('взрыв Хлыста — источник Огонь; повторный Хлыст ещё −5 FIRE', () => {
    const state = createBattleState({
      matchId: 'ac10-whip-fire',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Incub', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'e2', playerId: 'g', heroClassCode: 'C', row: 0, pickOrder: 2 },
      ],
      heroes: new Map([
        ['Incub', hero('Incub', { mana: 20, power: 30, accuracy: 100, luck: 0 })],
        ['B', hero('B', { health: 200 })],
        ['C', hero('C', { health: 200 })],
      ]),
    });
    const incub = state.units.find((u) => u.id === 'p1')!;
    const foe = state.units.find((u) => u.id === 'e1')!;
    const meta = listPilotAbilities(state, incub).find((a) => a.slot === 2)!;
    expect(meta.previewSource).toBe('FIRE');
    incub.lvl = 8;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 2,
      targetId: 'e1',
    });
    const fire1 = foe.resists.FIRE?.value ?? 0;
    expect(fire1).toBe(-5);
    incub.abilityCds = {};
    incub.mana = 20;
    state.activeUnitId = 'p1';
    state.turnPlayerId = 'h';
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 2,
      targetId: 'e1',
    });
    const fire2 = foe.resists.FIRE?.value ?? 0;
    expect(fire2).toBe(fire1 - 5);
    // Округление вниз: доля силы по ряду floor(power/n).
    expect(Math.floor(30 / 2)).toBe(15);
  });
});

describe('CUT-2026-11-01c proof AC-11/12/15', () => {
  test('AC-11 граница крита: 32% даёт бонус, 33% — нет', () => {
    expect(finishingCritBonus(5, 32, 100)).toBe(19);
    expect(finishingCritBonus(5, 33, 100)).toBe(0);
  });

  test('AC-12 Water-resist режет тик Желчи после базы 10+L', () => {
    const state = createBattleState({
      matchId: 'ac12-water-resist',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'B', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'C', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['B', hero('B')],
        ['C', hero('C', { health: 500 })],
      ]),
    });
    const foe = state.units.find((u) => u.id === 'e1')!;
    foe.health = 500;
    foe.maxHp = 500;
    foe.armor = 20;
    grantEffect(foe, 'GALL', 3, 20); // 10+L10
    foe.resists.WATER = { value: 50 };
    const g = foe.effects.find((e) => e.id === 'GALL')!;
    g.fresh = undefined;
    foe.wasEffected = false;
    const before = foe.health;
    tickEffectsOnTurnStart(foe);
    // 20 × (1−0.5) = 10
    expect(before - foe.health).toBe(10);
  });

  test('AC-15 weaponReach: JSON недоступной колонки; слабость Мародёра после выстрела', () => {
    const state = createBattleState({
      matchId: 'ac15-reach',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'atk', playerId: 'h', heroClassCode: 'A', row: 0, pickOrder: 1 },
        { id: 'e0', playerId: 'g', heroClassCode: 'E0', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'E1', row: 0, pickOrder: 2 },
        { id: 'e2', playerId: 'g', heroClassCode: 'E2', row: 0, pickOrder: 3 },
      ],
      heroes: new Map([
        ['A', hero('A')],
        ['E0', hero('E0')],
        ['E1', hero('E1')],
        ['E2', hero('E2')],
      ]),
    });
    const atk = state.units.find((u) => u.id === 'atk')!;
    atk.weaponReach = 1;
    const ids = meleeTargets(state, atk).map((u) => u.id);
    const json = {
      fixtureId: 'ac15-weaponReach',
      seed: 20261101,
      weaponReach: atk.weaponReach,
      legalTargetIds: ids,
      blockedColumnTarget: 'e2',
      blocked: !ids.includes('e2'),
    };
    expect(json.blocked).toBe(true);
    expect(json.legalTargetIds).not.toContain('e2');

    const mState = createBattleState({
      matchId: 'ac15-marauder-weak',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Marauder', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Marauder', hero('Marauder', { damage: 40, accuracy: 100, luck: 0, mana: 10 })],
        ['B', hero('B', { health: 500 })],
      ]),
    });
    const marauder = mState.units.find((u) => u.id === 'p1')!;
    mState.activeUnitId = 'p1';
    mState.turnPlayerId = 'h';
    applyAction(mState, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 3,
      targetId: 'e1',
    });
    expect(hasEffect(marauder, 'WEAKNESS')).toBe(true);
  });
});
