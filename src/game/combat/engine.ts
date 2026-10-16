import { resolveAttackStyle } from './attack-style';
import { HEALTH_BONUS, MAX_ROUNDS, ROW_FRONT } from './settings';
import {
  classAttackMods,
  classSkill,
  neighbourBehind,
  listSkillTargets,
} from './skills';
import type { BattleAction, BattleState, BattleUnit, DraftPickSeed, HeroClassStats } from './types';

const randInt = (min: number, max: number): number =>
  min + Math.floor(Math.random() * (max - min + 1));

/**
 * Создаёт юнитов команд из draft picks + статов классов.
 */
export function createBattleState(input: {
  readonly matchId: string;
  readonly hostPlayerId: string;
  readonly guestPlayerId: string;
  readonly picks: ReadonlyArray<DraftPickSeed>;
  readonly heroes: ReadonlyMap<string, HeroClassStats>;
}): BattleState {
  const hostPicks = input.picks
    .filter((pick) => pick.playerId === input.hostPlayerId)
    .sort((a, b) => a.pickOrder - b.pickOrder);
  const guestPicks = input.picks
    .filter((pick) => pick.playerId === input.guestPlayerId)
    .sort((a, b) => a.pickOrder - b.pickOrder);

  const units: BattleUnit[] = [
    ...buildTeamUnits(hostPicks, input.hostPlayerId, 0, input.heroes),
    ...buildTeamUnits(guestPicks, input.guestPlayerId, 1, input.heroes),
  ];

  const state: BattleState = {
    matchId: input.matchId,
    hostPlayerId: input.hostPlayerId,
    guestPlayerId: input.guestPlayerId,
    stage: 1,
    units,
    doneIds: [],
    delayedIds: [],
    activeUnitId: null,
    turnPlayerId: null,
    log: ['Бой начался.'],
    outcome: 'ongoing',
    winnerPlayerId: null,
  };
  advanceToNextUnit(state);
  return state;
}

function buildTeamUnits(
  picks: ReadonlyArray<DraftPickSeed>,
  playerId: string,
  team: 0 | 1,
  heroes: ReadonlyMap<string, HeroClassStats>
): BattleUnit[] {
  const byRow = new Map<number, DraftPickSeed[]>();
  for (const pick of picks) {
    const list = byRow.get(pick.row) ?? [];
    list.push(pick);
    byRow.set(pick.row, list);
  }
  const units: BattleUnit[] = [];
  for (const [row, rowPicks] of byRow) {
    rowPicks.forEach((pick, column) => {
      const hero = heroes.get(pick.heroClassCode);
      if (!hero) {
        return;
      }
      const maxHp = Math.max(1, Math.round(hero.health * HEALTH_BONUS));
      units.push({
        id: pick.id,
        playerId,
        team,
        heroClassCode: hero.code,
        displayName: hero.displayName,
        row,
        column,
        maxHp,
        health: maxHp,
        damage: hero.damage,
        armor: hero.armor,
        initiative: hero.initiative,
        dodge: hero.dodge,
        luck: hero.luck,
        accuracy: hero.accuracy,
        attackStyle: resolveAttackStyle(hero.code),
        power: hero.power,
        defending: false,
        alive: true,
      });
    });
  }
  return units;
}

/**
 * Живые юниты, ещё не ходившие (и не ждущие), с фиксированным броском инициативы.
 */
export function initiativeOrder(state: BattleState): BattleUnit[] {
  const delayed = new Set(state.delayedIds);
  const done = new Set(state.doneIds);
  return state.units
    .filter((unit) => unit.alive && !done.has(unit.id) && !delayed.has(unit.id))
    .map((unit) => ({ unit, roll: unit.initiative + randInt(1, 5) }))
    .sort((a, b) => b.roll - a.roll)
    .map((entry) => entry.unit);
}

/**
 * Переходит к следующему юниту / раунду.
 */
