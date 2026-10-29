import { afterEach, describe, expect, spyOn, test } from 'bun:test';

import { markDeadIfNeeded } from '../damage';
import { grantEffect, hasEffect, tickEffectsOnTurnEnd } from '../effects';
import { applyAction, createBattleState } from '../engine';
import type { BattleState, HeroClassStats } from '../types';
import { angelAbilities } from './angel';
import { antipaladinAbilities, APAL } from './antipaladin';
import { resetCooldowns, slotCd } from './cooldowns';
import { incubAbilities } from './incub';
import { titanAbilities } from './titan';

const hero = (code: string, overrides: Partial<HeroClassStats> = {}): HeroClassStats => ({
  code,
  displayName: code,
  health: 100,
  damage: 20,
  armor: 5,
  initiative: 40,
  dodge: 0,
  luck: 0,
  accuracy: 100,
  power: 20,
  mana: 15,
  gold: 100,
  size: 1,
  ...overrides,
});

/** Бой: p1 (код actor) + p2 (союзник) против p3 (враг). */
function battle(
  actorCode: string,
  overrides: {
    actor?: Partial<HeroClassStats>;
    ally?: Partial<HeroClassStats>;
    enemy?: Partial<HeroClassStats>;
    extra?: ReadonlyArray<HeroClassStats>;
  } = {}
): BattleState {
  const heroes = new Map<string, HeroClassStats>([
    [actorCode, hero(actorCode, { initiative: 99, ...overrides.actor })],
    ['Ally', hero('Ally', { initiative: 1, ...overrides.ally })],
    ['Enemy', hero('Enemy', { initiative: 1, ...overrides.enemy })],
  ]);
  for (const extra of overrides.extra ?? []) {
    heroes.set(extra.code, extra);
  }
  const state = createBattleState({
    matchId: 'm',
    hostPlayerId: 'h',
    guestPlayerId: 'g',
    picks: [
      { id: 'p1', playerId: 'h', heroClassCode: actorCode, row: 0, pickOrder: 1 },
      { id: 'p2', playerId: 'h', heroClassCode: 'Ally', row: 0, pickOrder: 2 },
      { id: 'p3', playerId: 'g', heroClassCode: 'Enemy', row: 0, pickOrder: 1 },
    ],
    heroes,
  });
  state.activeUnitId = 'p1';
  state.turnPlayerId = 'h';
  return state;
}

const unit = (state: BattleState, id: string) => state.units.find((item) => item.id === id)!;

/** Все броски дают минимум: попадание гарантировано, крита и провала нет. */
const fixRandom = () => spyOn(Math, 'random').mockReturnValue(0);

afterEach(() => {
  (Math.random as unknown as { mockRestore?: () => void }).mockRestore?.();
});

describe('Antipaladin', () => {
  test('Чёрная секира: убийство даёт доп. ход', () => {
    const state = battle('Antipaladin', { actor: { damage: 500 }, enemy: { health: 10, armor: 0 } });
    state.units.push({ ...unit(state, 'p3'), id: 'p4', resists: {}, effects: [] });
    fixRandom();
    const result = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 1,
      targetId: 'p3',
    });
    expect(result.ok).toBe(true);
    expect(unit(state, 'p3').alive).toBe(false);
    expect(state.activeUnitId).toBe('p1');
    expect(state.doneIds.includes('p1')).toBe(false);
  });

  test('Шквал ударов: закрыт до порога, затем списывает APAL', () => {
    const state = battle('Antipaladin', { enemy: { health: 5000 } });
    const actor = unit(state, 'p1');
    const blocked = antipaladinAbilities.apply(state, actor, { slot: 2, targetId: 'p3' });
    expect(blocked.status).toBe('reject');
    actor.appliedDamage = APAL;
    const outcome = antipaladinAbilities.apply(state, actor, { slot: 2, targetId: 'p3' });
    expect(outcome.status).toBe('done');
    expect(actor.appliedDamage).toBeLessThan(APAL);
  });

  test('Садист ставит кулдаун 4 и не пополняет шкалу', () => {
    const state = battle('Antipaladin');
    const actor = unit(state, 'p1');
    antipaladinAbilities.apply(state, actor, { slot: 3, targetId: 'p3' });
    expect(slotCd(actor, 3)).toBe(4);
    expect(actor.appliedDamage ?? 0).toBe(0);
    expect(antipaladinAbilities.apply(state, actor, { slot: 3, targetId: 'p3' }).status).toBe(
      'reject'
    );
  });

  test('Руна берсерка: броня → атака и точный откат', () => {
    const state = battle('Antipaladin', { ally: { armor: 30, damage: 10 } });
    const actor = unit(state, 'p1');
    const ally = unit(state, 'p2');
    antipaladinAbilities.apply(state, actor, { slot: 4, targetId: 'p2' });
    expect(ally.armor).toBe(0);
    expect(ally.damage).toBe(10 + 30);
    ally.effects.find((effect) => effect.id === 'BERSERK')!.fresh = undefined;
    tickEffectsOnTurnEnd(ally, state);
    expect(ally.armor).toBe(30);
    expect(ally.damage).toBe(10);
  });

  test('спасение от смертельного удара снижает резист на 33', () => {
    const state = battle('Antipaladin');
    const actor = unit(state, 'p1');
    actor.resists.FINALSTRIKE = { value: 100 };
    actor.health = -5;
    markDeadIfNeeded(state, actor);
    expect(actor.alive).toBe(true);
    expect(actor.resists.FINALSTRIKE?.value).toBe(67);
  });
});

