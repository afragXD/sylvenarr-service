import { harmWithSource, markDeadIfNeeded, randInt } from '../../combat/damage';
import { levelUpUnit } from '../../combat/level';
import { chancePercent } from '../../combat/morale';
import { changeResist, setWard } from '../../combat/resists';
import { getItem } from '../catalog';
import { removeItem, teamInventory } from '../inventory';
import { done, invokerLvl, log, reject } from './helpers';
import type { ItemUsageContext, ItemUsageHandler, ItemUsageOutcome } from './types';

function maybeKeepScrollTurn(): { keepTurn?: boolean } {
  return chancePercent(50) ? { keepTurn: true } : {};
}

const HANDLERS: Record<number, (ctx: ItemUsageContext) => ItemUsageOutcome> = {
  354: (ctx) => {
    const delta = 20 + invokerLvl(ctx);
    changeResist(ctx.target, 'FIRE', -delta);
    changeResist(ctx.target, 'DEATH', -delta);
    log(ctx, `Свиток уменьшает сопротивление врага к Огню и Смерти на ${delta}%.`);
    return done(maybeKeepScrollTurn());
  },
  334: (ctx) => {
    const delta = 20 + invokerLvl(ctx);
    changeResist(ctx.target, 'AIR', -delta);
    changeResist(ctx.target, 'MIND', -delta);
    log(ctx, `Свиток уменьшает сопротивление врага к Воздуху и Разуму на ${delta}%.`);
    return done(maybeKeepScrollTurn());
  },
  444: (ctx) => {
    const team = ctx.target.team;
    const inv = teamInventory(ctx.state, team);
    if (inv.length === 0) {
      return reject('Инвентарь противника пуст.');
    }
    const first = inv[randInt(0, inv.length - 1)]!;
    removeItem(ctx.state, team, first, 1);
    const firstName = getItem(first)?.name ?? String(first);
    let report = `Свиток уничтожил предметы: ${firstName}`;
    const remaining = teamInventory(ctx.state, team);
    if (remaining.length > 0) {
      const second = remaining[randInt(0, remaining.length - 1)]!;
      removeItem(ctx.state, team, second, 1);
      const secondName = getItem(second)?.name ?? String(second);
      report += ` и ${secondName}!`;
    }
    log(ctx, report);
    return done();
  },
  454: (ctx) => {
    levelUpUnit(ctx.target, -3, ctx.state);
    const perks = ctx.target.perks ?? [];
    if (perks.length > 0) {
      const idx = randInt(0, perks.length - 1);
      perks.splice(idx, 1);
      ctx.target.perks = perks;
    }
    log(
      ctx,
      `Дрожащими руками ${ctx.target.displayName} разворачивает свиток, в котором содержится заказ на 24-часовой марафон на просмотр аниме "Бесконечная восьмёрка". Приятного просмотра!`
    );
    return done();
  },
  474: (ctx) => {
    const bonus = 15 + invokerLvl(ctx) * 3;
    ctx.target.armor += bonus;
    setWard(ctx.target, 'WEAPON', 1, false);
    log(
      ctx,
      `Доспех укреплён на ${bonus} пт. Также незерит защитит вас от первой физической атаки.`
    );
    return done(maybeKeepScrollTurn());
  },
  434: (ctx) => {
    ctx.target.maxHp = Math.floor(ctx.target.maxHp / 2);
    ctx.target.health = Math.min(ctx.target.health, ctx.target.maxHp);
    log(
      ctx,
      'Свиток лишает вас врождённого здоровья. Ваше максимальное здоровье уменьшено в два раза.'
    );
    markDeadIfNeeded(ctx.state, ctx.target);
    return done();
  },
  404: (ctx) => {
    const mana = ctx.invoker.mana;
    const dealt = harmWithSource(ctx.state, ctx.target, mana * 10, 'DEFAULT');
    const spent = Math.floor(mana / 2);
    ctx.invoker.mana = spent;
    log(ctx, `Свиток наносит ${dealt} урона Жизнью, пожирая ${spent} единиц маны.`);
    markDeadIfNeeded(ctx.state, ctx.target);
    return done();
  },
};

export function registerScrollItemUsages(
  register: (code: number, handler: ItemUsageHandler) => void
): void {
  for (const [code, handler] of Object.entries(HANDLERS)) {
    register(Number(code), handler);
  }
}
