import {
  applyClassEconomySetup,
  applyFairBuy,
  applyFairSell,
  applyFairSellAll,
  applyFairStop,
  beginFairPhase,
  computeStartingTeamGold,
  economyOn,
  emptyTeamEconomy,
  summarizeFair,
} from '../economy';
import { summarizeInventory } from '../items/inventory';
import { applyItemAction } from '../items/use';
import { applyPerkPick, applyPerkSkip, perkPhaseFullyResolved } from '../perks/actions';
import { tryBonusMovementKeepTurn, tryLowHpExtraTurn } from '../perks/hooks';
import { beginPerkPhase } from '../perks/offers';
import {
  applyAbility,
  attackTargets,
  defaultWeaponReach,
  initPilotFlags,
  isPilotClass,
  listPilotAbilities,
  neighbourBehind,
  runPreChoice,
} from './abilities';
import { maybeKillHorse } from './abilities/knight';
import { moveToOtherRow } from './abilities/targets';
import { basicAttackKind } from './attack-style';
import {
  dealDamage,
  formatLastLogDamage,
  lastDealDamageResult,
  markDeadIfNeeded,
  randInt,
} from './damage';
import { resistsForClass } from './defaultResists';
import {
  addMana,
  grantEffect,
  hasEffect,
  healUnit,
  tickEffectsOnTurnEnd,
  tickEffectsOnTurnStart,
} from './effects';
import { setEffectState } from './effects/context';
import { levelUpLivingUnits, levelUpUnit } from './level';
import {
  applyIllnessTurnStart,
  applyMasochismRoundStart,
  applyPsycho,
  maybePunishLowMorale,
  maybeRewardHighMorale,
  normalizeUnit,
} from './morale';
import { summarizeResists } from './resists';
import { HEALTH_BONUS, MAX_ROUNDS, MAX_ROW_SIZE, MAX_TEAM_SIZE, ROW_FRONT } from './settings';
import { dropSfx, pushSfx } from './sfx';
import { classAttackMods, classSkill, listSkillTargets } from './skills';
import type {
  AbilitySlot,
  BattleAction,
  BattleRules,
  BattleState,
  BattleUnit,
  DraftPickSeed,
  HeroClassStats,
} from './types';

const DEFAULT_BATTLE_RULES: BattleRules = {
  maxTeamSize: MAX_TEAM_SIZE,
  maxRowSize: MAX_ROW_SIZE,
  maxRounds: MAX_ROUNDS,
  healthBonus: HEALTH_BONUS,
  startingLevel: 1,
  fairEnabled: false,
  fairFrequency: 5,
  shopSize: 8,
  goldBonus: 1,
};

export { meleeTargets } from './abilities';

/**
 * Классовые пассивы при защите (пилоты 3.8).
 */
function applyDefendPassives(actor: BattleUnit): void {
  switch (actor.heroClassCode) {
    case 'Abbess':
      grantEffect(actor, 'LUCKY', 2, 20);
      break;
    case 'Witch':
      grantEffect(actor, 'FOCUSED', 2, 25);
      addMana(actor, 3);
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
  readonly rules?: BattleRules;
}): BattleState {
  const rules = input.rules ?? DEFAULT_BATTLE_RULES;
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
    ...buildTeamUnits(hostPicks, input.hostPlayerId, 0, input.heroes, rules.healthBonus),
    ...buildTeamUnits(guestPicks, input.guestPlayerId, 1, input.heroes, rules.healthBonus),
  ];

  const goldBonus = rules.goldBonus ?? 1;
  const hostGold = computeStartingTeamGold(
    hostPicks.map((pick) => input.heroes.get(pick.heroClassCode)?.gold ?? 0),
    goldBonus
  );
  const guestGold = computeStartingTeamGold(
    guestPicks.map((pick) => input.heroes.get(pick.heroClassCode)?.gold ?? 0),
    goldBonus
  );

  const state: BattleState = {
    matchId: input.matchId,
    hostPlayerId: input.hostPlayerId,
    guestPlayerId: input.guestPlayerId,
    catalog,
    rules,
    teams: [emptyTeamEconomy(hostGold), emptyTeamEconomy(guestGold)],
    stage: 1,
    units,
    doneIds: [],
    delayedIds: [],
    delayedPhase: false,
    activeUnitId: null,
    turnPlayerId: null,
    log: ['Бой начался.'],
    outcome: 'ongoing',
    winnerPlayerId: null,
    pendingPrompt: null,
    drawOfferByPlayerId: null,
    preChoiceDoneIds: [],
    graveyard: [],
    phase: 'combat',
    perkOffers: null,
    fair: null,
  };

  applyClassEconomySetup(state);

  const startLvls = Math.max(1, Math.min(30, Math.round(rules.startingLevel))) - 1;
  if (startLvls > 0) {
    for (const unit of state.units) {
      levelUpUnit(unit, startLvls, state);
      unit.health = unit.maxHp;
    }
    state.log.push(`Стартовый уровень: ${startLvls + 1}.`);
  }

  setEffectState(state);
  // Старт: перки (ярмарка только на стыке раундов) → раунд.
  if (!beginPerkPhase(state)) {
    advanceToNextUnit(state);
  }
  return state;
}

