import { markDeadIfNeeded, randInt } from '../../combat/damage';
import { addMana, delEffect, grantEffect, hasEffect, healUnit } from '../../combat/effects';
import { levelUpUnit } from '../../combat/level';
import { chancePercent } from '../../combat/morale';
import { setWard } from '../../combat/resists';
import { getItem } from '../catalog';
import {
  addItem,
  itemCount,
  randomItemCodes,
  randomItemCodesByCategories,
  randomItemCodesByTier,
  teamInventory,
} from '../inventory';
import type { ItemUsageContext, ItemUsageHandler, ItemUsageOutcome } from './types';

function log(ctx: ItemUsageContext, message: string): void {
  ctx.state.log.push(message);
}

function done(opts?: { keepTurn?: boolean; consume?: boolean }): ItemUsageOutcome {
  return { status: 'done', ...opts };
}

function reject(message: string): ItemUsageOutcome {
  return { status: 'reject', message };
}

function lvl(ctx: ItemUsageContext): number {
  return ctx.invoker.lvl;
}

function openCase(ctx: ItemUsageContext, codes: number[], message: string): ItemUsageOutcome {
  for (const code of codes) {
    addItem(ctx.state, ctx.invoker.team, code, 1);
  }
  log(ctx, message);
  return done();
}

function handleMimic(ctx: ItemUsageContext): ItemUsageOutcome {
  const { state, invoker, choice } = ctx;
  if (choice != null) {
    const code = Number(choice);
    if (!Number.isFinite(code) || code === 347 || itemCount(state, invoker.team, code) < 1) {
      return reject('Нечего копировать.');
    }
    addItem(state, invoker.team, code, 1);
    const item = getItem(code);
    log(ctx, `Предмет ${item?.name ?? code} был успешно скопирован.`);
    state.pendingPrompt = null;
    return done();
  }

  const unique = [...new Set(teamInventory(state, invoker.team).filter((c) => c !== 347))];
  if (unique.length === 0) {
    return reject('Нечего копировать.');
  }
  state.pendingPrompt = {
    unitId: invoker.id,
    kind: 'mimic-copy',
    options: unique.map((code) => {
      const item = getItem(code);
      return { id: String(code), label: item?.name ?? String(code) };
    }),
    context: {},
    source: 'item',
    itemCode: 347,
  };
  log(ctx, 'Укажите номер той одной вещи, которую вы хотите копировать.');
  return { status: 'pending' };
}