export function advanceToNextUnit(state: BattleState): void {
  let order = initiativeOrder(state);
  if (order.length === 0) {
    // Раунд закончен — delayed получают ход, затем новый раунд.
    if (state.delayedIds.length > 0) {
      const delayedSet = new Set(state.delayedIds);
      state.delayedIds = [];
      order = state.units
        .filter((unit) => unit.alive && delayedSet.has(unit.id) && !state.doneIds.includes(unit.id))
        .map((unit) => ({ unit, roll: unit.initiative + randInt(1, 5) }))
        .sort((a, b) => b.roll - a.roll)
        .map((entry) => entry.unit);
    }
    if (order.length === 0) {
      state.stage += 1;
      state.doneIds = [];
      state.delayedIds = [];
      for (const unit of state.units) {
        unit.defending = false;
      }
      if (state.stage > MAX_ROUNDS) {
        state.outcome = 'draw';
        state.winnerPlayerId = null;
        state.activeUnitId = null;
        state.turnPlayerId = null;
        state.log.push(`Лимит раундов (${MAX_ROUNDS}) — ничья.`);
        return;
      }
      state.log.push(`Раунд ${state.stage}.`);
      order = initiativeOrder(state);
    }
  }

  const next = order[0];
  if (!next) {
    state.activeUnitId = null;
    state.turnPlayerId = null;
    return;
  }
  state.activeUnitId = next.id;
  state.turnPlayerId = next.playerId;
}

/**
 * Доступные цели для атаки.
 */
export function listAttackTargets(state: BattleState, attacker: BattleUnit): BattleUnit[] {
  const enemies = state.units.filter((unit) => unit.alive && unit.team !== attacker.team);
  if (attacker.attackStyle !== 'melee') {
    return enemies;
  }
  const enemyFront = enemies.filter((unit) => unit.row === ROW_FRONT);
  const ownFrontAlive = state.units.some(
    (unit) => unit.alive && unit.team === attacker.team && unit.row === ROW_FRONT
  );
  if (attacker.row === 1 && ownFrontAlive) {
    return [];
  }
  if (enemyFront.length > 0) {
    return enemyFront;
  }
  return enemies;
}

/**
 * Применяет действие активного юнита.
 */
export function applyAction(
  state: BattleState,
  input: {
    readonly playerId: string;
    readonly unitId: string;
    readonly action: BattleAction;
    readonly targetId?: string;
  }
): { ok: true } | { ok: false; message: string } {
  if (state.outcome !== 'ongoing') {
    return { ok: false, message: 'Бой уже завершён' };
  }
  if (state.activeUnitId !== input.unitId || state.turnPlayerId !== input.playerId) {
    return { ok: false, message: 'Сейчас не ход этого юнита' };
  }
  const actor = state.units.find((unit) => unit.id === input.unitId);
  if (!actor || !actor.alive) {
    return { ok: false, message: 'Юнит недоступен' };
  }

  if (input.action === 'wait') {
    if (!state.delayedIds.includes(actor.id)) {
      state.delayedIds.push(actor.id);
    }
    state.log.push(`${actor.displayName} ждёт.`);
    advanceToNextUnit(state);
    return { ok: true };
  }

  if (input.action === 'defend') {
    actor.defending = true;
    state.doneIds.push(actor.id);
    state.log.push(`${actor.displayName} встаёт в защиту.`);
    advanceToNextUnit(state);
    return { ok: true };
  }

  if (input.action === 'skill') {
    return applySkillAction(state, actor, input.targetId);
  }

  // attack
  const targets = listAttackTargets(state, actor);
  if (targets.length === 0) {
    return { ok: false, message: 'Нет доступных целей для атаки' };
  }
  const target =
    (input.targetId ? targets.find((unit) => unit.id === input.targetId) : undefined) ?? targets[0];
  if (!target) {
    return { ok: false, message: 'Цель не найдена' };
  }

  resolveAttackWithClassMods(state, actor, target);
  finishUnitTurn(state, actor);
  return { ok: true };
}