describe('Angel', () => {
  test('Прикосновение блаженства лечит две разные цели через выбор', () => {
    const state = battle('Angel', { actor: { power: 40, luck: 0 }, ally: { health: 200 } });
    const actor = unit(state, 'p1');
    const ally = unit(state, 'p2');
    actor.health = 50;
    ally.health = 50;
    fixRandom();
    const first = applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 1,
      targetId: 'p1',
    });
    expect(first.ok).toBe(true);
    expect(state.pendingPrompt?.options.map((option) => option.id)).toEqual(['p2']);
    applyAction(state, {
      playerId: 'h',
      unitId: 'p1',
      action: 'ability',
      slot: 1,
      choice: 'p2',
    });
    expect(state.pendingPrompt).toBeNull();
    expect(ally.health).not.toBe(50);
    expect(state.doneIds.includes('p1')).toBe(true);
  });

  test('Где твои крылья: процент текущего ОЗ врага, гиганты недоступны', () => {
    const state = battle('Angel', {
      extra: [hero('Giant', { size: 2 })],
    });
    const actor = unit(state, 'p1');
    const enemy = unit(state, 'p3');
    enemy.health = 100;
    angelAbilities.apply(state, actor, { slot: 3, targetId: 'p3' });
    expect(enemy.health).toBe(100 - (15 + actor.lvl));
    enemy.heroClassCode = 'Giant';
    const meta = angelAbilities.listAbilities(state, actor).find((item) => item.slot === 3)!;
    expect(meta.legalTargetIds.includes('p3')).toBe(false);
  });

  test('Минута славы сбрасывает кулдауны цели', () => {
    const state = battle('Angel');
    const ally = unit(state, 'p2');
    ally.darkRitualCd = 3;
    ally.abilityCds = { 3: 4 };
    angelAbilities.apply(state, unit(state, 'p1'), { slot: 4, targetId: 'p2' });
    expect(ally.darkRitualCd).toBe(0);
    expect(slotCd(ally, 3)).toBe(0);
    expect(hasEffect(ally, 'STRENGTH')).toBe(true);
  });

  test('resetCooldowns обнуляет старые поля', () => {
    const state = battle('Angel');
    const ally = unit(state, 'p2');
    ally.soulShatterCd = 2;
    ally.deathNoteCd = 5;
    resetCooldowns(ally);
    expect(ally.soulShatterCd).toBe(0);
    expect(ally.deathNoteCd).toBe(0);
  });
});

describe('Titan', () => {
  test('убийство даёт заряд исцеляющей волны', () => {
    const state = battle('Titan', { actor: { damage: 500 }, enemy: { health: 10, armor: 0 } });
    const actor = unit(state, 'p1');
    state.units.push({ ...unit(state, 'p3'), id: 'p4', resists: {}, effects: [] });
    fixRandom();
    const before = actor.ultaCharges;
    titanAbilities.apply(state, actor, { slot: 1, targetId: 'p3' });
    expect(unit(state, 'p3').alive).toBe(false);
    expect(actor.ultaCharges).toBe(before + 1);
  });

  test('Восточный ветер снимает замедление и ускоряет ряд', () => {
    const state = battle('Titan');
    const ally = unit(state, 'p2');
    grantEffect(ally, 'SLOW', 3, 10);
    titanAbilities.apply(state, unit(state, 'p1'), { slot: 5, targetId: 'p2' });
    expect(hasEffect(ally, 'SLOW')).toBe(false);
    expect(hasEffect(ally, 'HASTE')).toBe(true);
  });
});

describe('Incub', () => {
  test('Чудесный доктор: ОЗ сверх максимума и точный откат', () => {
    const state = battle('Incub');
    const ally = unit(state, 'p2');
    ally.health = ally.maxHp;
    incubAbilities.apply(state, unit(state, 'p1'), { slot: 2, targetId: 'p2' });
    const bonus = 50 + 5 * unit(state, 'p1').lvl;
    expect(ally.health).toBe(ally.maxHp + bonus);
    const effect = ally.effects.find((item) => item.id === 'IMAGINARY_HEALTH')!;
    effect.fresh = undefined;
    effect.rounds = 1;
    tickEffectsOnTurnEnd(ally, state);
    expect(ally.health).toBe(ally.maxHp);
  });

  test('Нечистый договор: расплата 75% макс. ОЗ по истечении', () => {
    const state = battle('Incub');
    const ally = unit(state, 'p2');
    incubAbilities.apply(state, unit(state, 'p1'), { slot: 3, targetId: 'p2' });
    expect(hasEffect(ally, 'STRENGTH')).toBe(true);
    for (const effect of ally.effects) {
      effect.fresh = undefined;
      effect.rounds = 1;
    }
    const hp = ally.health;
    tickEffectsOnTurnEnd(ally, state);
    expect(ally.health).toBe(hp - Math.round(ally.maxHp * 0.75));
  });

  test('Рождение Зла: недоступно рано, затем превращение в DemonLord', () => {
    const state = battle('Incub', {
      extra: [hero('DemonLord', { displayName: 'Демон-принц', health: 350, size: 2 })],
    });
    const actor = unit(state, 'p1');
    expect(incubAbilities.apply(state, actor, { slot: 5 }).status).toBe('reject');
    state.stage = 8;
    actor.lvl = 8;
    expect(incubAbilities.apply(state, actor, { slot: 5 }).status).toBe('done');
    expect(actor.heroClassCode).toBe('DemonLord');
    expect(actor.lvl).toBe(1 + Math.round(8 * 0.75));
    expect(actor.ultaCharges).toBe(2);
  });
});
