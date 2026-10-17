import {
  applyAbility,
  initPilotFlags,
  isPilotClass,
  listAttackTargets,
  listPilotAbilities,
  neighbourBehind,
  runPreChoice,
} from './abilities';
import { maybeKillHorse } from './abilities/knight';
import { resolveAttackStyle } from './attack-style';
import { dealDamage, markDeadIfNeeded, randInt } from './damage';
import { grantEffect, hasEffect, healUnit, tickEffectsOnTurnStart } from './effects';
import { HEALTH_BONUS, MAX_ROUNDS, ROW_FRONT } from './settings';
import {
  classAttackMods,
  classSkill,
  listSkillTargets,
} from './skills';
import type {
  AbilitySlot,
  BattleAction,
  BattleState,
  BattleUnit,
  DraftPickSeed,
  HeroClassStats,
} from './types';

export { listAttackTargets } from './abilities';

/**
 * Классовые пассивы при защите (пилоты 3.8).
 */
function applyDefendPassives(actor: BattleUnit): void {
  switch (actor.heroClassCode) {
    case 'Abbess':
      grantEffect(actor, 'LUCKY', 2, 20);
      break;
    case 'Witch':
      grantEffect(actor, 'FOCUSED', 2, 15);
      actor.mana += 3;
      break;
    case 'Inquisitor':
      grantEffect(actor, 'CONTR', 2, 0);
      break;
    case 'Marauder':
      actor.dodge += 1;
      break;
    default:
      break;
  }
}

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

  const catalog: Record<string, HeroClassStats> = {};
  for (const [code, stats] of input.heroes) {
    catalog[code] = stats;
  }

  const units: BattleUnit[] = [
    ...buildTeamUnits(hostPicks, input.hostPlayerId, 0, input.heroes),
    ...buildTeamUnits(guestPicks, input.guestPlayerId, 1, input.heroes),
  ];

  const state: BattleState = {
    matchId: input.matchId,
    hostPlayerId: input.hostPlayerId,
    guestPlayerId: input.guestPlayerId,
    catalog,
    stage: 1,
    units,
    doneIds: [],
    delayedIds: [],
    activeUnitId: null,
    turnPlayerId: null,
    log: ['Бой начался.'],
    outcome: 'ongoing',
    winnerPlayerId: null,
    pendingPrompt: null,
    preChoiceDoneIds: [],
    graveyard: [],
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
      const unit: BattleUnit = {
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
        mana: hero.mana,
        gold: hero.gold,
        defending: false,
        alive: true,
        effects: [],
        isSummon: false,
        summonerId: null,
        horseIsDead: false,
        authority: 0,
        maxSummons: 0,
        cumRage: 0,
        lichGrade: 0,
        isLichSummon: false,
        ultaCharges: 0,
        darts: 0,
        deathNote: 0,
        deathNoteCd: 0,
        gun: 0,
        forbiddenResurrect: false,
        polymorphSavedArmor: -1,
        transformParentCode: null,
        critBank: 0,
        enslavedOriginTeam: null,
        enslavedOriginPlayerId: null,
      };
      initPilotFlags(unit);
      units.push(unit);
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
  state.pendingPrompt = null;
  let order = initiativeOrder(state);
  if (order.length === 0) {
    if (state.delayedIds.length > 0) {
      const delayedSet = new Set(state.delayedIds);
      state.delayedIds = [];
      state.preChoiceDoneIds = state.preChoiceDoneIds.filter((id) => !delayedSet.has(id));
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
      state.preChoiceDoneIds = [];
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

  const stunned = hasEffect(next, 'STUNNED');
  const tickLog = tickEffectsOnTurnStart(next);
  state.log.push(...tickLog);
  markDeadIfNeeded(state, next);
  if (!next.alive) {
    state.doneIds.push(next.id);
    resolveOutcome(state);
    if (state.outcome === 'ongoing') {
      advanceToNextUnit(state);
    }
    return;
  }

  if (stunned) {
    state.log.push(`${next.displayName} оглушён и пропускает ход.`);
    state.doneIds.push(next.id);
    resolveOutcome(state);
    if (state.outcome === 'ongoing') {
      advanceToNextUnit(state);
    }
    return;
  }

  state.activeUnitId = next.id;
  state.turnPlayerId = next.playerId;

  if (isPilotClass(next.heroClassCode) && !state.preChoiceDoneIds.includes(next.id)) {
    runPreChoice(state, next);
    state.preChoiceDoneIds.push(next.id);
  }
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
    readonly slot?: AbilitySlot;
    readonly choice?: string;
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

  if (state.pendingPrompt) {
    if (state.pendingPrompt.unitId !== actor.id) {
      return { ok: false, message: 'Ожидается другой выбор' };
    }
    if (input.action !== 'ability' || !input.choice) {
      return { ok: false, message: 'Нужно завершить выбор способности' };
    }
    const outcome = applyAbility(state, actor, {
      slot: state.pendingPrompt.slot,
      targetId: input.targetId,
      choice: input.choice,
    });
    return settleAbility(state, actor, outcome);
  }

  if (input.action === 'wait') {
    if (!state.delayedIds.includes(actor.id)) {
      state.delayedIds.push(actor.id);
    }
    state.preChoiceDoneIds = state.preChoiceDoneIds.filter((id) => id !== actor.id);
    state.log.push(`${actor.displayName} ждёт.`);
    advanceToNextUnit(state);
    return { ok: true };
  }

  if (input.action === 'defend') {
    actor.defending = true;
    applyDefendPassives(actor);
    state.doneIds.push(actor.id);
    state.log.push(`${actor.displayName} встаёт в защиту.`);
    advanceToNextUnit(state);
    return { ok: true };
  }

  if (input.action === 'ability') {
    if (!isPilotClass(actor.heroClassCode)) {
      return { ok: false, message: 'У этого героя нет слотов способностей' };
    }
    const slot = input.slot;
    if (!slot || slot < 1 || slot > 5) {
      return { ok: false, message: 'Нужен слот 1–5' };
    }
    const outcome = applyAbility(state, actor, {
      slot,
      targetId: input.targetId,
      choice: input.choice,
    });
    return settleAbility(state, actor, outcome);
  }

  if (input.action === 'skill') {
    if (isPilotClass(actor.heroClassCode)) {
      return { ok: false, message: 'Используйте слоты способностей' };
    }
    return applySkillAction(state, actor, input.targetId);
  }

  // attack — для пилотов = слот 1
  if (isPilotClass(actor.heroClassCode)) {
    const outcome = applyAbility(state, actor, {
      slot: 1,
      targetId: input.targetId,
    });
    return settleAbility(state, actor, outcome);
  }

  const targets = listAttackTargets(state, actor);
  if (targets.length === 0) {
    return { ok: false, message: 'Нет доступных целей для атаки' };
  }
  const target =
    (input.targetId ? targets.find((unit) => unit.id === input.targetId) : undefined) ??
    targets[0];
  if (!target) {
    return { ok: false, message: 'Цель не найдена' };
  }

  resolveAttackWithClassMods(state, actor, target);
  finishUnitTurn(state, actor);
  return { ok: true };
}

function settleAbility(
  state: BattleState,
  actor: BattleUnit,
  outcome: {
    status: string;
    message?: string;
    keepTurn?: boolean;
    extraTurnForUnitId?: string;
  }
): { ok: true } | { ok: false; message: string } {
  if (outcome.status === 'reject') {
    return { ok: false, message: outcome.message ?? 'Способность недоступна' };
  }
  if (outcome.status === 'pending') {
    return { ok: true };
  }
  maybeKillHorse(actor, state);
  if (outcome.extraTurnForUnitId) {
    state.doneIds = state.doneIds.filter((id) => id !== outcome.extraTurnForUnitId);
    state.preChoiceDoneIds = state.preChoiceDoneIds.filter(
      (id) => id !== outcome.extraTurnForUnitId
    );
  }
  if (outcome.keepTurn) {
    resolveOutcome(state);
    return { ok: true };
  }
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
    const base = Math.max(1, Math.round(actor.maxHp * skill.healFraction));
    const healed = healUnit(actor, base);
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
    const base = Math.max(1, Math.round(target.maxHp * skill.healFraction));
    const healed = healUnit(target, base);
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
      const heal = healUnit(actor, Math.max(1, Math.round(damage * mods.lifesteal)));
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
  state.pendingPrompt = null;
  resolveOutcome(state);
  if (state.outcome === 'ongoing') {
    advanceToNextUnit(state);
  }
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
  state.pendingPrompt = null;
}

/**
 * Публичный снимок для API/клиента.
 */
export function toBattleSummary(state: BattleState) {
  const active = state.units.find((unit) => unit.id === state.activeUnitId) ?? null;
  const pilot = active ? isPilotClass(active.heroClassCode) : false;
  const abilities =
    active?.alive && pilot ? listPilotAbilities(state, active) : [];
  const targets =
    active?.alive && !pilot
      ? listAttackTargets(state, active).map((unit) => unit.id)
      : abilities.find((ability) => ability.slot === 1)?.legalTargetIds ?? [];
  const skill = active && !pilot ? classSkill(active.heroClassCode) : null;
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
    log: state.log.slice(-16),
    legalTargetIds: targets,
    skillLabel: skill && skill.kind !== 'none' ? skill.label : null,
    legalSkillTargetIds: skillTargets,
    abilities,
    pendingPrompt: state.pendingPrompt
      ? {
          unitId: state.pendingPrompt.unitId,
          kind: state.pendingPrompt.kind,
          slot: state.pendingPrompt.slot,
          options: state.pendingPrompt.options,
        }
      : null,
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
      effects: unit.effects.map((effect) => ({
        id: effect.id,
        rounds: effect.rounds,
        power: effect.power,
      })),
      isSummon: unit.isSummon,
      horseIsDead: unit.horseIsDead,
      mana: unit.mana,
    })),
  };
}

export type BattleSummary = ReturnType<typeof toBattleSummary>;
