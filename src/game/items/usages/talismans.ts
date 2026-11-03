import { invokerLvl, tryItemSummon } from './helpers';
import type { ItemUsageHandler, ItemUsageOutcome } from './types';

const HANDLERS: Record<number, (ctx: Parameters<ItemUsageHandler>[0]) => ItemUsageOutcome> = {
  411: (ctx) => {
    const lvl = invokerLvl(ctx);
    if (lvl <= 5) {
      return tryItemSummon(ctx, 'Zombie', 'Обычный зомби откликается на зов вашего талисмана.');
    }
    if (lvl <= 11) {
      return tryItemSummon(
        ctx,
        'SkeletonChampion',
        'Ваше возросшее могущество позволило вам призвать скелета-чемпиона.'
      );
    }
    return tryItemSummon(
      ctx,
      'GhostWarrior',
      'Хвалю ваше терпение, мой юный некромант. Теперь на зов вашего талисмана откликнутся воин-призрак.'
    );
  },
  431: (ctx) =>
    tryItemSummon(
      ctx,
      'GoblinShaman',
      'Перед вами материализуется заспанный шаман гоблинов, готовый вам служить, повелитель.'
    ),
  521: (ctx) => tryItemSummon(ctx, 'Oracle', 'Силами талисмана вы призываете эльфийку-оракула.'),
  601: (ctx) => tryItemSummon(ctx, 'Herbalist', 'Силами талисмана вы призываете травницу.'),
  581: (ctx) => tryItemSummon(ctx, 'Specter', 'Силами талисмана вы призываете ужасного призрака.'),
  321: (ctx) =>
    tryItemSummon(
      ctx,
      'Ectoplasm',
      'Вы призываете нестабильную эктоплазму, который сбежал из лабораторий чернокнижников.'
    ),
  651: (ctx) =>
    tryItemSummon(
      ctx,
      'Mermaid',
      'Ближайшая лужа разливается в прекрасное озеро, из которого выходит Русалка на зов вашего Талисмана.'
    ),
  701: (ctx) =>
    tryItemSummon(
      ctx,
      'Pyro',
      'Из клубов пара и гари появляется гном-кузнец-огнемётчик-филантроп и многодетный отец. Из одежды на нем только фартук.'
    ),
  541: (ctx) =>
    tryItemSummon(
      ctx,
      'GoblinTrapper',
      'С помощью талисмана вы призываете гоблина-налётчика, шалопая окаянного.'
    ),
  741: (ctx) => tryItemSummon(ctx, 'EvilTree', 'Упырица вступает в бой...'),
  751: (ctx) =>
    tryItemSummon(ctx, 'Assassin', '', (summon) => {
      summon.deathNote = 20;
    }),
};

export function registerTalismanItemUsages(
  register: (code: number, handler: ItemUsageHandler) => void
): void {
  for (const [code, handler] of Object.entries(HANDLERS)) {
    register(Number(code), handler);
  }
}
