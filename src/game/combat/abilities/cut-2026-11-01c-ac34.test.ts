import { describe, expect, spyOn, test } from 'bun:test';

import { heroSeeds } from '../../../../prisma/seed-data/heroes';
import { hasEffect } from '../effects';
import { applyAction, createBattleState } from '../engine';
import { levelUpUnit } from '../level';
import { applyClassLevelUp } from '../levelup';
import type { HeroClassStats } from '../types';
import { applyAbility, listPilotAbilities } from './registry';

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

const seed = (code: string) => {
  const found = heroSeeds.find((item) => item.code === code);
  if (!found) {
    throw new Error(`no seed ${code}`);
  }
  return found;
};

describe('CUT-2026-11-01c AC-3', () => {
  test('fixture heroes-stats: Abbess/Mermaid/Titan/DemonLord числа', () => {
    // CUT-2026-11-05 AC-3: 185/10/162/36; Демон-принц точность 95.
    expect(seed('Abbess').health).toBe(185);
    expect(seed('Abbess').mana).toBe(10);
    expect(seed('Mermaid').health).toBe(162);
    expect(seed('Mermaid').mana).toBe(6); // CUT-2026-11-09 AC-2
    expect(seed('Mermaid').initiative).toBe(30); // CUT-2026-11-09 AC-2
    expect(seed('DemonLord').initiative).toBe(35); // CUT-2026-11-09 AC-5
    expect(seed('Herbalist').armor).toBe(10); // CUT-2026-11-09 AC-9
    expect(seed('Titan').damage).toBe(36);
    expect(seed('DemonLord').accuracy).toBe(95);
  });

  test('fixture knight-armor-growth: base+⌊lvl/4⌋ не накопительно; L8 = 31', () => {
    const singleStep = (lvl: number) => {
      const state = createBattleState({
        matchId: 'ac3-knight',
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
          { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes: new Map([
          ['Knight', hero('Knight', { armor: 10 })],
          ['B', hero('B')],
        ]),
      });
      const unit = state.units.find((u) => u.id === 'p1')!;
      unit.lvl = lvl;
      unit.armor = 10;
      applyClassLevelUp(unit, 1, state);
      return unit.armor - 10;
    };
    // +2 + дельта ⌊(L+1)/4⌋−⌊L/4⌋
    expect(singleStep(3)).toBe(2 + 1); // 3→4: floor 0→1
    expect(singleStep(8)).toBe(2 + 0); // 8→9: floor 2→2
    expect(singleStep(19)).toBe(2 + 1); // 19→20: floor 4→5

    const state = createBattleState({
      matchId: 'ac3-knight-abs',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Knight', hero('Knight', { armor: 15 })],
        ['B', hero('B')],
      ]),
    });
    const unit = state.units.find((u) => u.id === 'p1')!;
    unit.lvl = 1;
    unit.armor = 15;
    while (unit.lvl < 8) {
      applyClassLevelUp(unit, 1, state);
    }
    expect(unit.armor).toBe(31);
  });

  test('fixture inquisitor-armor16 / werewolf damage 2..3+L//2', () => {
    const state = createBattleState({
      matchId: 'ac3-inq',
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
    levelUpUnit(unit, 1, state);
    expect(unit.armor).toBe(26);
    expect(unit.power).toBe(30);

    const gains: number[] = [];
    for (let i = 0; i < 200; i += 1) {
      const wolfState = createBattleState({
        matchId: 'ac3-wolf',
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Werewolf', row: 0, pickOrder: 1 },
          { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes: new Map([
          ['Werewolf', hero('Werewolf', { damage: 10 })],
          ['B', hero('B')],
        ]),
      });
      const wolf = wolfState.units.find((u) => u.id === 'p1')!;
      wolf.lvl = 4;
      wolf.damage = 10;
      applyClassLevelUp(wolf, 1, wolfState);
      gains.push(wolf.damage - 10);
    }
    const floor = 2 + Math.floor(4 / 2);
    const ceil = 3 + Math.floor(4 / 2);
    expect(Math.min(...gains)).toBe(floor);
    expect(Math.max(...gains)).toBe(ceil);
  });
});

describe('CUT-2026-11-01c AC-4', () => {
  test('fixture abbess-heal: power 40 → 20..30; power 41 → 20..31', () => {
    const run = (power: number) => {
      const values: number[] = [];
      for (let i = 0; i < 200; i += 1) {
        const state = createBattleState({
          matchId: 'ac4-abbess',
          hostPlayerId: 'h',
          guestPlayerId: 'g',
          picks: [
            { id: 'p1', playerId: 'h', heroClassCode: 'Abbess', row: 1, pickOrder: 1 },
            { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 1, pickOrder: 2 },
            { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
          ],
          heroes: new Map([
            ['Abbess', hero('Abbess', { initiative: 99, mana: 10, power })],
            ['Ally', hero('Ally', { health: 500 })],
            ['B', hero('B')],
          ]),
        });
        const abbess = state.units.find((u) => u.id === 'p1')!;
        const ally = state.units.find((u) => u.id === 'p2')!;
        ally.health = 1;
        ally.maxHp = 500;
        applyAbility(state, abbess, { slot: 2, targetId: 'p2' });
        values.push(ally.health - 1);
      }
      return values;
    };
    const p40 = run(40);
    expect(Math.min(...p40)).toBeGreaterThanOrEqual(24); // CUT-2026-11-09 AC-4
    expect(Math.max(...p40)).toBeLessThanOrEqual(34);
    expect(p40.includes(24)).toBe(true);
    expect(p40.includes(34)).toBe(true);
    const p41 = run(41);
    expect(Math.min(...p41)).toBe(25); // CUT-2026-11-09 AC-4
    expect(Math.max(...p41)).toBe(35);
  });

  test('fixture herbalist-elixir: lvl 1/9/10 фракции и длительность', () => {
    const check = (lvl: number, expectFrac: number, expectRounds: number) => {
      const state = createBattleState({
        matchId: 'ac4-elixir',
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Herbalist', row: 0, pickOrder: 1 },
          { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
          { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes: new Map([
          ['Herbalist', hero('Herbalist', { initiative: 99 })],
          ['Ally', hero('Ally', { damage: 40 })],
          ['B', hero('B')],
        ]),
      });
      const herbalist = state.units.find((u) => u.id === 'p1')!;
      herbalist.lvl = lvl;
      const ally = state.units.find((u) => u.id === 'p2')!;
      ally.damage = 40;
      applyAbility(state, herbalist, { slot: 1, targetId: 'p2' });
      expect(hasEffect(ally, 'STRENGTH')).toBe(true);
      const eff = ally.effects.find((e) => e.id === 'STRENGTH')!;
      expect(eff.rounds).toBe(expectRounds);
      expect(eff.power).toBe(Math.round(40 * expectFrac));
      expect(ally.damage).toBe(40 + Math.round(40 * expectFrac));
    };
    check(1, 0.55, 1);
    check(9, 0.95, 2);
    check(10, 0.95, 2);
  });

  test('fixture evil-tree: INTERDICT 2 р.; взращивание 1+L//5', () => {
    const state = createBattleState({
      matchId: 'ac4-tree',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'EvilTree', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['EvilTree', hero('EvilTree', { initiative: 99, mana: 20 })],
        ['Ally', hero('Ally')],
        ['B', hero('B')],
      ]),
    });
    const tree = state.units.find((u) => u.id === 'p1')!;
    tree.lvl = 10;
    applyAbility(state, tree, { slot: 3, targetId: 'e1' });
    const foe = state.units.find((u) => u.id === 'e1')!;
    expect(foe.effects.find((e) => e.id === 'INTERDICT')?.rounds).toBe(2);

    const ally = state.units.find((u) => u.id === 'p2')!;
    const before = ally.lvl;
    tree.lvl = 4;
    applyAbility(state, tree, { slot: 5, targetId: 'p2' });
    expect(ally.lvl).toBe(before + 1);
    tree.lvl = 5;
    applyAbility(state, tree, { slot: 5, targetId: 'p2' });
    expect(ally.lvl).toBe(before + 1 + 2);
  });

  test('fixture witch-imp: 2 раунда, 100% без резиста', () => {
    let ok = 0;
    for (let i = 0; i < 20; i += 1) {
      const state = createBattleState({
        matchId: 'ac4-imp',
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Witch', row: 0, pickOrder: 1 },
          { id: 'e1', playerId: 'g', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        ],
        heroes: new Map([
          ['Witch', hero('Witch', { initiative: 99, mana: 20 })],
          ['Knight', hero('Knight')],
          ['Imp', hero('Imp', { health: 60, damage: 0 })],
        ]),
      });
      const witch = state.units.find((u) => u.id === 'p1')!;
      const foe = state.units.find((u) => u.id === 'e1')!;
      foe.resists = {};
      applyAbility(state, witch, { slot: 5, targetId: 'e1' });
      if (foe.heroClassCode === 'Imp') {
        ok += 1;
        expect(foe.effects.find((e) => e.id === 'IMPISH')?.rounds).toBe(2);
        expect(witch.abilityCds?.[5]).toBe(4);
      }
    }
    expect(ok).toBe(20);
  });

  test('fixture cds/mp: Mimic 3, Flame 2, Sling 2, Collection 2 МР', () => {
    const mimicState = createBattleState({
      matchId: 'ac4-mimic-cd',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Assassin', row: 0, pickOrder: 1 },
        { id: 'p2', playerId: 'h', heroClassCode: 'Paladin', row: 0, pickOrder: 2 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Assassin', hero('Assassin', { initiative: 99, mana: 4, maxMana: 10 })],
        ['Paladin', hero('Paladin')],
        ['B', hero('B')],
      ]),
    });
    const assassin = mimicState.units.find((u) => u.id === 'p1')!;
    applyAbility(mimicState, assassin, { slot: 2, targetId: 'p2' });
    // После мимика класс сменился — КД на unit.abilityCds[2].
    expect(assassin.abilityCds?.[2]).toBe(3);

    const flameState = createBattleState({
      matchId: 'ac4-flame',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Marauder', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Marauder', hero('Marauder', { initiative: 99, mana: 10, power: 30 })],
        ['B', hero('B')],
      ]),
    });
    const marauder = flameState.units.find((u) => u.id === 'p1')!;
    applyAbility(flameState, marauder, { slot: 5, targetId: 'e1' });
    expect(marauder.abilityCds?.[5]).toBe(2);

    const slingState = createBattleState({
      matchId: 'ac4-sling',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Herbalist', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Herbalist', hero('Herbalist', { initiative: 99, accuracy: 100, damage: 30 })],
        ['B', hero('B')],
      ]),
    });
    const herbalist = slingState.units.find((u) => u.id === 'p1')!;
    applyAbility(slingState, herbalist, { slot: 5, targetId: 'e1' });
    expect(herbalist.abilityCds?.[5]).toBe(2);

    const lichState = createBattleState({
      matchId: 'ac4-collection',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'p1', playerId: 'h', heroClassCode: 'Archlich', row: 0, pickOrder: 1 },
        { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Archlich', hero('Archlich', { initiative: 99, mana: 10 })],
        ['B', hero('B', { dodge: 0 })],
      ]),
    });
    const lich = lichState.units.find((u) => u.id === 'p1')!;
    const manaBefore = lich.mana;
    applyAbility(lichState, lich, { slot: 4, targetId: 'e1' });
    expect(lich.mana).toBe(manaBefore - 2);
  });

  test('fixture mermaid-siren: гигант с lvl 9 — нет, с 10 — да', () => {
    const cast = (lvl: number) => {
      const state = createBattleState({
        matchId: 'ac4-siren',
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Mermaid', row: 0, pickOrder: 1 },
          { id: 'e1', playerId: 'g', heroClassCode: 'Titan', row: 0, pickOrder: 1 },
        ],
        heroes: new Map([
          ['Mermaid', hero('Mermaid', { initiative: 99 })],
          ['Titan', hero('Titan', { size: 2, health: 300 })],
        ]),
      });
      const mermaid = state.units.find((u) => u.id === 'p1')!;
      mermaid.lvl = lvl;
      mermaid.ultaCharges = 1;
      const titan = state.units.find((u) => u.id === 'e1')!;
      applyAbility(state, mermaid, { slot: 3, targetId: 'e1' });
      return {
        enslaved: titan.enslavedOriginTeam !== null,
        log: state.log.join('\n'),
      };
    };
    const low = cast(9);
    expect(low.enslaved).toBe(false);
    expect(low.log.includes('гигантов')).toBe(true);
    const high = cast(10);
    expect(high.enslaved).toBe(true);
  });

  test('fixture demon-triple: accuracyPenalty 5 при базовой 95', () => {
    // randInt(1,100) высокий → промах по missChance 5% не срабатывает.
    const randomSpy = spyOn(Math, 'random').mockReturnValue(0.99);
    try {
      const state = createBattleState({
        matchId: 'ac4-triple',
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'DemonLord', row: 0, pickOrder: 1 },
          { id: 'e1', playerId: 'g', heroClassCode: 'B', row: 0, pickOrder: 1 },
        ],
        heroes: new Map([
          ['DemonLord', hero('DemonLord', { initiative: 99, accuracy: 95, damage: 40 })],
          ['B', hero('B', { dodge: 0 })],
        ]),
      });
      const demon = state.units.find((u) => u.id === 'p1')!;
      demon.accuracy = 95;
      state.activeUnitId = 'p1';
      state.turnPlayerId = 'h';
      const meta = listPilotAbilities(state, demon).find((a) => a.slot === 1);
      expect(meta?.attackKind).toBe('melee');
      // Фиксированный seed RNG — не падает от случайного промаха.
      applyAction(state, {
        playerId: 'h',
        unitId: 'p1',
        action: 'ability',
        slot: 1,
        targetId: 'e1',
      });
      expect(state.log.some((line) => line.includes('трёхглавый'))).toBe(true);
    } finally {
      randomSpy.mockRestore();
    }
  });
});
