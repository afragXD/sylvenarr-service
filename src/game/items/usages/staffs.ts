import { randInt } from '../../combat/damage';
import { destroyArmor, healUnit } from '../../combat/effects';
import { levelUpUnit } from '../../combat/level';
import { chancePercent } from '../../combat/morale';
import { changeResist } from '../../combat/resists';
import { addTeamGold, teamGold } from '../../economy';
import { done, invokerLvl, log, reject, tryItemSummon } from './helpers';
import type { ItemUsageContext, ItemUsageHandler, ItemUsageOutcome } from './types';

function keepStaffCharge(
  ctx: ItemUsageContext,
  chance: number,
  savedMsg?: string
): ItemUsageOutcome {
  if (chancePercent(chance)) {
    if (savedMsg) {
      log(ctx, savedMsg);
    }
    return done({ consume: false });
  }
  if (!savedMsg) {
    log(ctx, 'Вы не проявили должной сноровки при работе с посохом, и он окончательно разрядился.');
  }
  return done();
}

const KEEP_MAGIC = 'Используя свои познания в магии, вы сумели сохранить еще один заряд в посохе.';

const HANDLERS: Record<number, (ctx: ItemUsageContext) => ItemUsageOutcome> = {
  558: (ctx) => {
    const bonus = 18 + invokerLvl(ctx);
    ctx.target.accuracy += bonus;
    log(ctx, `Инструкторский посох добавил вам ${bonus}% точности.`);
    return keepStaffCharge(ctx, ctx.target.power + invokerLvl(ctx));
  },
  458: (ctx) => {
    const amount = Math.round(Math.max(ctx.target.damage, ctx.target.power) * 0.6);
    const healed = healUnit(ctx.target, amount);
    log(ctx, `${healed} ОЗ восстановил Церковный посох.`);
    return keepStaffCharge(ctx, ctx.target.power + 8 + invokerLvl(ctx));
  },
  448: (ctx) => {
    const enemyGold = teamGold(ctx.state, ctx.target.team);
    if (enemyGold <= 0) {
      return reject('Денег у врага больше нет( Попробуйте другое действие.');
    }
    const want = randInt(60, 100 + invokerLvl(ctx) * 15);
    const stolen = Math.min(want, enemyGold);
    addTeamGold(ctx.state, ctx.target.team, -stolen);
    addTeamGold(ctx.state, ctx.invoker.team, stolen);
    if (stolen === enemyGold) {
      log(
        ctx,
        `Посох притягивает все монеты, которые были в мошне врага. Мда, небохато - ${stolen} монет.`
      );
    } else {
      log(ctx, `${stolen} монет оппонента оседают в вашем кошельке.`);
    }
    return chancePercent(60) ? done({ consume: false }) : done();
  },
  478: (ctx) => {
    const arm = 12 + invokerLvl(ctx) * 3;
    const res = invokerLvl(ctx) + 1;
    ctx.target.armor += arm;
    changeResist(ctx.target, 'WEAPON', res);
    log(
      ctx,
      `Посох укрепил ваши доспехи на ${arm} пунктов и увеличил сопротивление оружию на ${res}%.`
    );
    return keepStaffCharge(ctx, Math.floor(ctx.target.power / 2) + 15, KEEP_MAGIC);
  },
  428: (ctx) => {
    log(
      ctx,
      `Никакой мерзкой магии, только проверенные дедовские методы. Вы бьёте палкой ${ctx.target.displayName}, пока не убедитесь, что уроки усвоены.`
    );
    levelUpUnit(ctx.target, randInt(1, 2), ctx.state);
    return chancePercent(ctx.target.damage + 15) ? done({ consume: false }) : done();
  },
  468: (ctx) => {
    const stripped = destroyArmor(ctx.target, 20 + invokerLvl(ctx));
    log(ctx, `Доспехи были разрушены на ${stripped} пт.`);
    return keepStaffCharge(ctx, Math.floor(ctx.target.power / 2) + 15, KEEP_MAGIC);
  },
  328: (ctx) => {
    const summoned = tryItemSummon(
      ctx,
      'BeerElemental',
      'На зов посоха откликается маниакально-депрессивный Пивной Элементаль.'
    );
    if (summoned.status !== 'done') {
      return summoned;
    }
    return keepStaffCharge(ctx, Math.floor(ctx.invoker.power / 2) + 10, KEEP_MAGIC);
  },
};

export function registerStaffItemUsages(
  register: (code: number, handler: ItemUsageHandler) => void
): void {
  for (const [code, handler] of Object.entries(HANDLERS)) {
    register(Number(code), handler);
  }
}
