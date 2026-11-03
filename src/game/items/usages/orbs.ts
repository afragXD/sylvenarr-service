import { harmWithSource, markDeadIfNeeded, randInt } from '../../combat/damage';
import { clearAllEffects, clearBuffs, tryStun } from '../../combat/effects';
import { levelUpUnit } from '../../combat/level';
import { rollSrcChance } from '../../combat/resists';
import { applyCatalogStats, transformClassOnly } from '../../combat/transform';
import { done, log, reject } from './helpers';
import type { ItemUsageContext, ItemUsageHandler, ItemUsageOutcome } from './types';

const FEMALE_TRANSFORM = ['Oracle', 'Herbalist', 'Mermaid'] as const;

const HANDLERS: Record<number, (ctx: ItemUsageContext) => ItemUsageOutcome> = {
  343: (ctx) => {
    if (rollSrcChance(ctx.state, ctx.target, 100, 'MIND')) {
      log(ctx, 'Вы разбиваете сферу, из которой слышны крики баньши. Они идут за тобой...');
      tryStun(ctx.state, ctx.target, 1);
    } else {
      log(ctx, 'Оппонент не поддается влиянию сферы.');
    }
    return done();
  },
  353: (ctx) => {
    const morale = ctx.invoker.morale;
    if (morale >= 0 || morale < -150) {
      return reject('Сфера не подействует, поскольку у вас неправильный боевой дух.');
    }
    const dealt = harmWithSource(ctx.state, ctx.target, Math.abs(morale) * 2.5, 'MIND');
    log(ctx, `Все ваши страдания, боль, унижения конвертировались в ${dealt} урона по противнику.`);
    markDeadIfNeeded(ctx.state, ctx.target);
    return done();
  },
  363: (ctx) => {
    clearBuffs(ctx.target, ctx.state);
    const dealt = harmWithSource(ctx.state, ctx.target, 60, 'WATER');
    log(ctx, `Положительные эффекты спали и сфера нанесла ${dealt} урона.`);
    markDeadIfNeeded(ctx.state, ctx.target);
    return done();
  },
  613: (ctx) => {
    if (!ctx.state.doneIds.includes(ctx.target.id)) {
      return reject(
        `Дождитесь пока ${ctx.target.displayName} сделает свой ход, иначе магия пропадёт впустую.`
      );
    }
    ctx.state.doneIds = ctx.state.doneIds.filter((id) => id !== ctx.target.id);
    ctx.state.preChoiceDoneIds = ctx.state.preChoiceDoneIds.filter((id) => id !== ctx.target.id);
    log(ctx, `${ctx.target.displayName} получает дополнительный ход.`);
    return done();
  },
  323: (ctx) => {
    const before = ctx.target.health;
    ctx.target.health = Math.round(ctx.target.health * 0.7);
    const lost = before - ctx.target.health;
    log(
      ctx,
      `Сфера мучительно перестраивает ваше тело изнутри, причиняя жуткую боль. Вы потеряли ${lost} здоровья.`
    );
    markDeadIfNeeded(ctx.state, ctx.target);
    return done();
  },
  513: (ctx) => {
    const code = FEMALE_TRANSFORM[randInt(0, FEMALE_TRANSFORM.length - 1)]!;
    if (!transformClassOnly(ctx.state, ctx.target, code)) {
      return reject('Превращение не удалось.');
    }
    applyCatalogStats(ctx.state, ctx.target, code);
    log(ctx, 'Красотища.');
    return done();
  },
  433: (ctx) => {
    ctx.target.damage = Math.round(ctx.target.damage * 0.7);
    log(
      ctx,
      `Сфера ослабляет физический урон противника на 30%, теперь противник имеет ${ctx.target.damage} пт урона.`
    );
    return done();
  },
  413: (ctx) => {
    for (const unit of ctx.state.units) {
      if (unit.team === ctx.target.team && unit.alive) {
        levelUpUnit(unit, 2, ctx.state);
      }
    }
    log(
      ctx,
      'Разбив сферу об пол, вы убедились что в ней содержался целый тюбик мельдония. Вот тебе чародейство и волшебство...'
    );
    return done();
  },
  523: (ctx) => {
    log(
      ctx,
      `Хищно улыбаясь, вы подходите к несчастному ${ctx.target.displayName}. Он дрожит от страха, но не в состоянии изменить свою участь. Вы разбиваете сферу об его голову.Газ, содержащийся в ней, медленно расправляется с ${ctx.target.displayName}, пока он орёт от боли. Отныне он Призрак, но он никогда вам этого не забудет.`
    );
    if (!transformClassOnly(ctx.state, ctx.target, 'Specter')) {
      return reject('Превращение не удалось.');
    }
    applyCatalogStats(ctx.state, ctx.target, 'Specter');
    ctx.target.isSummon = false;
    clearAllEffects(ctx.target, ctx.state);
    ctx.target.health = ctx.target.maxHp;
    return done();
  },
  233: (ctx) => {
    ctx.target.develop = (ctx.target.develop ?? 6) + 3;
    log(
      ctx,
      'Сфера замедлила процесс получения перков противником. К сфере прилагается записка - "Кто её применит - тот клоун 🤡". Мораль думай сам.'
    );
    return done();
  },
};

export function registerOrbItemUsages(
  register: (code: number, handler: ItemUsageHandler) => void
): void {
  for (const [code, handler] of Object.entries(HANDLERS)) {
    register(Number(code), handler);
  }
}
