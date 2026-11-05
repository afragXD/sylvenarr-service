import { describe, expect, test } from 'bun:test';

import { createBattleState } from '../engine';
import { genderForClass } from '../gender';
import type { HeroClassStats } from '../types';
import {
  applyBeerCompanyMoraleRoundStart,
  BEER_COMPANY_FEMALE_LOSS,
  BEER_COMPANY_MALE_GAIN,
} from './beer-elemental';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 200,
  damage: 20,
  armor: 0,
  initiative: 40,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 20,
  mana: 5,
  maxMana: 5,
  gold: 100,
  size: 1,
  ...overrides,
});

function squad(...codes: string[]) {
  const heroes = new Map(codes.map((code) => [code, hero(code)]));
  heroes.set('Foe', hero('Foe'));
  const state = createBattleState({
    matchId: 'beer-company',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      ...codes.map((code, i) => ({
        id: `p${i}`,
        playerId: 'h',
        heroClassCode: code,
        row: 0 as const,
        pickOrder: i + 1,
      })),
      { id: 'e1', playerId: 'g', heroClassCode: 'Foe', row: 0, pickOrder: 1 },
    ],
    heroes,
  });
  return state;
}

describe('genderForClass', () => {
  test('female / male / none карта', () => {
    expect(genderForClass('Mermaid')).toBe('female');
    expect(genderForClass('Angel')).toBe('female');
    expect(genderForClass('GoldGolem')).toBe('male');
    expect(genderForClass('BeerElemental')).toBe('male');
    expect(genderForClass('EvilTree')).toBe('none');
    expect(genderForClass('Ectoplasm')).toBe('none');
  });
});

describe('BeerElemental компания за кружкой', () => {
  test('юниты получают gender при создании', () => {
    const state = squad('BeerElemental', 'Mermaid', 'Knight');
    const beer = state.units.find((u) => u.heroClassCode === 'BeerElemental')!;
    const mermaid = state.units.find((u) => u.heroClassCode === 'Mermaid')!;
    const knight = state.units.find((u) => u.heroClassCode === 'Knight')!;
    expect(beer.gender).toBe('male');
    expect(mermaid.gender).toBe('female');
    expect(knight.gender).toBe('male');
  });

  test('F≥1: −5·F, без бонуса M', () => {
    const state = squad('BeerElemental', 'Mermaid', 'Abbess', 'Knight');
    const beer = state.units.find((u) => u.heroClassCode === 'BeerElemental')!;
    beer.morale = 0;
    applyBeerCompanyMoraleRoundStart(state);
    expect(beer.morale).toBe(-(BEER_COMPANY_FEMALE_LOSS * 2));
    expect(state.log.some((line) => line.includes('давит на дух'))).toBe(true);
  });

  test('F=0: +4·M (себя не считает)', () => {
    const state = squad('BeerElemental', 'Knight', 'Paladin');
    const beer = state.units.find((u) => u.heroClassCode === 'BeerElemental')!;
    beer.morale = 0;
    applyBeerCompanyMoraleRoundStart(state);
    expect(beer.morale).toBe(BEER_COMPANY_MALE_GAIN * 2);
    expect(state.log.some((line) => line.includes('бодрит'))).toBe(true);
  });

  test('только ПЭ в отряде: без изменений (себя не M)', () => {
    const state = squad('BeerElemental');
    const beer = state.units.find((u) => u.heroClassCode === 'BeerElemental')!;
    beer.morale = 10;
    applyBeerCompanyMoraleRoundStart(state);
    expect(beer.morale).toBe(10);
  });

  test('EvilTree (none) не даёт M', () => {
    const state = squad('BeerElemental', 'EvilTree');
    const beer = state.units.find((u) => u.heroClassCode === 'BeerElemental')!;
    beer.morale = 0;
    applyBeerCompanyMoraleRoundStart(state);
    expect(beer.morale).toBe(0);
  });
});