const HANDLERS: Record<number, (ctx: ItemUsageContext) => ItemUsageOutcome> = {
  107: (ctx) => {
    const { target } = ctx;
    const value = Math.round((hasEffect(target, 'POISON') ? 1.5 : 1) * (20 + lvl(ctx)));
    target.health -= value;
    log(ctx, `Метательный нож убийцы нанес ${value} урона.`);
    markDeadIfNeeded(ctx.state, target);
    return done();
  },
  217: () => reject('Не годится для употребления. Лучше продать.'),
  137: () =>
    reject(
      'Свежеотпечанная акция сомнительной фирмы-однодневки. Годится только для моментальной продажи.'
    ),
  317: (ctx) => {
    const { target } = ctx;
    target.damage += Math.max(0, Math.floor(target.armor / 2));
    target.armor = 0;
    log(
      ctx,
      'Мёд админа крепко вдарил вам в голову! Вы раздеваетесь и чувствуете себя сильным и свободным.'
    );
    return done();
  },
  367: (ctx) => {
    grantEffect(ctx.target, 'IMAGINARY_HEALTH', 3, 120);
    log(
      ctx,
      'Выпив эликсир, вы ощущаете прилив сил. Но эти силы покинут вас, ровно в то же мгновение, когда кончится эффект.'
    );
    return done();
  },
  297: (ctx) => {
    setWard(ctx.target, 'DESTROYARMOR', 3, false);
    log(
      ctx,
      'Вы щедро заливаете в сочленения своего доспеха купленное зелье. Должно сработать. Наверное.'
    );
    return done();
  },
  357: (ctx) => {
    const { target, state } = ctx;
    target.develop = Math.max(1, (target.develop ?? 6) - 3);
    levelUpUnit(target, -1, state);
    log(
      ctx,
      'Это было тяжело, но вы справились. Омерзительный почерк, грязные исправления, матерные стишки на полях, но вы преисполнились мудростью автора' +
        ' - вы будете получать перки чаще.'
    );
    return done();
  },
  197: (ctx) => {
    const amount = 20 + lvl(ctx);
    ctx.target.morale -= amount;
    log(ctx, `Боевой дух оппонента снижен на ${amount} пунктов.`);
    return done();
  },
  337: (ctx) => {
    ctx.target.merchant = (ctx.target.merchant ?? 0) + 0.25;
    log(
      ctx,
      'Вы облились парфюмом с ног до головы, чтоб наверняка поразить работников ярмарки. Теперь вы пахнете сиренью и крыжовником.'
    );
    return done();
  },
  207: (ctx) => {
    const bonus = 12 + lvl(ctx);
    ctx.target.luck += bonus;
    log(ctx, `Снюхав жирную дорожку сахара, вы обрели ${bonus}% шансов критического удара.`);
    if (chancePercent(2)) {
      ctx.invoker.health = 0;
      markDeadIfNeeded(ctx.state, ctx.invoker, { ignoreSaves: true });
      log(ctx, 'Но вы умерли от сердечного приступа.');
    }
    return done();
  },
  407: (ctx) => {
    ctx.target.critBank += 2;
    ctx.target.initiative += 10;
    if (chancePercent(4)) {
      ctx.invoker.health = 0;
      markDeadIfNeeded(ctx.state, ctx.invoker, { ignoreSaves: true });
      log(ctx, 'Но вы умерли от сердечного приступа.');
    }
    return done();
  },
  187: (ctx) => {
    const bonus = 16 + lvl(ctx) * 2;
    ctx.target.armor += bonus;
    log(ctx, `Ваша броня увеличена на ${bonus} пт.`);
    return done();
  },
  397: (ctx) => {
    const power = Math.round(ctx.target.damage * 0.5);
    grantEffect(ctx.target, 'STRENGTH', 3, power);
    log(ctx, 'Вы временно усилили свой урон на 50%.');
    return done();
  },
  237: (ctx) => {
    const healed = healUnit(ctx.target, 75);
    log(ctx, `Ваше здоровье восстановлено на ${healed} пт.`);
    return done();
  },
  387: (ctx) => {
    const healed = healUnit(ctx.target, 150);
    log(ctx, `Ваше здоровье восстановлено на ${healed} пт. Прекрасное средство, не так ли?`);
    return done();
  },
  2137: (ctx) => {
    grantEffect(ctx.target, 'STONEFLESH', 3, 25);
    grantEffect(ctx.target, 'REGENHP', 3, 1.25);
    log(ctx, 'вкусно.');
    return done();
  },
  2187: (ctx) => {
    const bonus = 12 + lvl(ctx) + Math.floor(lvl(ctx) / 2);
    ctx.target.damage += bonus;
    grantEffect(ctx.target, 'DRUNK', randInt(2, 3), 25);
    log(
      ctx,
      `Отвратительное пойло! Какие малютки вообще могут пить подобное? Вы жутко пьяны, но +${bonus} атаки, есть +${bonus} атаки.`
    );
    return done();
  },
  267: (ctx) => {
    delEffect(ctx.target, 'FEAR');
    setWard(ctx.target, 'MIND', 1, false);
    log(ctx, 'Настойка успокоила ваши нервы и обволокла разум.');
    return done();
  },
  147: (ctx) => {
    const x = randInt(3, 4);
    addMana(ctx.target, x);
    log(ctx, `Магия восстановлена на ${x} пунктов.`);
    return done();
  },
  307: (ctx) => {
    const x = randInt(6, 9);
    addMana(ctx.target, x);
    log(ctx, `Магия восстановлена на ${x} пунктов.`);
    return done();
  },
  227: (ctx) => {
    const bonus = 10 + lvl(ctx);
    ctx.target.dodge += bonus;
    log(
      ctx,
      `Намазавшись атлетическим маслом, вы способны выскользнуть из-под любой атаки. Уклонение увеличено на ${bonus} пт.`
    );
    return done();
  },
  287: (ctx) => {
    delEffect(ctx.target, 'POISON');
    setWard(ctx.target, 'DEATH', 1, false);
    log(ctx, 'Противоядие очистило ваш организм.');
    return done();
  },
  117: (ctx) => {
    const beer = ctx.target.morale < 0 ? 18 + lvl(ctx) : 12;
    ctx.target.morale += beer;
    log(
      ctx,
      `Реклама не врала, вы ощущаете приятное фруктовое послевкусие. А жизнь-то налаживается! Ваш боевой дух поднят на ${beer} единиц.`
    );
    return done();
  },
  247: (ctx) => {
    grantEffect(ctx.target, 'POISON', 4, 1.1);
    log(ctx, 'Очень по-взрослому. Но сделанного не воротишь - ваш противник отравлен.');
    return done();
  },
  257: (ctx) => {
    grantEffect(ctx.target, 'POISONEDWEAPON', randInt(2, 3));
    log(ctx, 'Яд виверны впитывается в ваше оружие.');
    return done();
  },
  167: (ctx) =>
    openCase(ctx, randomItemCodesByTier(3, 4, 1), 'Определённо это кейс нового тысячелетия.'),
  447: (ctx) =>
    openCase(ctx, randomItemCodesByTier(5, 6, 1), 'Ого! Ничего себе! Просто вау. Беги смотреть!'),
  647: (ctx) =>
    openCase(
      ctx,
      randomItemCodesByTier(7, 8, 1),
      'Невероятная вещица сегодня выпадает нам, дорогие друзья! Вкуснятина.'
    ),
  747: (ctx) =>
    openCase(
      ctx,
      randomItemCodesByTier(9, 9, 1),
      'И вам выпадают ПРОКЛЯТЫЕ ШТАНЫ ТЕНЕВОГО ЛЕГИОНА! Свет 100 пт, Звук 50 пт, Слепота 75%, +5 Красноречия. А, тут двойное дно. Ну посмотри сам, тогда.'
    ),
  567: (ctx) =>
    openCase(
      ctx,
      randomItemCodes(3),
      'Ставки сделаны, ставок больше нет. Что же получит наш герой?'
    ),
  547: (ctx) =>
    openCase(
      ctx,
      randomItemCodesByCategories([2, 6], 1),
      'А ведь они могли в сентябре выпускать шестые свитки!'
    ),
  587: (ctx) => openCase(ctx, randomItemCodesByCategories([3, 4, 8], 1), 'АХАХААХАХАХАХА'),
  597: (ctx) => openCase(ctx, randomItemCodesByCategories([1, 5], 1), 'Ха-ха-ха.'),
  347: handleMimic,
  797: (ctx) => {
    const { invoker, target, state } = ctx;
    if (invoker.health < Math.floor(invoker.maxHp / 2)) {
      return reject('Судья не пойдёт на сделку: ваше поражение будет выглядеть неубедительно.');
    }
    log(
      ctx,
      `Судья принимает увесистый мешочек с деньгами, который вы передали ему через подставное лицо. Пересчитав деньги, он делает знак охранникам арены,` +
        ` которые забивают ${invoker.displayName} и ${target.displayName} клюшками для гольфа до бессознательного состояния. Вы уходите с позором, зато живые. `
    );
    invoker.health = 0;
    target.health = 0;
    markDeadIfNeeded(state, invoker, { ignoreSaves: true });
    markDeadIfNeeded(state, target, { ignoreSaves: true });
    return done();
  },
};

/** Регистрация расходников (категория 7). */
export function registerMiscItemUsages(
  register: (code: number, handler: ItemUsageHandler) => void
): void {
  for (const [code, handler] of Object.entries(HANDLERS)) {
    register(Number(code), handler);
  }
}
