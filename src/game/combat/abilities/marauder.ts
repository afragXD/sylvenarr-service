import { dealDamage, formatLastLogDamage, markDeadIfNeeded, randInt } from '../damage';
import { formatLogDamage } from '../damageSources';
import { grantEffect, hasEffect, healUnit, trySpendMana, addMana } from '../effects';
import { setWard } from '../resists';
import { ROW_BACK, ROW_FRONT } from '../settings';
import { applyCatalogStats } from '../transform';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit } from '../types';
import { enemiesInColumn, enemiesOf, meleeOrAll, moveToOtherRow, unitsOnSameRow } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

function marauderMeta(
  state: BattleState,
  actor: BattleUnit,
  slot: AbilitySlot
): AbilityInfo {
  switch (slot) {
    case 1: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 1,
        label: 'Композитный лук',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 2,
        label: 'Подавляющий огонь',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 3,
        label: 'Мощный выстрел',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 4:
      return {
        slot: 4,
        label: `Оборотень (${actor.ultaCharges})`,
        needsTarget: false,
        disabledReason: actor.ultaCharges <= 0 ? 'Нет зарядов' : null,
        legalTargetIds: [],
      };
    case 5: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 5,
        label: 'Тёмное пламя',
        needsTarget: true,
        disabledReason:
          actor.mana < 3
            ? 'Нужно 3 МР'
            : targets.length === 0
              ? 'Нет целей'
              : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
  }
}