function applySkillAction(
  state: BattleState,
  actor: BattleUnit,
  targetId: string | undefined
): { ok: true } | { ok: false; message: string } {
  const skill = classSkill(actor.heroClassCode);
  if (skill.kind === 'none') {
    return { ok: false, message: 'У этого героя нет особого навыка' };
  }

  if (skill.kind === 'heal_self') {
    const healed = Math.max(1, Math.round(actor.maxHp * skill.healFraction));
    actor.health = Math.min(actor.maxHp, actor.health + healed);
    if (actor.heroClassCode === 'GoldGolem') {
      actor.defending = true;
    }
    state.log.push(`${actor.displayName}: ${skill.label} (+${healed} ОЗ).`);
    finishUnitTurn(state, actor);
    return { ok: true };
  }

  if (skill.kind === 'cleave') {
    const enemies = state.units.filter((unit) => unit.alive && unit.team !== actor.team);
    if (enemies.length === 0) {
      return { ok: false, message: 'Нет целей' };
    }
    for (const enemy of enemies) {
      const damage = dealDamage(actor, enemy, { damageMult: skill.damageMult, armorIgnore: 0.2 });
      if (damage > 0) {
        state.log.push(`${actor.displayName}: ${skill.label} → ${enemy.displayName} (${damage}).`);
      }
      markDeadIfNeeded(state, enemy);
    }
    finishUnitTurn(state, actor);
    return { ok: true };
  }

  const targets = listSkillTargets(state, actor);
  if (skill.needsTarget && targets.length === 0) {
    return { ok: false, message: 'Нет доступных целей для навыка' };
  }
  const target =
    (targetId ? targets.find((unit) => unit.id === targetId) : undefined) ?? targets[0];
  if (!target) {
    return { ok: false, message: 'Цель навыка не найдена' };
  }

  if (skill.kind === 'heal_ally') {
    const healed = Math.max(1, Math.round(target.maxHp * skill.healFraction));
    target.health = Math.min(target.maxHp, target.health + healed);
    state.log.push(
      `${actor.displayName}: ${skill.label} → ${target.displayName} (+${healed} ОЗ).`
    );
    finishUnitTurn(state, actor);
    return { ok: true };
  }

  const damage = dealDamage(actor, target, {
    damageMult: skill.damageMult * classAttackMods(actor.heroClassCode).damageMult,
    armorIgnore: skill.kind === 'mark_strike' ? 0.3 : 0,
  });
  if (damage === 0) {
    state.log.push(`${actor.displayName}: ${skill.label} — промах по ${target.displayName}.`);
  } else {
    state.log.push(
      `${actor.displayName}: ${skill.label} → ${target.displayName} на ${damage}. Осталось ${Math.max(0, target.health)} ОЗ.`
    );
  }
  markDeadIfNeeded(state, target);
  finishUnitTurn(state, actor);
  return { ok: true };
}

function resolveAttackWithClassMods(
  state: BattleState,
  actor: BattleUnit,
  target: BattleUnit
): void {
  const mods = classAttackMods(actor.heroClassCode);
  const damage = dealDamage(actor, target, {
    damageMult: mods.damageMult,
    armorIgnore: mods.armorIgnore,
  });
  if (damage === 0) {
    state.log.push(`${actor.displayName} промахнулся по ${target.displayName}.`);
  } else {
    state.log.push(
      `${actor.displayName} бьёт ${target.displayName} на ${damage}. Осталось ${Math.max(0, target.health)} ОЗ.`
    );
    if (mods.lifesteal > 0) {
      const heal = Math.max(1, Math.round(damage * mods.lifesteal));
      actor.health = Math.min(actor.maxHp, actor.health + heal);
      state.log.push(`${actor.displayName} восстанавливает ${heal} ОЗ.`);
    }
  }
  markDeadIfNeeded(state, target);

  if (target.alive && mods.doubleStrikeChance > 0 && Math.random() < mods.doubleStrikeChance) {
    const second = dealDamage(actor, target, {
      damageMult: mods.damageMult * 0.7,
      armorIgnore: mods.armorIgnore,
    });
    if (second > 0) {
      state.log.push(`${actor.displayName} наносит повторный удар на ${second}.`);
      markDeadIfNeeded(state, target);
    }
  }

  if (mods.splashChance > 0 && Math.random() < mods.splashChance) {
    const behind = neighbourBehind(state, target);
    if (behind) {
      const splash = dealDamage(actor, behind, {
        damageMult: mods.damageMult * mods.splashMult,
        armorIgnore: 0,
      });
      if (splash > 0) {
        state.log.push(
          `Атака задевает ${behind.displayName} на ${splash}. Осталось ${Math.max(0, behind.health)} ОЗ.`
        );
        markDeadIfNeeded(state, behind);
      }
    }
  }

  if (mods.cleaveFront) {
    const extras = state.units.filter(
      (unit) =>
        unit.alive &&
        unit.team !== actor.team &&
        unit.row === ROW_FRONT &&
        unit.id !== target.id
    );
    for (const enemy of extras) {
      const cleave = dealDamage(actor, enemy, {
        damageMult: mods.damageMult * mods.cleaveMult,
        armorIgnore: 0,
      });
      if (cleave > 0) {
        state.log.push(`${actor.displayName} задевает ${enemy.displayName} на ${cleave}.`);
        markDeadIfNeeded(state, enemy);
      }
    }
  }
}

