import { DAMAGE_SOURCES } from '../../combat/damageSources';
import { grantEffect } from '../../combat/effects';
import { changeResist, setImmunity } from '../../combat/resists';
import { done, invokerLvl, log } from './helpers';
import type { ItemUsageContext, ItemUsageHandler, ItemUsageOutcome } from './types';

const HANDLERS: Record<number, (ctx: ItemUsageContext) => ItemUsageOutcome> = {
  216: (ctx) => {
    ctx.target.power = Math.round(0.7 * ctx.target.power);
    log(ctx, `Амулет уничтожает часть могущества ${ctx.target.displayName}.`);
    return done();
  },
  246: (ctx) => {
    const bonus = invokerLvl(ctx) + 14;
    ctx.target.power += bonus;
    log(ctx, `Кристалл усиливает вашу магию на ${bonus} единиц.`);
    return done();
  },
  276: (ctx) => {
    const amount = 12 + invokerLvl(ctx) * 2;
    ctx.target.luck -= amount;
    log(ctx, `Удача оппонента снижена на ${amount} пунктов.`);
    return done();
  },
  346: (ctx) => {
    log(
      ctx,
      'Надев на себя шлем-диадему, вы ощущаете прикосновение источника магической энергии...'
    );
    changeResist(ctx.target, 'MIND', 20);
    grantEffect(ctx.target, 'REGENMANA', 4, 2);
    return done();
  },
  356: (ctx) => {
    ctx.target.critBank += 2;
    ctx.target.dodgeBank += 2;
    log(ctx, 'ВЫ ВЫБРАЛИ НЕПРАВИЛЬНОГО БОСМЕРА! Вы чувствуете истинную пустотелость.');
    return done();
  },
  406: (ctx) => {
    const a = ctx.invoker.mana;
    const b = ctx.target.mana;
    ctx.invoker.mana = b;
    ctx.target.mana = a;
    log(ctx, 'Вы обмениваетесь значениями маны.');
    return done();
  },
  456: (ctx) => {
    const bonus = 20 + invokerLvl(ctx);
    ctx.target.initiative += bonus;
    log(
      ctx,
      `Вы чувствуете, что мы можем немного ускориться! Ваша инициатива поднята на ${bonus} пт.`
    );
    return done();
  },
  466: (ctx) => {
    grantEffect(ctx.target, 'KILLMANA', 3, 3);
    log(ctx, 'Оковы защелкиваются на руках вражеского мага, зажигаясь синим цветом.');
    return done();
  },
  476: (ctx) => {
    changeResist(ctx.target, 'FIRE', 15);
    changeResist(ctx.target, 'DEATH', 15);
    ctx.target.armor += 50;
    log(ctx, 'Латы дают вам 50 брони и сопротивления.');
    return done();
  },
  516: (ctx) => {
    ctx.target.healRate = (ctx.target.healRate ?? 1) + 0.25;
    log(ctx, 'Перчатки рыцаря Вереска делают вас нежным и чувствительным.');
    return done();
  },
  566: (ctx) => {
    ctx.target.lives += 1;
    log(ctx, `${ctx.target.displayName} получает дополнительную жизнь.`);
    return done();
  },
  576: (ctx) => {
    log(
      ctx,
      '[ЭНЦИКЛОПЕДИЯ][Бесполезно-Успех!] Прославленный царь минотавров, Ксеркс I Солнцеподобный, был также знаменит за упорную борьбу с лже-воскрешением.'
    );
    ctx.target.lives = Math.max(0, ctx.target.lives - 2);
    ctx.target.forbiddenResurrect = true;
    return done();
  },
  616: (ctx) => {
    log(
      ctx,
      `${ctx.target.displayName} надевает удобные сапоги Ордена, и чувствует как он крепче стоит на ногах.`
    );
    changeResist(ctx.target, 'FINALSTRIKE', 75);
    return done();
  },
  636: (ctx) => {
    log(
      ctx,
      'Королевские грифоны Эрафии известны тем, что они отвечают на любую провокацию. Теперь это свойство передалось и вам.'
    );
    grantEffect(ctx.target, 'CONTR', 4);
    return done();
  },
  646: (ctx) => {
    log(ctx, 'Чалма султана-ифрита отлично сидит на вашей голове, окружая вас огненным барьером.');
    grantEffect(ctx.target, 'FIRESHIELD', 4);
    return done();
  },
  736: (ctx) => {
    ctx.target.armor = 80;
    setImmunity(ctx.target, 'DESTROYARMOR');
    log(ctx, 'Латы Титана невероятно прочны, но громоздки - все предыдущие одежды пришлось снять.');
    return done();
  },
  906: (ctx) => {
    log(
      ctx,
      'Камень, упавший с небес, один из символов Императорской династии, обладает силой защищать своего владельца от любых невзгод. ' +
        'Остается только понять, что он делает на этой сомнительной ярмарке.'
    );
    for (const source of DAMAGE_SOURCES) {
      changeResist(ctx.target, source, 50);
    }
    return done();
  },
};

export function registerArtifactItemUsages(
  register: (code: number, handler: ItemUsageHandler) => void
): void {
  for (const [code, handler] of Object.entries(HANDLERS)) {
    register(Number(code), handler);
  }
}
