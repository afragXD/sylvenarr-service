import { describe, expect, test } from 'bun:test';

import { createSummon } from '../combat/abilities/summon';
import { dealDamage } from '../combat/damage';
import { hasEffect } from '../combat/effects';
import { applyAction, createBattleState, forceSurrender, toBattleSummary } from '../combat/engine';
import type { HeroClassStats } from '../combat/types';
import { applyPerkInstant, unitHasPerk } from './apply';
import { isEligibleForPerkOffer } from './offers';

const hero = (code: string, extra: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 200,
  damage: 20,
  armor: 10,
  initiative: 10,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 20,
  mana: 10,
  maxMana: 10,
  gold: 100,
  size: 1,
  ...extra,
});

function fairBattle(opts?: { startingLevel?: number; host?: string; guest?: string }) {
  const host = opts?.host ?? 'Knight';
  const guest = opts?.guest ?? 'Assassin';
  const state = createBattleState({
    matchId: 'perks-t11',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      { id: 'h1', playerId: 'h', heroClassCode: host, row: 0, pickOrder: 1 },
      { id: 'g1', playerId: 'g', heroClassCode: guest, row: 0, pickOrder: 1 },
    ],
    heroes: new Map([
      [host, hero(host, { initiative: 20 })],
      [guest, hero(guest, { initiative: 5 })],
      ['Zombie', hero('Zombie')],
      ['GoblinTrapper', hero('GoblinTrapper')],
    ]),
    rules: {
      maxTeamSize: 8,
      maxRowSize: 4,
      maxRounds: 20,
      healthBonus: 1,
      startingLevel: opts?.startingLevel ?? 6,
      fairEnabled: true,
      goldBonus: 1,
    },
  });
  return state;
}