function buildTeamUnits(
  picks: ReadonlyArray<DraftPickSeed>,
  playerId: string,
  team: 0 | 1,
  heroes: ReadonlyMap<string, HeroClassStats>,
  healthBonus: number
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
      const maxHp = Math.max(1, Math.round(hero.health * healthBonus));
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
        power: hero.power,
        mana: hero.mana,
        maxMana: hero.maxMana ?? hero.mana,
        wasEffected: false,
        lvl: 1,
        hiddenLvl: 1,
        defending: false,
        alive: true,
        effects: [],
        resists: resistsForClass(hero.code),
        isSummon: false,
        summonerId: null,
        horseIsDead: false,
        authority: 0,
        maxSummons: 0,
        cumRage: 0,
        lichGrade: 0,
        isLichSummon: false,
        ultaCharges: 0,
        soulShatterCasts: 0,
        soulShatterCd: 0,
        momentPowerCd: 0,
        darts: 0,
        deathNote: 0,
        deathNoteCd: 0,
        mindCloudCd: 0,
        ectoplasmCd: 0,
        tortureLightningCd: 0,
        telekinesisCd: 0,
        crystalCharmsCd: 0,
        gun: 0,
        impPolymorphCd: 0,
        degradationCd: 0,
        darkRitualCd: 0,
        darkVeilCd: 0,
        forbiddenResurrect: false,
        polymorphSavedArmor: -1,
        transformParentCode: null,
        critBank: 0,
        armorPenetration: 0,
        dodgeBank: 0,
        enslavedOriginTeam: null,
        enslavedOriginPlayerId: null,
        morale: hero.morale ?? 0,
        lives: 0,
        illness: false,
        illnessKind: null,
        weaponReach: defaultWeaponReach(hero.code),
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
  setEffectState(state);
  state.pendingPrompt = null;
  state.delayedPhase = state.delayedPhase ?? false;
  let order = initiativeOrder(state);
  if (order.length === 0) {
    if (state.delayedIds.length > 0) {
      const delayedSet = new Set(state.delayedIds);
      state.delayedIds = [];
      state.delayedPhase = true;
      // Не чистим preChoiceDoneIds: иначе КД/preChoice тикнут повторно после wait.
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
      state.delayedPhase = false;
      state.preChoiceDoneIds = [];
      for (const unit of state.units) {
        // defending снимается reverseEffect(DEFEND), не принудительно на стыке раундов.
        unit.wasEffected = false;
      }
      if (state.stage > state.rules.maxRounds) {
        state.outcome = 'draw';
        state.winnerPlayerId = null;
        state.activeUnitId = null;
        state.turnPlayerId = null;
        state.log.push(`Лимит раундов (${state.rules.maxRounds}) — ничья.`);
        return;
      }
      // Классовые level-up могут писать в лог (лечение и т.п.) — переносим
      // эти строки после объявления раунда и усиления отряда.
      const levelLogAt = state.log.length;
      const maxLvl = levelUpLivingUnits(state);
      const levelUpLogs = state.log.splice(levelLogAt);
      state.log.push(`Раунд ${state.stage}.`);
      if (maxLvl > 0) {
        state.log.push(`Отряд становится сильнее (ур. ${maxLvl}).`);
      }
      state.log.push(...levelUpLogs);
      applyMasochismRoundStart(state);
      // Уровни → ярмарка → перки → раунд.
      if (beginFairPhase(state)) {
        return;
      }
      if (beginPerkPhase(state)) {
        return;
      }
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
  if (next.alive) {
    applyPsycho(state, next);
  }
  if (next.alive) {
    applyIllnessTurnStart(state, next);
  }
  if (next.alive) {
    normalizeUnit(next, state);
  }
  if (!next.alive) {
    state.doneIds.push(next.id);
    resolveOutcome(state);
    if (state.outcome === 'ongoing') {
      advanceToNextUnit(state);
    }
    return;
  }

  if (stunned) {
    state.log.push(`${next.displayName} оглушён и пропускает ход. (авто)`);
    endTurnTick(state, next);
    state.doneIds.push(next.id);
    resolveOutcome(state);
    if (state.outcome === 'ongoing') {
      advanceToNextUnit(state);
    }
    return;
  }

  state.activeUnitId = next.id;
  state.turnPlayerId = next.playerId;
  state.log.push(`—— ХОД: ${next.displayName} ——`);

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
    readonly itemCode?: number;
    readonly perkId?: string;
  }
): { ok: true } | { ok: false; message: string } {
  setEffectState(state);
  if (state.outcome !== 'ongoing') {
    return { ok: false, message: 'Бой уже завершён' };
  }

  if (state.phase === 'perks') {
    if (input.action === 'perk_pick') {
      if (!input.perkId) {
        return { ok: false, message: 'Нужен perkId' };
      }
      const picked = applyPerkPick(state, {
        playerId: input.playerId,
        unitId: input.unitId,
        perkId: input.perkId,
      });
      if (!picked.ok) {
        return picked;
      }
      if (perkPhaseFullyResolved(state)) {
        finishPerkPhase(state);
      }
      return { ok: true };
    }
    if (input.action === 'perk_skip') {
      const skipped = applyPerkSkip(state, {
        playerId: input.playerId,
        unitId: input.unitId,
      });
      if (!skipped.ok) {
        return skipped;
      }
      if (perkPhaseFullyResolved(state)) {
        finishPerkPhase(state);
      }
      return { ok: true };
    }
    return { ok: false, message: 'Сейчас выбор перков' };
  }

  if (state.phase === 'fair') {
    if (input.action === 'fair_buy') {
      if (input.itemCode == null) {
        return { ok: false, message: 'Нужен itemCode' };
      }
      const bought = applyFairBuy(state, {
        playerId: input.playerId,
        unitId: input.unitId,
        itemCode: input.itemCode,
      });
      if (!bought.ok) {
        return bought;
      }
      return { ok: true };
    }
    if (input.action === 'fair_sell') {
      if (input.itemCode == null) {
        return { ok: false, message: 'Нужен itemCode' };
      }
      const sold = applyFairSell(state, {
        playerId: input.playerId,
        unitId: input.unitId,
        itemCode: input.itemCode,
      });
      if (!sold.ok) {
        return sold;
      }
      return { ok: true };
    }
    if (input.action === 'fair_sell_all') {
      const soldAll = applyFairSellAll(state, {
        playerId: input.playerId,
        unitId: input.unitId,
      });
      if (!soldAll.ok) {
        return soldAll;
      }
      return { ok: true };
    }
    if (input.action === 'fair_stop') {
      const stopped = applyFairStop(state, {
        playerId: input.playerId,
        unitId: input.unitId,
      });
      if (!stopped.ok) {
        return stopped;
      }
      if (stopped.done) {
        finishFairPhase(state);
      }
      return { ok: true };
    }
    return { ok: false, message: 'Сейчас ярмарка' };
  }

  if (input.action === 'perk_pick' || input.action === 'perk_skip') {
    return { ok: false, message: 'Сейчас не фаза выбора перков' };
  }

  if (
    input.action === 'fair_buy' ||
    input.action === 'fair_sell' ||
    input.action === 'fair_sell_all' ||
    input.action === 'fair_stop'
  ) {
    return { ok: false, message: 'Сейчас не ярмарка' };
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
    const promptSource = state.pendingPrompt.source ?? 'ability';
    if (promptSource === 'item') {
      if (input.action !== 'item' || !input.choice) {
        return { ok: false, message: 'Нужно завершить выбор предмета' };
      }
      const itemCode = state.pendingPrompt.itemCode;
      if (itemCode == null) {
        return { ok: false, message: 'Нужно завершить выбор предмета' };
      }
      return settleItem(
        state,
        actor,
        applyItemAction(state, actor, {
          itemCode,
          targetId: input.targetId,
          choice: input.choice,
          continuingPrompt: true,
        })
      );
    }
    if (input.action !== 'ability' || !input.choice) {
      return { ok: false, message: 'Нужно завершить выбор способности' };
    }
    const promptSlot = state.pendingPrompt.slot;
    if (!promptSlot) {
      return { ok: false, message: 'Нужно завершить выбор способности' };
    }
    const outcome = applyAbility(state, actor, {
      slot: promptSlot,
      targetId: input.targetId,
      choice: input.choice,
    });
    // Звук слота сбрасывается на старте выбора — играем его, когда выбор завершён.
    if (outcome.status === 'done' && !outcome.keepTurn && input.choice !== 'cancel') {
      pushSfx(state, actor, 'ability', promptSlot);
    }
    return settleAbility(state, actor, outcome);
  }

  if (input.action === 'wait') {
    state.delayedPhase = state.delayedPhase ?? false;
    if (state.delayedPhase) {
      endTurnTick(state, actor);
      state.doneIds.push(actor.id);
      // preChoiceDoneIds не трогаем — DoT держит wasEffected, КД не тикает снова.
      state.log.push(`${actor.displayName} ждёт.`);
      resolveOutcome(state);
      if (state.outcome === 'ongoing') {
        advanceToNextUnit(state);
      }
      return { ok: true };
    }
    if (!state.delayedIds.includes(actor.id)) {
      state.delayedIds.push(actor.id);
    }
    endTurnTick(state, actor);
    state.log.push(`${actor.displayName} ждёт.`);
    resolveOutcome(state);
    if (state.outcome === 'ongoing') {
      advanceToNextUnit(state);
    }
    return { ok: true };
  }

  if (input.action === 'defend') {
    // Порт Hero.protection: +50 к резистам на 1 раунд (EFF.DEFEND) + классовые пассивы.
    grantEffect(actor, 'DEFEND', 1, 0);
    applyDefendPassives(actor);
    endTurnTick(state, actor);
    state.doneIds.push(actor.id);
    state.log.push(`${actor.displayName} встаёт в защитную стойку.`);
    resolveOutcome(state);
    if (state.outcome === 'ongoing') {
      advanceToNextUnit(state);
    }
    return { ok: true };
  }

  if (input.action === 'move') {
    if (hasEffect(actor, 'CHAINED')) {
      return { ok: false, message: 'Обездвижен — нельзя сменить ряд' };
    }
    const targetRow = actor.row === ROW_FRONT ? 1 : 0;
    const rowCount = state.units.filter(
      (unit) => unit.alive && unit.team === actor.team && unit.row === targetRow
    ).length;
    if (rowCount >= state.rules.maxRowSize) {
      return { ok: false, message: 'На целевом ряду нет места' };
    }
    moveToOtherRow(actor);
    state.log.push(
      `${actor.displayName} переходит на ${targetRow === ROW_FRONT ? 'передний' : 'задний'} ряд.`
    );
    if (tryBonusMovementKeepTurn(state, actor)) {
      resolveOutcome(state);
      return { ok: true };
    }
    finishUnitTurn(state, actor);
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
    let capsLogAt: number | null = null;
    if (!state.pendingPrompt) {
      const label =
        listPilotAbilities(state, actor).find((ability) => ability.slot === slot)?.label ??
        `Слот ${slot}`;
      capsLogAt = state.log.length;
      state.log.push(label.toLocaleUpperCase('ru-RU'));
    }
    const sfxSeq = pushSfx(state, actor, 'ability', slot);
    const outcome = applyAbility(state, actor, {
      slot,
      targetId: input.targetId,
      choice: input.choice,
    });
    if (outcome.status === 'reject' && capsLogAt !== null) {
      state.log.splice(capsLogAt, 1);
    }
    if (outcome.status === 'reject' || outcome.status === 'pending') {
      dropSfx(state, sfxSeq);
    }
    return settleAbility(state, actor, outcome);
  }

  if (input.action === 'skill') {
    if (isPilotClass(actor.heroClassCode)) {
      return { ok: false, message: 'Используйте слоты способностей' };
    }
    return applySkillAction(state, actor, input.targetId);
  }

  if (input.action === 'item') {
    const itemCode = input.itemCode;
    if (itemCode == null) {
      return { ok: false, message: 'Нужен код предмета' };
    }
    return settleItem(
      state,
      actor,
      applyItemAction(state, actor, {
        itemCode,
        targetId: input.targetId,
        choice: input.choice,
      })
    );
  }

  // attack — для пилотов = слот 1
  if (isPilotClass(actor.heroClassCode)) {
    const label =
      listPilotAbilities(state, actor).find((ability) => ability.slot === 1)?.label ?? 'Слот 1';
    const capsLogAt = state.log.length;
    state.log.push(label.toLocaleUpperCase('ru-RU'));
    const sfxSeq = pushSfx(state, actor, 'ability', 1);
    const outcome = applyAbility(state, actor, {
      slot: 1,
      targetId: input.targetId,
    });
    if (outcome.status === 'reject') {
      state.log.splice(capsLogAt, 1);
    }
    if (outcome.status === 'reject' || outcome.status === 'pending') {
      dropSfx(state, sfxSeq);
    }
    return settleAbility(state, actor, outcome);
  }

  const targets = attackTargets(state, actor, basicAttackKind(actor.heroClassCode));
  if (targets.length === 0) {
    return { ok: false, message: 'Нет доступных целей для атаки' };
  }
  const target =
    (input.targetId ? targets.find((unit) => unit.id === input.targetId) : undefined) ?? targets[0];
  if (!target) {
    return { ok: false, message: 'Цель не найдена' };
  }

  state.log.push('АТАКА');
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
  // Самоурон в свой ход (волшебные оковы и т.п.) — сразу помечаем смерть.
  markDeadIfNeeded(state, actor);
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

function settleItem(
  state: BattleState,
  actor: BattleUnit,
  result: ReturnType<typeof applyItemAction>
): { ok: true } | { ok: false; message: string } {
  if (!result.ok) {
    return { ok: false, message: result.message };
  }
  if (result.pending) {
    return { ok: true };
  }
  markDeadIfNeeded(state, actor);
  if (result.keepTurn) {
    state.pendingPrompt = null;
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
    state.log.push(skill.label.toLocaleUpperCase('ru-RU'));
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
    state.log.push(skill.label.toLocaleUpperCase('ru-RU'));
    for (const enemy of enemies) {
      const damage = dealDamage(
        actor,
        enemy,
        {
          kind: basicAttackKind(actor.heroClassCode),
          damageMult: skill.damageMult,
          armorIgnore: 0.2,
        },
        state
      );
      if (damage > 0) {
        state.log.push(
          `${actor.displayName}: ${skill.label} → ${enemy.displayName} ${formatLastLogDamage(damage)}.`
        );
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

  state.log.push(skill.label.toLocaleUpperCase('ru-RU'));

  if (skill.kind === 'heal_ally') {
    const base = Math.max(1, Math.round(target.maxHp * skill.healFraction));
    const healed = healUnit(target, base);
    state.log.push(`${actor.displayName}: ${skill.label} → ${target.displayName} (+${healed} ОЗ).`);
    finishUnitTurn(state, actor);
    return { ok: true };
  }

  const damage = dealDamage(
    actor,
    target,
    {
      kind: basicAttackKind(actor.heroClassCode),
      damageMult: skill.damageMult * classAttackMods(actor.heroClassCode).damageMult,
      armorIgnore: skill.kind === 'mark_strike' ? 0.3 : 0,
    },
    state
  );
  if (lastDealDamageResult().missed) {
    state.log.push(`${actor.displayName}: ${skill.label} — промах по ${target.displayName}.`);
  } else if (damage > 0) {
    state.log.push(
      `${actor.displayName}: ${skill.label} → ${target.displayName} ${formatLastLogDamage(damage)}. Осталось ${Math.max(0, target.health)} ОЗ.`
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
  const kind = basicAttackKind(actor.heroClassCode);
  const damage = dealDamage(
    actor,
    target,
    {
      kind,
      damageMult: mods.damageMult,
      armorIgnore: mods.armorIgnore,
    },
    state
  );
  if (lastDealDamageResult().missed) {
    state.log.push(`${actor.displayName} промахнулся по ${target.displayName}.`);
  } else if (damage > 0) {
    state.log.push(
      `${actor.displayName} бьёт ${target.displayName} ${formatLastLogDamage(damage)}. Осталось ${Math.max(0, target.health)} ОЗ.`
    );
    if (mods.lifesteal > 0) {
      const heal = healUnit(actor, Math.max(1, Math.round(damage * mods.lifesteal)));
      state.log.push(`${actor.displayName} восстанавливает ${heal} ОЗ.`);
    }
  }
  markDeadIfNeeded(state, target);

  if (target.alive && mods.doubleStrikeChance > 0 && Math.random() < mods.doubleStrikeChance) {
    const second = dealDamage(
      actor,
      target,
      {
        kind,
        damageMult: mods.damageMult * 0.7,
        armorIgnore: mods.armorIgnore,
      },
      state
    );
    if (second > 0) {
      state.log.push(`${actor.displayName} наносит повторный удар ${formatLastLogDamage(second)}.`);
      markDeadIfNeeded(state, target);
    }
  }

  if (mods.splashChance > 0 && Math.random() < mods.splashChance) {
    const behind = neighbourBehind(state, target);
    if (behind) {
      const splash = dealDamage(
        actor,
        behind,
        {
          kind,
          damageMult: mods.damageMult * mods.splashMult,
          armorIgnore: 0,
        },
        state
      );
      if (splash > 0) {
        state.log.push(
          `Атака задевает ${behind.displayName} ${formatLastLogDamage(splash)}. Осталось ${Math.max(0, behind.health)} ОЗ.`
        );
        markDeadIfNeeded(state, behind);
      }
    }
  }

  if (mods.cleaveFront) {
    const extras = state.units.filter(
      (unit) =>
        unit.alive && unit.team !== actor.team && unit.row === ROW_FRONT && unit.id !== target.id
    );
    for (const enemy of extras) {
      const cleave = dealDamage(
        actor,
        enemy,
        {
          kind,
          damageMult: mods.damageMult * mods.cleaveMult,
          armorIgnore: 0,
        },
        state
      );
      if (cleave > 0) {
        state.log.push(
          `${actor.displayName} задевает ${enemy.displayName} ${formatLastLogDamage(cleave)}.`
        );
        markDeadIfNeeded(state, enemy);
      }
    }
  }
}

function finishPerkPhase(state: BattleState): void {
  state.phase = 'combat';
  state.perkOffers = null;
  state.log.push('Выбор перков завершён.');
  advanceToNextUnit(state);
}

function finishFairPhase(state: BattleState): void {
  state.phase = 'combat';
  state.fair = null;
  state.log.push('Ярмарка завершена');
  if (beginPerkPhase(state)) {
    return;
  }
  advanceToNextUnit(state);
}

function finishUnitTurn(state: BattleState, actor: BattleUnit): void {
  if (actor.alive) {
    endTurnTick(state, actor);
  }
  if (actor.alive) {
    normalizeUnit(actor, state);
    maybeRewardHighMorale(state, actor);
    maybePunishLowMorale(state, actor);
  }
  state.pendingPrompt = null;
  if (actor.alive && tryLowHpExtraTurn(state, actor)) {
    resolveOutcome(state);
    return;
  }
  state.doneIds.push(actor.id);
  resolveOutcome(state);
  if (state.outcome === 'ongoing') {
    advanceToNextUnit(state);
  }
}

/** End-тик эффектов; расплата по истечении (IMMOLATION) может убить носителя. */
function endTurnTick(state: BattleState, unit: BattleUnit): void {
  state.log.push(...tickEffectsOnTurnEnd(unit, state));
  markDeadIfNeeded(state, unit);
}

/**
 * Проверяет победу / ничью.
 * Порабощённые юниты считаются за свою исходную команду (enslavedOriginTeam) —
 * порабощение последнего врага не должно мгновенно завершать бой.
 */
export function resolveOutcome(state: BattleState): void {
  const effectiveTeam = (unit: BattleUnit): 0 | 1 => unit.enslavedOriginTeam ?? unit.team;
  const hostAlive = state.units.some((unit) => unit.alive && effectiveTeam(unit) === 0);
  const guestAlive = state.units.some((unit) => unit.alive && effectiveTeam(unit) === 1);
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
  state.drawOfferByPlayerId = null;
  state.phase = 'combat';
  state.perkOffers = null;
}

/**
 * Принудительная сдача: победа оппонента.
 * AC-6: в лог — «{ник} сдался.»
 */
export function forceSurrender(
  state: BattleState,
  surrenderingPlayerId: string,
  surrenderingDisplayName?: string
): void {
  if (state.outcome !== 'ongoing') {
    return;
  }
  const isHost = surrenderingPlayerId === state.hostPlayerId;
  state.outcome = isHost ? 'guest_win' : 'host_win';
  state.winnerPlayerId = isHost ? state.guestPlayerId : state.hostPlayerId;
  const nick = surrenderingDisplayName?.trim() || 'Игрок';
  state.log.push(`${nick} сдался.`);
  state.activeUnitId = null;
  state.turnPlayerId = null;
  state.pendingPrompt = null;
  state.drawOfferByPlayerId = null;
  state.phase = 'combat';
  state.perkOffers = null;
}

/**
 * Ничья по согласию сторон.
 */
export function forceDraw(state: BattleState): void {
  if (state.outcome !== 'ongoing') {
    return;
  }
  state.outcome = 'draw';
  state.winnerPlayerId = null;
  state.log.push('Ничья по согласию.');
  state.activeUnitId = null;
  state.phase = 'combat';
  state.perkOffers = null;
  state.turnPlayerId = null;
  state.pendingPrompt = null;
  state.drawOfferByPlayerId = null;
}

export type TurnOrderPhase = 'acted' | 'active' | 'waiting' | 'delayed' | 'dead';

/**
 * Шкала раунда для UI: ходившие → активный → ожидающие → delayed.
 * Мёртвые юниты в шкалу не включаются.
 * Порядок waiting — оценка по статическому initiative (факт. ход снова бросает 1d5).
 */
export function buildTurnOrder(state: BattleState) {
  const done = new Set(state.doneIds);
  const delayed = new Set(state.delayedIds);
  const byInit = (a: BattleUnit, b: BattleUnit) =>
    b.initiative - a.initiative || a.id.localeCompare(b.id);

  const active =
    state.activeUnitId != null
      ? (state.units.find((unit) => unit.id === state.activeUnitId) ?? null)
      : null;
  const acted = state.units.filter((unit) => unit.alive && done.has(unit.id)).sort(byInit);
  const waiting = state.units
    .filter(
      (unit) =>
        unit.alive && !done.has(unit.id) && !delayed.has(unit.id) && unit.id !== state.activeUnitId
    )
    .sort(byInit);
  const delayedUnits = state.units
    .filter((unit) => unit.alive && delayed.has(unit.id) && !done.has(unit.id))
    .sort(byInit);

  type Row = { unit: BattleUnit; phase: TurnOrderPhase };
  const sequence: Row[] = [
    ...acted.map((unit) => ({ unit, phase: 'acted' as const })),
    ...(active?.alive ? [{ unit: active, phase: 'active' as const }] : []),
    ...waiting.map((unit) => ({ unit, phase: 'waiting' as const })),
    ...delayedUnits.map((unit) => ({ unit, phase: 'delayed' as const })),
  ];
  const seen = new Set<string>();
  return sequence
    .filter((row) => {
      if (seen.has(row.unit.id)) {
        return false;
      }
      seen.add(row.unit.id);
      return true;
    })
    .map(({ unit, phase }) => ({
      unitId: unit.id,
      displayName: unit.displayName,
      heroClassCode: unit.heroClassCode,
      team: unit.team as 0 | 1,
      alive: unit.alive,
      isActive: unit.id === state.activeUnitId,
      phase,
      lvl: unit.lvl,
    }));
}

/**
 * Публичный снимок для API/клиента.
 */
export function toBattleSummary(state: BattleState) {
  const active = state.units.find((unit) => unit.id === state.activeUnitId) ?? null;
  const pilot = active ? isPilotClass(active.heroClassCode) : false;
  const abilities = active?.alive && pilot ? listPilotAbilities(state, active) : [];
  const targets =
    active?.alive && !pilot
      ? attackTargets(state, active, basicAttackKind(active.heroClassCode)).map((unit) => unit.id)
      : (abilities.find((ability) => ability.slot === 1)?.legalTargetIds ?? []);
  const attackKind = active
    ? pilot
      ? (abilities.find((ability) => ability.slot === 1)?.attackKind ?? null)
      : basicAttackKind(active.heroClassCode)
    : null;
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
    drawOfferByPlayerId: state.drawOfferByPlayerId ?? null,
    log: state.log.slice(-40),
    sfxEvents: (state.sfxEvents ?? []).slice(-20),
    turnOrder: buildTurnOrder(state),
    legalTargetIds: targets,
    attackKind,
    skillLabel: skill && skill.kind !== 'none' ? skill.label : null,
    legalSkillTargetIds: skillTargets,
    abilities,
    pendingPrompt: state.pendingPrompt
      ? {
          unitId: state.pendingPrompt.unitId,
          kind: state.pendingPrompt.kind,
          slot: state.pendingPrompt.slot ?? null,
          options: state.pendingPrompt.options,
          source: state.pendingPrompt.source ?? 'ability',
          itemCode: state.pendingPrompt.itemCode ?? null,
        }
      : null,
    economyEnabled: economyOn(state),
    phase: state.phase ?? 'combat',
    perkOffers: state.perkOffers ?? null,
    fair: summarizeFair(state),
    units: state.units.map((unit) => ({
      id: unit.id,
      playerId: unit.playerId,
      team: unit.team,
      heroClassCode: unit.heroClassCode,
      displayName: unit.displayName,
      row: unit.row,
      column: unit.column,
      health: Math.max(0, unit.health),
      maxHp: unit.maxHp,
      alive: unit.alive,
      defending: unit.defending,
      effects: unit.effects.map((effect) => ({
        id: effect.id,
        rounds: effect.rounds,
        power: effect.power,
      })),
      isSummon: unit.isSummon,
      horseIsDead: unit.horseIsDead,
      mana: unit.mana,
      maxMana: unit.maxMana,
      damage: unit.damage,
      armor: unit.armor,
      initiative: unit.initiative,
      dodge: unit.dodge,
      luck: unit.luck,
      accuracy: unit.accuracy,
      power: unit.power,
      critBank: unit.critBank,
      ultaCharges: unit.ultaCharges,
      lvl: unit.lvl,
      morale: unit.morale,
      resists: summarizeResists(unit),
      perks: unit.perks ?? [],
      merchant: unit.merchant ?? 0,
      weaponReach: unit.weaponReach ?? defaultWeaponReach(unit.heroClassCode),
    })),
    teams: [
      {
        gold: state.teams?.[0]?.gold ?? 0,
        inventory: summarizeInventory(state, 0),
      },
      {
        gold: state.teams?.[1]?.gold ?? 0,
        inventory: summarizeInventory(state, 1),
      },
    ] as [
      { gold: number; inventory: ReturnType<typeof summarizeInventory> },
      { gold: number; inventory: ReturnType<typeof summarizeInventory> },
    ],
  };
}

export type BattleSummary = ReturnType<typeof toBattleSummary>;
