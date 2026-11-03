import { economyOn } from '../../economy';
import { getItem } from '../../items/catalog';
import { addItem, itemCount, removeItem, teamInventory } from '../../items/inventory';
import { dealDamage, formatLastLogDamage, markDeadIfNeeded, randInt } from '../damage';
import { formatLogDamage } from '../damageSources';
import { grantEffect, hasEffect } from '../effects';
import { ROW_BACK, ROW_FRONT } from '../settings';
import type { AbilityInfo, AbilitySlot, BattleState, BattleUnit, PromptOption } from '../types';
import { enemiesOf, meleeOrAll, moveToOtherRow } from './targets';
import type { AbilityHandler, AbilityOutcome } from './types';

const IGNORE_GUARD = { ignoreGuard: true } as const;
const PROMPT_DIVERSION = 'detective_diversion';

/** Под INVISIBLE — как дальник; иначе melee. GUARDED не блокирует (ignoreGuard). */
function rapierTargets(state: BattleState, actor: BattleUnit): BattleUnit[] {
  return meleeOrAll(state, actor, hasEffect(actor, 'INVISIBLE'), IGNORE_GUARD);
}

/** Раунды у ярмарки: s % f ∈ {0, 1, f−1} — кража недоступна. */
export function isStealBlockedByFair(state: BattleState): boolean {
  const f = state.rules.fairFrequency ?? 5;
  if (f <= 0) {
    return false;
  }
  const s = state.stage;
  const mod = ((s % f) + f) % f;
  return mod === 0 || mod === 1 || mod === f - 1;
}

function uniqueEnemyItemCodes(state: BattleState, actor: BattleUnit): number[] {
  const enemyTeam = (1 - actor.team) as 0 | 1;
  const seen = new Set<number>();
  const codes: number[] = [];
  for (const code of teamInventory(state, enemyTeam)) {
    if (seen.has(code)) {
      continue;
    }
    seen.add(code);
    codes.push(code);
  }
  return codes;
}

function diversionOptions(state: BattleState, actor: BattleUnit): PromptOption[] {
  const options: PromptOption[] = [];
  if (!isStealBlockedByFair(state)) {
    for (const code of uniqueEnemyItemCodes(state, actor)) {
      const item = getItem(code);
      options.push({
        id: `steal:${code}`,
        label: `Украсть: ${item?.name ?? String(code)}`,
      });
    }
  }
  options.push({
    id: 'poison',
    label: `Отравить отряд (${actor.ultaCharges})`,
  });
  options.push({ id: 'cancel', label: 'Отмена' });
  return options;
}

