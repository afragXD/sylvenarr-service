import { resolveAttackStyle } from '../attack-style';
import { dealDamage, markDeadIfNeeded, PILOT_LVL, randInt } from '../damage';
import { grantEffect, hasEffect, healUnit, trySpendMana } from '../effects';
import { HEALTH_BONUS, ROW_BACK, ROW_FRONT } from '../settings';
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
      const targets = meleeOrAll(state, actor, true);
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

function applyCatalogStats(state: BattleState, unit: BattleUnit, code: string): boolean {
  const hero = state.catalog[code];
  if (!hero) {
    return false;
  }
  const ratio = unit.maxHp > 0 ? unit.health / unit.maxHp : 1;
  const maxHp = Math.max(1, Math.round(hero.health * HEALTH_BONUS));
  unit.heroClassCode = hero.code;
  unit.displayName = hero.displayName;
  unit.maxHp = maxHp;
  unit.health = Math.max(1, Math.min(maxHp, Math.round(maxHp * ratio)));
  unit.damage = hero.damage;
  unit.armor = hero.armor;
  unit.initiative = hero.initiative;
  unit.dodge = hero.dodge;
  unit.luck = hero.luck;
  unit.accuracy = hero.accuracy;
  unit.power = hero.power;
  unit.mana = Math.max(unit.mana, hero.mana);
  unit.attackStyle = resolveAttackStyle(hero.code);
  return true;
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
    const damage = dealDamage(actor, target, { damageMult: mult, armorIgnore: 0.15 }, state);
    if (damage === 0) {
      state.log.push(`${actor.displayName}: лук — промах.`);
    } else {
      state.log.push(
        `${actor.displayName} стреляет в ${target.displayName} (${damage}${mult > 1 ? ', метка' : ''}).`
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
      const damage = dealDamage(actor, enemy, { damageMult: 0.5, armorIgnore: 0.1 }, state);
      if (damage > 0) {
        state.log.push(`${actor.displayName}: подавляющий огонь → ${enemy.displayName} (${damage}).`);
        if (randInt(1, 100) <= 60 + PILOT_LVL) {
          grantEffect(enemy, 'UNLUCKY', 1 + Math.floor(PILOT_LVL / 5), 20);
          grantEffect(enemy, 'SLOW', 1 + Math.floor(PILOT_LVL / 5), 15);
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
    const damage = dealDamage(actor, target, { damageMult: 1.25, armorIgnore: 0.1 }, state);
    actor.luck = savedLuck;
    if (damage === 0) {
      state.log.push(`${actor.displayName}: мощный выстрел — промах.`);
    } else {
      state.log.push(`${actor.displayName} мощным выстрелом бьёт ${target.displayName} (${damage}).`);
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
    if (!applyCatalogStats(state, actor, 'Werewolf')) {
      actor.ultaCharges += 1;
      return { status: 'reject', message: 'Нет статов оборотня в каталоге' };
    }
    actor.initiative = Math.max(1, Math.floor(actor.initiative / 2));
    state.log.push(`${actor.displayName} превращается в оборотня!`);
    return { status: 'done' };
  }

  // slot 5
  const err = trySpendMana(actor, 3);
  if (err) {
    return { status: 'reject', message: err };
  }
  const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
  if (!target) {
    return { status: 'reject', message: 'Цель не найдена' };
  }
  const burn = Math.max(1, Math.round(actor.power * 0.9));
  target.health -= burn;
  state.log.push(
    `${actor.displayName}: тёмное пламя жжёт ${target.displayName} (${burn}).`
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
      state.log.push(`${actor.displayName} рвёт ${target.displayName} (${damage}).`);
      if (randInt(1, 100) <= 71 + PILOT_LVL * 2) {
        const lose = Math.max(1, Math.round(target.damage * 0.5));
        grantEffect(target, 'WEAKNESS', 2, lose);
      }
      markDeadIfNeeded(state, target);
    }
    return { status: 'done' };
  }

  if (input.slot === 2) {
    const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
    if (!target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }
    const damage = dealDamage(actor, target, { damageMult: 1, armorIgnore: 0.35 }, state);
    if (damage === 0) {
      state.log.push(`${actor.displayName}: голод — промах.`);
    } else {
      const vamp = Math.max(
        1,
        Math.round((actor.health / actor.maxHp + 0.2 + PILOT_LVL * 0.03) * damage)
      );
      const healed = healUnit(actor, vamp);
      actor.mana += Math.floor(vamp / 5);
      state.log.push(
        `${actor.displayName} кусает ${target.displayName} (${damage}), +${healed} ОЗ.`
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
    const healed = healUnit(actor, 20 + PILOT_LVL * 5);
    state.log.push(`${actor.displayName} успокаивается (+${healed} ОЗ).`);
    return { status: 'done' };
  }

  if (input.slot === 4) {
    const target = enemiesOf(state, actor).find((unit) => unit.id === input.targetId);
    if (!target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }
    const power = 1 + Math.floor(PILOT_LVL * 0.05) + 2;
    for (const enemy of enemiesInColumn(state, actor, target)) {
      grantEffect(enemy, 'GALL', 2 + Math.floor(PILOT_LVL / 5), power);
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
