import { randInt } from '../../combat/damage';
import { grantEffect } from '../../combat/effects';
import { levelUpUnit } from '../../combat/level';
import { isArtificialClass, isUndeadClass } from '../../combat/races';
import { done, invokerLvl, livingTeam, log, reject, unitsOnRow } from './helpers';
import type { ItemUsageContext, ItemUsageHandler, ItemUsageOutcome } from './types';

function skipsMorale(unit: { heroClassCode: string; artificial?: boolean }): boolean {
  return (
    unit.artificial === true ||
    isUndeadClass(unit.heroClassCode) ||
    isArtificialClass(unit.heroClassCode)
  );
}

const HANDLERS: Record<number, (ctx: ItemUsageContext) => ItemUsageOutcome> = {
  579: (ctx) => {
    for (const ally of unitsOnRow(ctx, ctx.target)) {
      ally.initiative += Math.floor(ally.initiative / 2);
    }
    log(
      ctx,
      'Ваша команда чувствует себя гораздо ловчее и быстрее под влиянием штандарта легендарного 47-го полка элитной кавалерии Императора.'
    );
    return done();
  },
  999: (ctx) => {
    log(ctx, 'Вы поднимаете самое могущественное знамя над своим отрядом.');
    for (const ally of livingTeam(ctx, ctx.target.team)) {
      if (!skipsMorale(ally)) {
        ally.morale = 65;
      }
      ally.damage += Math.floor(ally.damage / 2);
      ally.power += Math.floor(ally.power / 2);
      ally.accuracy += 50;
    }
    return done();
  },
  479: (ctx) => {
    for (const ally of unitsOnRow(ctx, ctx.target)) {
      ally.damage = Math.round(ally.damage * 1.25);
    }
    log(ctx, 'За Императора! За Верховного Канцлера Оттона! Урррраааа!');
    return done();
  },
  389: (ctx) => {
    for (const ally of unitsOnRow(ctx, ctx.target)) {
      ally.health = Math.round(ally.health * 1.4);
      if (ally.health > ally.maxHp) {
        ally.maxHp = ally.health;
      }
    }
    log(
      ctx,
      'Зачарованное знамя придает вам дополнительных жизненных сил в размере 40% от текущего ОЗ.'
    );
    return done();
  },
  559: (ctx) => {
    const bonus = 15 + invokerLvl(ctx);
    for (const ally of livingTeam(ctx, ctx.target.team)) {
      if (!skipsMorale(ally)) {
        ally.morale += bonus;
      }
    }
    log(
      ctx,
      'Зачарованное знамя придаёт вам дополнительных душевных сил - вы готовы сражаться до конца.'
    );
    return done();
  },
  619: (ctx) => {
    if (!ctx.target.isSummon) {
      return reject('Цель не призванное существо.');
    }
    const master = ctx.state.units.find((u) => u.id === ctx.target.summonerId);
    const masterLvl = master?.lvl ?? ctx.invoker.lvl;
    const delta = masterLvl - ctx.target.lvl;
    if (delta !== 0) {
      levelUpUnit(ctx.target, delta, ctx.state);
    }
    log(
      ctx,
      'Вы дуете в особый рог, который проводит ускоренный курс боевой подготовки для вашего напарника.'
    );
    return done();
  },
  329: (ctx) => {
    grantEffect(ctx.target, 'BREAKWEAPON', randInt(3, 4));
    log(ctx, 'Вы инкрустируете руну в своё оружие. Стильно, модно, молодёжно.');
    return done();
  },
  509: (ctx) => {
    const bonus = 30 + invokerLvl(ctx) * 2;
    for (const ally of unitsOnRow(ctx, ctx.target)) {
      ally.accuracy += bonus;
    }
    log(ctx, `Знамя увеличивает вашу точность на ${bonus}%. Мы очень-очень рады за вас.`);
    return done();
  },
};

export function registerMilitaryItemUsages(
  register: (code: number, handler: ItemUsageHandler) => void
): void {
  for (const [code, handler] of Object.entries(HANDLERS)) {
    register(Number(code), handler);
  }
}