function abilityMeta(state: BattleState, actor: BattleUnit, slot: AbilitySlot): AbilityInfo {
  switch (slot) {
    case 1: {
      const targets = rapierTargets(state, actor);
      return {
        slot: 1,
        label: 'Короткая рапира',
        needsTarget: true,
        attackKind: 'melee',
        previewDamageMult: 1.1,
        previewArmorIgnore: 0.25,
        disabledReason: targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 2: {
      if (economyOn(state)) {
        return {
          slot: 2,
          label: 'Диверсия',
          needsTarget: false,
          disabledReason: null,
          legalTargetIds: [],
        };
      }
      const targets = enemiesOf(state, actor, IGNORE_GUARD);
      return {
        slot: 2,
        label: `Диверсия — яд (${actor.ultaCharges})`,
        needsTarget: true,
        disabledReason:
          actor.ultaCharges <= 0 ? 'Нет яда' : targets.length === 0 ? 'Нет врагов' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 3:
      return {
        slot: 3,
        label: `Зелье невидимости (${actor.ultaCharges})`,
        needsTarget: false,
        disabledReason: actor.ultaCharges <= 0 ? 'Нет зелий' : null,
        legalTargetIds: [],
      };
    case 4: {
      const targets = enemiesOf(state, actor, IGNORE_GUARD);
      return {
        slot: 4,
        label: 'Выпад дуэлянта',
        needsTarget: true,
        disabledReason:
          actor.row !== ROW_BACK ? 'Нужен задний ряд' : targets.length === 0 ? 'Нет целей' : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
    case 5: {
      if (actor.gun <= 0) {
        return {
          slot: 5,
          label: 'Перезарядка',
          needsTarget: false,
          disabledReason: actor.row !== ROW_FRONT ? 'Нужен передний ряд' : null,
          legalTargetIds: [],
        };
      }
      const targets = enemiesOf(state, actor, IGNORE_GUARD);
      return {
        slot: 5,
        label: 'Выстрел в упор',
        needsTarget: true,
        disabledReason:
          actor.row !== ROW_FRONT
            ? 'Нужен передний ряд'
            : targets.length === 0
              ? 'Нет целей'
              : null,
        legalTargetIds: targets.map((unit) => unit.id),
      };
    }
  }
}

function resolveDiversion(
  state: BattleState,
  actor: BattleUnit,
  choice: string | undefined
): AbilityOutcome {
  const prompt = state.pendingPrompt;
  if (!prompt || prompt.kind !== PROMPT_DIVERSION || !choice) {
    return { status: 'reject', message: 'Нужен выбор' };
  }
  if (!prompt.options.some((option) => option.id === choice)) {
    return { status: 'reject', message: 'Неверный выбор' };
  }

  if (choice === 'cancel') {
    state.pendingPrompt = null;
    state.log.push(`${actor.displayName} останавливает операцию.`);
    return { status: 'done', keepTurn: true };
  }

  if (choice === 'poison') {
    if (actor.ultaCharges <= 0) {
      return { status: 'reject', message: 'Нет яда' };
    }
    actor.ultaCharges -= 1;
    state.pendingPrompt = null;
    const enemies = enemiesOf(state, actor, IGNORE_GUARD);
    for (const enemy of enemies) {
      grantEffect(enemy, 'POISON', 2, 0.8);
    }
    state.log.push(
      `${actor.displayName} подмешивает яды в напитки вражеского отряда (${enemies.length}).`
    );
    return { status: 'done' };
  }

  if (choice.startsWith('steal:')) {
    if (isStealBlockedByFair(state)) {
      state.pendingPrompt = null;
      return { status: 'reject', message: 'Сейчас небезопасно воровать у ярмарки' };
    }
    const code = Number(choice.slice('steal:'.length));
    if (!Number.isFinite(code)) {
      return { status: 'reject', message: 'Неверный предмет' };
    }
    const enemyTeam = (1 - actor.team) as 0 | 1;
    if (itemCount(state, enemyTeam, code) <= 0) {
      return { status: 'reject', message: 'Предмета уже нет' };
    }
    state.pendingPrompt = null;
    const chance = 60 + actor.lvl * 2;
    const item = getItem(code);
    const name = item?.name ?? String(code);
    if (randInt(1, 100) <= chance) {
      removeItem(state, enemyTeam, code, 1);
      addItem(state, actor.team, code, 1);
      state.log.push(`${actor.displayName} успешно крадёт «${name}»!`);
    } else {
      state.log.push(`${actor.displayName}: попытка кражи «${name}» провалилась.`);
    }
    return { status: 'done' };
  }

  return { status: 'reject', message: 'Неизвестный выбор' };
}

/**
 * Detective: rapier, diversion (steal/poison), invisible, lunge, gun.
 */
export const detectiveAbilities: AbilityHandler = {
  listAbilities(state, actor) {
    return ([1, 2, 3, 4, 5] as AbilitySlot[]).map((slot) => abilityMeta(state, actor, slot));
  },

  apply(state, actor, input): AbilityOutcome {
    if (state.pendingPrompt?.unitId === actor.id && state.pendingPrompt.kind === PROMPT_DIVERSION) {
      return resolveDiversion(state, actor, input.choice);
    }

    const meta = abilityMeta(state, actor, input.slot);
    if (meta.disabledReason) {
      return { status: 'reject', message: meta.disabledReason };
    }

    if (input.slot === 1) {
      const target = rapierTargets(state, actor).find((unit) => unit.id === input.targetId);
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      const savedLuck = actor.luck;
      if (hasEffect(target, 'MARKED')) {
        actor.luck = Math.min(80, actor.luck * 2);
      }
      const damage = dealDamage(
        actor,
        target,
        { kind: 'melee', damageMult: 1.1, armorIgnore: 0.25 },
        state
      );
      actor.luck = savedLuck;
      if (damage === 0) {
        state.log.push(`${actor.displayName}: рапира — промах.`);
      } else {
        state.log.push(
          `${actor.displayName} бьёт рапирой ${target.displayName} ${formatLastLogDamage(damage)}.`
        );
        markDeadIfNeeded(state, target);
      }
      return { status: 'done' };
    }

    if (input.slot === 2) {
      if (economyOn(state)) {
        state.pendingPrompt = {
          unitId: actor.id,
          kind: PROMPT_DIVERSION,
          slot: 2,
          options: diversionOptions(state, actor),
          context: {},
          source: 'ability',
        };
        state.log.push(`${actor.displayName}: диверсия — выберите действие.`);
        return { status: 'pending' };
      }
      const target = enemiesOf(state, actor, IGNORE_GUARD).find(
        (unit) => unit.id === input.targetId
      );
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      actor.ultaCharges -= 1;
      const chance = 50 + actor.lvl;
      const rowEnemies = enemiesOf(state, actor, IGNORE_GUARD).filter(
        (unit) => unit.row === target.row
      );
      let poisoned = 0;
      for (const enemy of rowEnemies) {
        if (randInt(1, 100) <= chance) {
          grantEffect(enemy, 'POISON', 1, 0.8);
          poisoned += 1;
        }
      }
      state.log.push(
        poisoned > 0
          ? `${actor.displayName} отравляет ряд (${poisoned}).`
          : `${actor.displayName}: диверсия — яд не сработал.`
      );
      return { status: 'done' };
    }

    if (input.slot === 3) {
      actor.ultaCharges -= 1;
      grantEffect(actor, 'INVISIBLE', 2, 25);
      state.log.push(`${actor.displayName} становится невидимым.`);
      return { status: 'done' };
    }

    if (input.slot === 4) {
      const target = enemiesOf(state, actor, IGNORE_GUARD).find(
        (unit) => unit.id === input.targetId
      );
      if (!target) {
        return { status: 'reject', message: 'Цель не найдена' };
      }
      moveToOtherRow(actor);
      const damage = dealDamage(
        actor,
        target,
        { kind: 'melee', damageMult: 0.5, armorIgnore: 0.1 },
        state
      );
      if (damage === 0) {
        state.log.push(`${actor.displayName}: выпад — промах.`);
      } else {
        grantEffect(actor, 'CONTR', 2 + Math.floor(actor.lvl / 6), 0);
        state.log.push(
          `${actor.displayName}: выпад дуэлянта → ${target.displayName} ${formatLastLogDamage(damage)}.`
        );
        markDeadIfNeeded(state, target);
      }
      return { status: 'done' };
    }

    // slot 5
    if (actor.gun <= 0) {
      const bonus = randInt(1, 4) + Math.floor(actor.lvl / 4);
      actor.luck += bonus;
      actor.gun = 1;
      state.log.push(`${actor.displayName} перезаряжает оружие (+${bonus} удачи).`);
      return { status: 'done' };
    }

    const target = enemiesOf(state, actor, IGNORE_GUARD).find((unit) => unit.id === input.targetId);
    if (!target) {
      return { status: 'reject', message: 'Цель не найдена' };
    }
    const rowMult = target.row === 1 ? 0.5 : 1;
    const shotgun = Math.max(
      0,
      Math.round((actor.damage * 1.25 - target.armor * 1.5) * rowMult) + randInt(10, 15)
    );
    target.health -= shotgun;
    actor.gun = 0;
    state.log.push(
      `${actor.displayName} стреляет в упор в ${target.displayName} ${formatLogDamage(shotgun, 'WEAPON')}.`
    );
    if (randInt(1, 100) <= 50) {
      moveToOtherRow(actor);
    }
    markDeadIfNeeded(state, target);
    return { status: 'done' };
  },
};
