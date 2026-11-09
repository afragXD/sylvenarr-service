import { markDeadIfNeeded, randInt, rollChance } from '../../combat/damage';
import { clearDebuffs, grantEffect, hasEffect, healUnit } from '../../combat/effects';
import { chancePercent } from '../../combat/morale';
import { changeResist } from '../../combat/resists';
import { done, invokerLvl, log, tryItemSummon, unitsOnRow } from './helpers';
import type { ItemUsageContext, ItemUsageHandler, ItemUsageOutcome } from './types';

function musketEvade(ctx: ItemUsageContext): boolean {
  const { invoker, target } = ctx;
  if ((target.dodgeBank ?? 0) > 0) {
    target.dodgeBank -= 1;
    return true;
  }
  const missChance = target.dodge + 1 + 95 - invoker.accuracy;
  return rollChance(missChance);
}

const HANDLERS: Record<number, (ctx: ItemUsageContext) => ItemUsageOutcome> = {
  322: (ctx) => {
    for (const enemy of unitsOnRow(ctx, ctx.target)) {
      if (hasEffect(enemy, 'INVISIBLE')) {
        continue;
      }
      enemy.health -= randInt(40, 60);
      markDeadIfNeeded(ctx.state, enemy);
    }
    log(
      ctx,
      'Картечь разлетается во все стороны, калеча вражескую команду примерно на 40-60 здоровья.'
    );
    return done();
  },
  532: (ctx) => {
    if (musketEvade(ctx)) {
      log(ctx, `${ctx.target.displayName} уклоняется от выстрела.`);
      return done({ consume: false });
    }
    const dmg = 30 + invokerLvl(ctx) * 2;
    ctx.target.health -= dmg;
    log(ctx, `Ружье взведено, нервы напряжены - вы нанесли ${dmg} урона!`);
    markDeadIfNeeded(ctx.state, ctx.target);
    if (chancePercent(invokerLvl(ctx) * 10)) {
      return done({ consume: false });
    }
    log(
      ctx,
      'Вы не проявили должного навыка и впустую растратили все патроны. Мушкет теперь бесполезен, и вы его выкинули от злости в кусты.'
    );
    return done();
  },
  932: (ctx) => {
    const dmg = 75 + invokerLvl(ctx) * 2;
    ctx.target.health -= dmg;
    log(
      ctx,
      `Внеземной бластер Чужих (о как же он прекрасен и лорен) выпускает сгусток плазмы, наносящей ${dmg} урона.`
    );
    markDeadIfNeeded(ctx.state, ctx.target);
    return done({ consume: false });
  },
  762: (ctx) => {
    ctx.target.artificial = true;
    log(
      ctx,
      'Парень из толпы показался вам отличным хирургом, и он был приглашён на операцию по вживлению вам механического сердца, которое сделает из вас бездушное порождение технологий. Вы больше никогда не сможете улыбнуться, порадоваться или сострадать. Но вы и не сойдёте с ума и не умрёте от сердечного приступа. '
    );
    return done();
  },
  522: (ctx) => {
    clearDebuffs(ctx.target);
    const healed = healUnit(ctx.target, 200);
    log(
      ctx,
      `Аптечка Древних специальными манипуляторами очистила ваш организм и восстановила ${healed} здоровья.`
    );
    return done();
  },
  662: (ctx) => {
    const bonus = 40 + invokerLvl(ctx);
    ctx.target.accuracy += bonus;
    log(
      ctx,
      '«Молвят, ведьмак собьёт стрелу на лету»... В этих стильных очках оказалась еще и встроенная система наведения и GPS-навигатор.'
    );
    return done();
  },
  562: (ctx) => {
    ctx.target.healRate = (ctx.target.healRate ?? 1) - 0.25;
    log(
      ctx,
      'В инжекторном пистолете содержался дротик с веществом, которое способно подавить метаболизм в теле человека.'
    );
    return done();
  },
  402: (ctx) => {
    changeResist(ctx.target, 'STUN', 50);
    log(
      ctx,
      'Нейроусилитель делает вас практически неуязвимым к беспардонным попыткам вас оглушить.'
    );
    return done();
  },
  412: (ctx) => {
    grantEffect(ctx.target, 'FIREDWEAPON', 3);
    log(
      ctx,
      'Вы смазываете своё оружие огненной смолой - удивительным подарком забытой цивилизации.'
    );
    return done();
  },
  572: (ctx) =>
    tryItemSummon(
      ctx,
      'GoldGolem',
      'Поколдовав с отверткой и покурив пару-тройку гайдов, вы вводите Голема в эксплуатацию.'
    ),
};

export function registerTechItemUsages(
  register: (code: number, handler: ItemUsageHandler) => void
): void {
  for (const [code, handler] of Object.entries(HANDLERS)) {
    register(Number(code), handler);
  }
}
