import { describe, expect, spyOn, test } from 'bun:test';

import { heroSeeds } from '../../../prisma/seed-data/heroes';
import * as damage from './damage';
import { createBattleState } from './engine';
import { levelUpUnit } from './level';
import type { HeroClassStats } from './types';

/** Матожидание как на клиенте (expectedRandInt). */
function expectedRandInt(lo: number, hi: number): number {
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  return Math.ceil((a + b) / 2);
}

const PLAYABLE = heroSeeds.filter((h) => h.isPlayable);

describe('CUT-2026-11-05 AC-9 heroStats sync', () => {
  test('L1 / L15 / L30: серверный level-up при mocked randInt ≡ expectedRandInt', () => {
    const spy = spyOn(damage, 'randInt').mockImplementation((lo: number, hi: number) =>
      expectedRandInt(lo, hi)
    );

    try {
      const playable = PLAYABLE;
      expect(playable.length).toBe(27);

      for (const seed of playable) {
        for (const target of [1, 15, 30] as const) {
          const heroes = new Map<string, HeroClassStats>([
            [
              seed.code,
              {
                code: seed.code,
                displayName: seed.displayName,
                health: seed.health,
                damage: seed.damage,
                armor: seed.armor,
                initiative: seed.initiative,
                dodge: seed.dodge,
                luck: seed.luck,
                accuracy: seed.accuracy,
                power: seed.power,
                mana: seed.mana,
                maxMana: seed.mana,
                gold: seed.gold,
                size: seed.code === 'Titan' || seed.code === 'DemonLord' || seed.code === 'Dracolich' ? 2 : 1,
              },
            ],
            [
              'Dummy',
              {
                code: 'Dummy',
                displayName: 'Dummy',
                health: 100,
                damage: 10,
                armor: 0,
                initiative: 1,
                dodge: 0,
                luck: 0,
                accuracy: 100,
                power: 10,
                mana: 0,
                maxMana: 0,
                gold: 0,
                size: 1,
              },
            ],
          ]);
          const state = createBattleState({
            matchId: `ac9-${seed.code}-${target}`,
            hostPlayerId: 'h',
            guestPlayerId: 'g',
            picks: [
              { id: 'p1', playerId: 'h', heroClassCode: seed.code, row: 0, pickOrder: 1 },
              { id: 'e1', playerId: 'g', heroClassCode: 'Dummy', row: 0, pickOrder: 1 },
            ],
            heroes,
          });
          const unit = state.units.find((u) => u.id === 'p1')!;
          // createBattleState → preChoice (напр. ROW_FORTIFY у Knight) — сбрасываем к каталогу.
          unit.armor = seed.armor;
          unit.damage = seed.damage;
          unit.effects = [];
          expect(unit.lvl).toBe(1);
          while (unit.lvl < target) {
            levelUpUnit(unit, 1, state);
          }
          expect(unit.lvl).toBe(target);
          expect(Number.isFinite(unit.damage)).toBe(true);
          expect(Number.isFinite(unit.armor)).toBe(true);
          expect(unit.maxHp).toBeGreaterThan(0);
        }
      }
    } finally {
      spy.mockRestore();
    }
  });

  test('Knight L8 armor = 31 при mocked rand', () => {
    const spy = spyOn(damage, 'randInt').mockImplementation((lo: number, hi: number) =>
      expectedRandInt(lo, hi)
    );
    try {
      const seed = heroSeeds.find((h) => h.code === 'Knight')!;
      const state = createBattleState({
        matchId: 'ac9-knight-8',
        hostPlayerId: 'h',
        guestPlayerId: 'g',
        picks: [
          { id: 'p1', playerId: 'h', heroClassCode: 'Knight', row: 0, pickOrder: 1 },
          { id: 'e1', playerId: 'g', heroClassCode: 'Dummy', row: 0, pickOrder: 1 },
        ],
        heroes: new Map([
          [
            'Knight',
            {
              code: 'Knight',
              displayName: seed.displayName,
              health: seed.health,
              damage: seed.damage,
              armor: seed.armor,
              initiative: seed.initiative,
              dodge: seed.dodge,
              luck: seed.luck,
              accuracy: seed.accuracy,
              power: seed.power,
              mana: 0,
              maxMana: 0,
              gold: seed.gold,
              size: 1,
            },
          ],
          [
            'Dummy',
            {
              code: 'Dummy',
              displayName: 'D',
              health: 100,
              damage: 1,
              armor: 0,
              initiative: 1,
              dodge: 0,
              luck: 0,
              accuracy: 100,
              power: 0,
              mana: 0,
              maxMana: 0,
              gold: 0,
              size: 1,
            },
          ],
        ]),
      });
      const unit = state.units.find((u) => u.id === 'p1')!;
      unit.armor = seed.armor;
      unit.effects = [];
      unit.lvl = 1;
      unit.hiddenLvl = 1;
      while (unit.lvl < 8) {
        levelUpUnit(unit, 1, state);
      }
      expect(unit.armor).toBe(31);
    } finally {
      spy.mockRestore();
    }
  });
});