function werewolfMeta(
  state: BattleState,
  actor: BattleUnit,
  slot: AbilitySlot
): AbilityInfo {
  switch (slot) {
    case 1: {
      const targets = meleeOrAll(state, actor, false);
      return {
        slot: 1,
        label: 'Разорвать плоть',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      // ignoreGuard — порт Werewolf.secondAction(MeleePattern ignoreGuard=True).
      const targets = meleeOrAll(state, actor, true, { ignoreGuard: true });
      return {
        slot: 2,
        label: 'Вечный голод',
        needsTarget: true,
        disabledReason:
          actor.row !== ROW_BACK
            ? 'Нужен задний ряд'
            : targets.length === 0
              ? 'Нет целей'
              : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3:
      return {
        slot: 3,
        label: 'Успокоение',
        needsTarget: false,
        disabledReason: null,
        legalTargetIds: [],
      };
    case 4: {
      const targets = enemiesOf(state, actor);
      return {
        slot: 4,
        label: 'Звериная желчь',
        needsTarget: true,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 5:
      return {
        slot: 5,
        label: 'Базовые действия',
        needsTarget: false,
        disabledReason: 'Используйте защиту / ожидание',
        legalTargetIds: [],
      };
  }
}

function applyMarauder(
  state: BattleState,
  actor: BattleUnit,
  input: { slot: AbilitySlot; targetId?: string }
): AbilityOutcome {
  const meta = marauderMeta(state, actor, input.slot);
  if (meta.disabledReason) {
    return { status: 'reject', message: meta.disabledReason };
  }

  if (input.slot === 1) {
    const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
    if (!target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }
    const mult = hasEffect(target, 'MARKED') ? 1.25 : 1;
    const damage = dealDamage(
      actor,
      target,
      { damageMult: mult, armorIgnore: 0.15, source: 'ARROWS' },
      state
    );
    if (damage === 0) {
      state.log.push(`${actor.displayName}: лук — промах.`);
    } else {
      state.log.push(
        `${actor.displayName} стреляет в ${target.displayName} ${formatLastLogDamage(damage)}${mult > 1 ? ' (метка)' : ''}.`
      );
      markDeadIfNeeded(state, target);
    }
    return { status: 'done' };
  }

  if (input.slot === 2) {
    const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
    if (!target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }
    for (const enemy of unitsOnSameRow(state, target)) {
      if (hasEffect(enemy, 'SANCTUM')) {
        continue;
      }
      const damage = dealDamage(
        actor,
        enemy,
        { damageMult: 0.5, armorIgnore: 0.1, source: 'ARROWS' },
        state
      );
      if (damage > 0) {
        state.log.push(`${actor.displayName}: подавляющий огонь → ${enemy.displayName} ${formatLastLogDamage(damage)}.`);
        if (randInt(1, 100) <= 60 + actor.lvl) {
          grantEffect(enemy, 'UNLUCKY', 1 + Math.floor(actor.lvl / 5), 20);
          grantEffect(enemy, 'SLOW', 1 + Math.floor(actor.lvl / 5), 15);
        }
        markDeadIfNeeded(state, enemy);
      }
    }
    return { status: 'done' };
  }

  if (input.slot === 3) {
    const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
    if (!target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }
    const lose = Math.max(1, Math.round(actor.damage * 0.3));
    grantEffect(actor, 'WEAKNESS', 2, lose);
    const savedLuck = actor.luck;
    actor.luck = Math.min(80, actor.luck * 2);
    const damage = dealDamage(
      actor,
      target,
      { damageMult: 1.25, armorIgnore: 0.1, source: 'ARROWS' },
      state
    );
    actor.luck = savedLuck;
    if (damage === 0) {
      state.log.push(`${actor.displayName}: мощный выстрел — промах.`);
    } else {
      state.log.push(`${actor.displayName} мощным выстрелом бьёт ${target.displayName} ${formatLastLogDamage(damage)}.`);
      markDeadIfNeeded(state, target);
    }
    return { status: 'done' };
  }

  if (input.slot === 4) {
    actor.ultaCharges -= 1;
    if (actor.row !== ROW_FRONT) {
      moveToOtherRow(actor);
    }
    actor.transformParentCode = 'Marauder';
    const oldName = actor.displayName;
    if (!applyCatalogStats(state, actor, 'Werewolf')) {
      actor.ultaCharges += 1;
      return { status: 'reject', message: 'Нет статов оборотня в каталоге' };
    }
    // Вард от оружия при превращении (порт marauder_werewolf.py: lvl // 7 + 1).
    setWard(actor, 'WEAPON', Math.floor(actor.lvl / 7) + 1);
    actor.initiative = Math.max(1, Math.floor(actor.initiative / 2));
    state.log.push(`${oldName} превращается в оборотня!`);
    return { status: 'done' };
  }

  // slot 5 — урон × morale_boost (чем ниже мораль, тем сильнее)
  const err = trySpendMana(actor, 3);
  if (err) {
    return { status: 'reject', message: err };
  }
  const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
  if (!target) {
    return { status: 'reject', message: 'Цель не найдена' };
  }
  const moraleBoost =
    actor.morale >= 0 ? 1 : 1 + Math.round((Math.abs(actor.morale) / 100) * 10) / 10;
  const burn = Math.max(1, Math.round(actor.power * moraleBoost));
  target.health -= burn;
  state.log.push(
    `${actor.displayName}: тёмное пламя жжёт ${target.displayName} ${formatLogDamage(burn, 'FIRE')} (×${moraleBoost}).`
  );
  if (randInt(1, 100) <= 67) {
    const manaBurn = randInt(3, 4);
    target.mana = Math.max(0, target.mana - manaBurn);
    state.log.push(`${target.displayName} теряет ${manaBurn} МР.`);
  }
  markDeadIfNeeded(state, target);
  return { status: 'done' };
}

function applyWerewolf(
  state: BattleState,
  actor: BattleUnit,
  input: { slot: AbilitySlot; targetId?: string }
): AbilityOutcome {
  const meta = werewolfMeta(state, actor, input.slot);
  if (meta.disabledReason) {
    return { status: 'reject', message: meta.disabledReason };
  }

  if (input.slot === 1) {
    const target = meleeOrAll(state, actor, false).find((unit) => unit.id === input.targetId);
    if (!target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }
    const damage = dealDamage(actor, target, { damageMult: 1.1, armorIgnore: 0 }, state);
    if (damage === 0) {
      state.log.push(`${actor.displayName}: промах.`);
    } else {
      state.log.push(`${actor.displayName} рвёт ${target.displayName} ${formatLastLogDamage(damage)}.`);
      if (randInt(1, 100) <= 71 + actor.lvl * 2) {
        const lose = Math.max(1, Math.round(target.damage * 0.5));
        grantEffect(target, 'WEAKNESS', 2, lose);
      }
      markDeadIfNeeded(state, target);
    }
    return { status: 'done' };
  }

  if (input.slot === 2) {
    const target = enemiesOf(state, actor, { ignoreGuard: true }).find(
      (unit) => unit.id === input.targetId
    );
    if (!target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }
    const damage = dealDamage(actor, target, { damageMult: 1, armorIgnore: 0.35 }, state);
    if (damage === 0) {
      state.log.push(`${actor.displayName}: голод — промах.`);
    } else {
      const vamp = Math.max(
        1,
        Math.round((actor.health / actor.maxHp + 0.2 + actor.lvl * 0.03) * damage)
      );
      const healed = healUnit(actor, vamp);
      addMana(actor, Math.floor(vamp / 5));
      state.log.push(
        `${actor.displayName} кусает ${target.displayName} ${formatLastLogDamage(damage)}, +${healed} ОЗ.`
      );
      markDeadIfNeeded(state, target);
    }
    return { status: 'done' };
  }

  if (input.slot === 3) {
    const parent = actor.transformParentCode ?? 'Marauder';
    if (!applyCatalogStats(state, actor, parent)) {
      return { status: 'reject', message: 'Не удалось вернуть форму' };
    }
    actor.transformParentCode = null;
    const healed = healUnit(actor, 20 + actor.lvl * 5);
    const moraleGain = 10 + actor.lvl;
    actor.morale += moraleGain;
    state.log.push(
      `${actor.displayName} успокаивается (+${healed} ОЗ, мораль +${moraleGain}).`
    );
    return { status: 'done' };
  }

  if (input.slot === 4) {
    const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
    if (!target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }
    // Множитель дота как в боте (1 + lvl * 0.05).
    const power = 1 + actor.lvl * 0.05;
    for (const enemy of enemiesInColumn(state, actor, target)) {
      grantEffect(enemy, 'GALL', 2 + Math.floor(actor.lvl / 5), power);
    }
    state.log.push(`${actor.displayName} обливает колонну желчью.`);
    return { status: 'done' };
  }

  return { status: 'reject', message: 'Используйте защиту / ожидание' };
}

/**
 * Marauder (лук) и Werewolf (transform mid-fight).
 */
export const marauderAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    const meta = actor.heroClassCode === 'Werewolf' ? werewolfMeta : marauderMeta;
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => meta(state, actor, slot));
  },

  apply(state, actor, input): AbilityOutcome {
    if (actor.heroClassCode === 'Werewolf') {
      return applyWerewolf(state, actor, input);
    }
    return applyMarauder(state, actor, input);
  },
};