describe('perks phase (T11)', () => {
  test('eligible: develop 6 и 5, lastPerkHiddenLvl', () => {
    const state = fairBattle({ startingLevel: 1 });
    const knight = state.units.find((u) => u.heroClassCode === 'Knight')!;
    knight.develop = 6;
    knight.hiddenLvl = 6;
    knight.lastPerkHiddenLvl = undefined;
    expect(isEligibleForPerkOffer(knight)).toBe(true);
    knight.lastPerkHiddenLvl = 6;
    expect(isEligibleForPerkOffer(knight)).toBe(false);

    const det = fairBattle({ host: 'Detective', startingLevel: 1 }).units.find(
      (u) => u.heroClassCode === 'Detective'
    )!;
    expect(det.develop).toBe(5);
    det.hiddenLvl = 5;
    det.lastPerkHiddenLvl = undefined;
    expect(isEligibleForPerkOffer(det)).toBe(true);
  });

  test('старт с уровнем 6 → фаза perks; skip = +1 lvl; pick изучает', () => {
    const state = fairBattle({ startingLevel: 6 });
    expect(state.phase).toBe('perks');
    expect(state.activeUnitId).toBeNull();
    expect((state.perkOffers ?? []).length).toBeGreaterThan(0);
    const summary = toBattleSummary(state);
    expect(summary.phase).toBe('perks');
    expect(summary.perkOffers?.length).toBeGreaterThan(0);

    const offer = state.perkOffers![0]!;
    const unit = state.units.find((u) => u.id === offer.unitId)!;
    const lvlBefore = unit.lvl;
    expect(
      applyAction(state, {
        playerId: offer.playerId,
        unitId: offer.unitId,
        action: 'perk_skip',
      }).ok
    ).toBe(true);
    expect(unit.lvl).toBe(lvlBefore + 1);
    expect(unit.lastPerkHiddenLvl).toBe(unit.hiddenLvl);

    // второй оффер — pick
    const offer2 = state.perkOffers!.find((o) => !o.done);
    if (offer2) {
      const u2 = state.units.find((u) => u.id === offer2.unitId)!;
      const pickable = offer2.options.find((o) => !o.learned)!;
      expect(
        applyAction(state, {
          playerId: offer2.playerId,
          unitId: offer2.unitId,
          action: 'perk_pick',
          perkId: pickable.id,
        }).ok
      ).toBe(true);
      expect(unitHasPerk(u2, pickable.id)).toBe(true);
    }
  });

  test('изученный перк нельзя взять', () => {
    const state = fairBattle({ startingLevel: 6 });
    const offer = state.perkOffers!.find((o) => o.options.some((opt) => opt.learned));
    if (!offer) {
      // у Knight только MISC — почти всегда learned в опциях
      const any = state.perkOffers![0]!;
      const unit = state.units.find((u) => u.id === any.unitId)!;
      unit.perks = [...(unit.perks ?? []), any.options[0]!.id];
      any.options[0]!.learned = true;
      expect(
        applyAction(state, {
          playerId: any.playerId,
          unitId: any.unitId,
          action: 'perk_pick',
          perkId: any.options[0]!.id,
        }).ok
      ).toBe(false);
      return;
    }
    const learned = offer.options.find((o) => o.learned)!;
    expect(
      applyAction(state, {
        playerId: offer.playerId,
        unitId: offer.unitId,
        action: 'perk_pick',
        perkId: learned.id,
      }).ok
    ).toBe(false);
  });

  test('параллельный выбор: оба игрока могут ходить в фазе perks', () => {
    const state = fairBattle({ startingLevel: 6 });
    const offers = state.perkOffers ?? [];
    expect(offers.length).toBe(2);
    for (const offer of offers) {
      expect(
        applyAction(state, {
          playerId: offer.playerId,
          unitId: offer.unitId,
          action: 'perk_skip',
        }).ok
      ).toBe(true);
    }
    expect(state.phase).toBe('combat');
    expect(state.activeUnitId).toBeTruthy();
  });

  test('сдача во время фазы perks', () => {
    const state = fairBattle({ startingLevel: 6 });
    expect(state.phase).toBe('perks');
    forceSurrender(state, 'h', 'Host');
    expect(state.outcome).toBe('guest_win');
    expect(state.phase).toBe('combat');
    expect(state.perkOffers).toBeNull();
  });

  test('мгновенные эффекты apply', () => {
    const state = fairBattle({ startingLevel: 1 });
    const unit = state.units[0]!;
    unit.merchant = 0;
    applyPerkInstant(state, unit, 'GRAND_MERCHANT');
    expect(unit.merchant).toBe(0.25);
    applyPerkInstant(state, unit, 'LUCKYBASTARD');
    expect(unit.critBank).toBe(1);
    expect(unit.dodgeBank).toBe(1);
    const maxHp = unit.maxHp;
    applyPerkInstant(state, unit, 'MANDATEOFHEAVEN');
    expect(unit.maxHp).toBe(Math.round(maxHp * 1.25));
    expect(unit.healRate).toBe(1.25);
    applyPerkInstant(state, unit, 'SHINEOFTHISUNGLASSES');
    expect(hasEffect(unit, 'REFLECTION')).toBe(true);
    const reach = unit.weaponReach ?? 1;
    applyPerkInstant(state, unit, 'LONGWEAPON');
    expect(unit.weaponReach).toBe(reach + 1);
    const summons = unit.maxSummons;
    applyPerkInstant(state, unit, 'MORESUMMONS');
    expect(unit.maxSummons).toBe(summons + 1);
    applyPerkInstant(state, unit, 'ARMORPENETRATOR');
    expect(unit.armorPenetration).toBeGreaterThanOrEqual(0.3);
  });

  test('SUMMON_LEVEL_UP хук', () => {
    const state = fairBattle({ startingLevel: 1 });
    const actor = state.units.find((u) => u.team === 0)!;
    actor.perks = ['SUMMON_LEVEL_UP'];
    actor.maxSummons = 2;
    const summon = createSummon(state, {
      summoner: actor,
      heroCode: 'Zombie',
      row: 0,
    });
    expect(summon).toBeTruthy();
    expect(summon!.lvl).toBe(actor.lvl + 3);
  });

  test('CORPSE_BONUS увеличивает урон', () => {
    const state = fairBattle({ startingLevel: 1 });
    const atk = state.units.find((u) => u.team === 0)!;
    const def = state.units.find((u) => u.team === 1)!;
    atk.perks = [];
    def.health = def.maxHp;
    const base = dealDamage(atk, def, { kind: 'melee', forceHit: true }, state);
    def.health = def.maxHp;
    // имитация трупа на поле
    const ally = state.units.find((u) => u.id === atk.id)!;
    const corpseHp = ally.health;
    ally.alive = false;
    ally.health = 0;
    atk.perks = ['CORPSE_BONUS'];
    // atk is same ref as ally — оживим для атаки
    atk.alive = true;
    atk.health = corpseHp;
    // отдельный «труп»: второй мёртвый слот
    const foeDead = state.units.find((u) => u.team === 1)!;
    // создаём труп копированием через createSummon+kill проще: просто флаг на временном объекте в units
    state.units.push({
      ...structuredClone(def),
      id: 'corpse-1',
      alive: false,
      health: 0,
    });
    const buffed = dealDamage(atk, def, { kind: 'melee', forceHit: true }, state);
    expect(buffed).toBeGreaterThan(base);
    void foeDead;
  });

  test('fairEnabled false — нет фазы перков', () => {
    const state = createBattleState({
      matchId: 'off',
      hostPlayerId: 'h',
      guestPlayerId: 'g',
      picks: [
        { id: 'h1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
        { id: 'g1', playerId: 'g', heroClassCode: 'Assassin', row: 0, pickOrder: 1 },
      ],
      heroes: new Map([
        ['Knight', hero('Knight', { initiative: 20 })],
        ['Assassin', hero('Assassin')],
      ]),
      rules: {
        maxTeamSize: 8,
        maxRowSize: 4,
        maxRounds: 20,
        healthBonus: 1,
        startingLevel: 6,
        fairEnabled: false,
        goldBonus: 1,
      },
    });
    expect(state.phase ?? 'combat').toBe('combat');
    expect(state.perkOffers ?? null).toBeNull();
    expect(state.activeUnitId).toBeTruthy();
  });
});