function finishUnitTurn(state: BattleState, actor: BattleUnit): void {
  state.doneIds.push(actor.id);
  resolveOutcome(state);
  if (state.outcome === 'ongoing') {
    advanceToNextUnit(state);
  }
}

function markDeadIfNeeded(state: BattleState, unit: BattleUnit): void {
  if (unit.health <= 0) {
    unit.alive = false;
    unit.health = 0;
    state.log.push(`${unit.displayName} погибает.`);
  }
}

function dealDamage(
  attacker: BattleUnit,
  defender: BattleUnit,
  opts: { readonly damageMult: number; readonly armorIgnore: number }
): number {
  const hitChance = Math.min(95, Math.max(20, attacker.accuracy - defender.dodge / 2));
  if (randInt(1, 100) > hitChance) {
    return 0;
  }
  let armor = defender.armor * (1 - Math.min(1, Math.max(0, opts.armorIgnore)));
  if (defender.defending) {
    armor = Math.round(armor * 1.5);
  }
  let raw: number;
  if (attacker.attackStyle === 'magic') {
    raw = Math.max(1, Math.round(attacker.power * 0.8 + randInt(-3, 3) - armor * 0.15));
  } else if (attacker.attackStyle === 'ranged') {
    raw = Math.max(1, Math.round(attacker.damage - armor * 0.5 + randInt(0, 2)));
  } else {
    raw = Math.max(1, Math.round(attacker.damage - armor + randInt(0, 2)));
  }
  raw = Math.max(1, Math.round(raw * opts.damageMult));
  if (randInt(1, 100) <= Math.min(40, attacker.luck)) {
    raw = Math.round(raw * 1.5);
  }
  defender.health -= raw;
  return raw;
}

/**
 * Проверяет победу / ничью.
 */
export function resolveOutcome(state: BattleState): void {
  const hostAlive = state.units.some((unit) => unit.alive && unit.team === 0);
  const guestAlive = state.units.some((unit) => unit.alive && unit.team === 1);
  if (hostAlive && guestAlive) {
    return;
  }
  if (!hostAlive && !guestAlive) {
    state.outcome = 'draw';
    state.winnerPlayerId = null;
    state.log.push('Обе команды пали — ничья.');
  } else if (hostAlive) {
    state.outcome = 'host_win';
    state.winnerPlayerId = state.hostPlayerId;
    state.log.push('Победа игрока 1.');
  } else {
    state.outcome = 'guest_win';
    state.winnerPlayerId = state.guestPlayerId;
    state.log.push('Победа игрока 2.');
  }
  state.activeUnitId = null;
  state.turnPlayerId = null;
}

/**
 * Публичный снимок для API/клиента.
 */
export function toBattleSummary(state: BattleState) {
  const active = state.units.find((unit) => unit.id === state.activeUnitId) ?? null;
  const targets = active?.alive ? listAttackTargets(state, active).map((unit) => unit.id) : [];
  const skill = active ? classSkill(active.heroClassCode) : null;
  const skillTargets =
    active?.alive && skill && skill.kind !== 'none'
      ? listSkillTargets(state, active).map((unit) => unit.id)
      : [];
  return {
    stage: state.stage,
    activeUnitId: state.activeUnitId,
    turnPlayerId: state.turnPlayerId,
    outcome: state.outcome,
    winnerPlayerId: state.winnerPlayerId,
    log: state.log.slice(-12),
    legalTargetIds: targets,
    skillLabel: skill && skill.kind !== 'none' ? skill.label : null,
    legalSkillTargetIds: skillTargets,
    units: state.units.map((unit) => ({
      id: unit.id,
      playerId: unit.playerId,
      team: unit.team,
      heroClassCode: unit.heroClassCode,
      displayName: unit.displayName,
      row: unit.row,
      column: unit.column,
      health: unit.health,
      maxHp: unit.maxHp,
      alive: unit.alive,
      defending: unit.defending,
      attackStyle: unit.attackStyle,
    })),
  };
}

export type BattleSummary = ReturnType<typeof toBattleSummary>;
