import { markDeadIfNeeded } from '../../combat/damage';
import { healUnit, resurrectUnit } from '../../combat/effects';
import { levelUpUnit } from '../../combat/level';
import { chancePercent } from '../../combat/morale';
import { isDemonClass, isUndeadClass } from '../../combat/races';
import { changeResist, setWard } from '../../combat/resists';
import { PERK_CATALOG } from '../../perks/catalog';
import { addPerk, done, log, reject } from './helpers';
import type { ItemUsageContext, ItemUsageHandler, ItemUsageOutcome } from './types';

function handlePontiffRing(ctx: ItemUsageContext): ItemUsageOutcome {
  const { state, invoker, choice } = ctx;
  if (choice != null) {
    if (choice === 'cancel' || choice === '0') {
      state.pendingPrompt = null;
      log(ctx, 'Вы убрали перстень.');
      return done({ consume: false, keepTurn: true });
    }
    const entry = state.graveyard.find(
      (g) => g.unitId === choice && g.team === invoker.team && !g.forbiddenResurrect
    );
    const unit = state.units.find((u) => u.id === choice);
    if (!entry || !unit || unit.alive) {
      return reject('Цель невозможно поднять, так как она была подвержена проклятью искоренения.');
    }
    const forbid = chancePercent(50);
    resurrectUnit(state, unit, { forbiddenResurrect: forbid });
    state.pendingPrompt = null;
    log(ctx, `${unit.displayName} успешно восстал из мёртвых!`);
    return done();
  }

  const options = state.graveyard
    .filter((g) => g.team === invoker.team && !g.forbiddenResurrect)
    .map((g) => {
      const unit = state.units.find((u) => u.id === g.unitId);
      const lvl = unit?.lvl ?? 1;
      return {
        id: g.unitId,
        label: `${g.displayName}, уровень ${lvl}`,
      };
    });
  if (options.length === 0) {
    return reject('На вашем кладбище некого поднять.');
  }
  options.unshift({ id: 'cancel', label: 'Выйти из меню' });
  state.pendingPrompt = {
    unitId: invoker.id,
    kind: 'pontiff-resurrect',
    options,
    context: {},
    source: 'item',
    itemCode: 655,
  };
  return { status: 'pending' };
}

const HANDLERS: Record<number, (ctx: ItemUsageContext) => ItemUsageOutcome> = {
  315: (ctx) => {
    setWard(ctx.target, 'HOLY', 1, false);
    changeResist(ctx.target, 'HOLY', 20);
    log(ctx, 'Сила епископской печати убережёт вас от нападок настоящих служителей Церкви.');
    return done();
  },
  325: (ctx) => {
    log(
      ctx,
      'Знания, изложенные в древнем фолианте, оказываются крайне полезными (да тут еще и картинки есть!). Вы поднимаете три уровня разом.'
    );
    levelUpUnit(ctx.target, 3, ctx.state);
    return done();
  },
  355: (ctx) => {
    ctx.target.armor += 20;
    addPerk(ctx.target, 'BONUS_MOVEMENT');
    log(ctx, 'Отличные сапоги, надо брать.');
    return done();
  },
  465: (ctx) => {
    log(ctx, 'Вы одаряете себя великой силой Создателя и Творца');
    addPerk(ctx.target, 'SUMMON_LEVEL_UP');
    return done();
  },
  475: (ctx) => {
    const { target } = ctx;
    if (!target.isSummon) {
      return reject('Выбранная цель не является саммоном.');
    }
    if (!isUndeadClass(target.heroClassCode) && !isDemonClass(target.heroClassCode)) {
      return reject('Цель не является демоном или нежитью.');
    }
    target.health -= 100;
    log(ctx, `Вы облили мерзкого ${target.displayName} святой водой. Изыди, сволочь!`);
    markDeadIfNeeded(ctx.state, target);
    return done();
  },
  555: (ctx) => {
    for (const perk of PERK_CATALOG) {
      if (perk.kind === 'item') {
        addPerk(ctx.target, perk.id);
      }
    }
    log(ctx, 'Теперь вы владеете всеми необходимыми перками для использования предметов.');
    return done();
  },
  655: handlePontiffRing,
  665: (ctx) => {
    const { target } = ctx;
    target.maxHp = Math.round(1.5 * target.maxHp);
    const healed = healUnit(target, Math.floor(target.health / 2));
    log(
      ctx,
      `Максимальное здоровье было увеличено на 50%, а текущее было восстановлено на ${healed} пт.`
    );
    return done();
  },
  715: (ctx) => {
    if (!ctx.target.isSummon) {
      return reject('Тебе это не нужно...');
    }
    ctx.target.isMercenary = true;
    log(
      ctx,
      'Духовные оковы не позволят саммону сбежать с поля боя: он будет сражаться до конца и сможет завершить начатое вами.'
    );
    return done();
  },
  935: (ctx) => {
    ctx.target.lives += 3;
    log(
      ctx,
      'Ознакомившись с учением пророка Изатиса, вы постигли и смирились со своим Уделом страдать. Зато вы стали ближе к Богам и получили три дополнительных Жизни.'
    );
    return done();
  },
};

export function registerRelicItemUsages(
  register: (code: number, handler: ItemUsageHandler) => void
): void {
  for (const [code, handler] of Object.entries(HANDLERS)) {
    register(Number(code), handler);
  }
}
