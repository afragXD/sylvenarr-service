import { resolveAttackStyle } from '../attack-style';
import { HEALTH_BONUS, MAX_TEAM_SIZE } from '../settings';
import { resistsForClass } from '../defaultResists';
import { cloneResists } from '../resists';
import type { BattleState, BattleUnit } from '../types';

/**
 * Создаёт саммона на поле с учётом лимитов команды и владельца.
 */
export function createSummon(
  state: BattleState,
  input: {
    readonly summoner: BattleUnit;
    readonly heroCode: string;
    readonly row: number;
    readonly column?: number;
    readonly isLichSummon?: boolean;
    readonly replaceUnitId?: string;
  }
): BattleUnit | null {
  const hero = state.catalog[input.heroCode];
  if (!hero) {
    state.log.push(`Неизвестный класс саммона: ${input.heroCode}.`);
    return null;
  }

  if (input.replaceUnitId) {
    const replaceId = input.replaceUnitId;
    const oldIndex = state.units.findIndex((unit) => unit.id === replaceId);
    if (oldIndex >= 0) {
      // Эволюция: убрать прошлую форму с доски, не оставлять труп.
      state.units.splice(oldIndex, 1);
      state.doneIds = state.doneIds.filter((id) => id !== replaceId);
      state.delayedIds = state.delayedIds.filter((id) => id !== replaceId);
      state.preChoiceDoneIds = state.preChoiceDoneIds.filter((id) => id !== replaceId);
      if (state.activeUnitId === replaceId) {
        state.activeUnitId = null;
      }
    }
  } else {
    const teamAlive = state.units.filter(
      (unit) => unit.alive && unit.team === input.summoner.team
    ).length;
    if (teamAlive >= MAX_TEAM_SIZE) {
      state.log.push('В команде нет места для саммона.');
      return null;
    }
    const owned = state.units.filter(
      (unit) => unit.alive && unit.isSummon && unit.summonerId === input.summoner.id
    ).length;
    if (owned >= input.summoner.maxSummons) {
      state.log.push('Достигнут лимит саммонов.');
      return null;
    }
  }

  const row = input.row === 1 ? 1 : 0;
  const column =
    input.column ??
    state.units.filter((unit) => unit.alive && unit.team === input.summoner.team && unit.row === row)
      .length;
  const maxHp = Math.max(1, Math.round(hero.health * HEALTH_BONUS));
  const unit: BattleUnit = {
    id: `summon-${input.summoner.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    playerId: input.summoner.playerId,
    team: input.summoner.team,
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
    lvl: Math.max(1, input.summoner.lvl),
    defending: false,
    alive: true,
    effects: [],
    resists: resistsForClass(hero.code),
    isSummon: true,
    summonerId: input.summoner.id,
    horseIsDead: false,
    authority: 0,
    maxSummons: 0,
    cumRage: 0,
    lichGrade: 0,
    isLichSummon: input.isLichSummon ?? false,
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
  state.units.push(unit);
  return unit;
}

/**
 * Фантомная копия цели (Demiurge): низкое HP, ослабленные статы.
 */
export function createPhantomCopy(
  state: BattleState,
  summoner: BattleUnit,
  template: BattleUnit,
  row: number
): BattleUnit | null {
  const teamAlive = state.units.filter(
    (unit) => unit.alive && unit.team === summoner.team
  ).length;
  if (teamAlive >= MAX_TEAM_SIZE) {
    state.log.push('В команде нет места для фантома.');
    return null;
  }
  const owned = state.units.filter(
    (unit) => unit.alive && unit.isSummon && unit.summonerId === summoner.id
  ).length;
  if (owned >= summoner.maxSummons) {
    state.log.push('Достигнут лимит саммонов.');
    return null;
  }
  const hp = 1 + Math.floor(Math.random() * 10);
  const column = state.units.filter(
    (unit) => unit.alive && unit.team === summoner.team && unit.row === row
  ).length;
  const unit: BattleUnit = {
    id: `phantom-${summoner.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    playerId: summoner.playerId,
    team: summoner.team,
    heroClassCode: template.heroClassCode,
    displayName: `Фантом ${template.displayName}`,
    row,
    column,
    maxHp: hp,
    health: hp,
    damage: Math.max(1, Math.round(template.damage * 0.5)),
    armor: Math.max(0, Math.round(template.armor * 0.5)),
    initiative: Math.max(1, Math.round(template.initiative * 0.5)),
    dodge: Math.max(0, Math.round(template.dodge * 0.5)),
    luck: Math.max(0, Math.round(template.luck * 0.5)),
    accuracy: template.accuracy,
    attackStyle: template.attackStyle,
    power: Math.max(0, Math.round(template.power * 0.5)),
    mana: 0,
    gold: 0,
    lvl: Math.max(1, template.lvl),
    defending: false,
    alive: true,
    effects: [],
    resists: cloneResists(template.resists),
    isSummon: true,
    summonerId: summoner.id,
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
    forbiddenResurrect: true,
    polymorphSavedArmor: -1,
    transformParentCode: null,
    critBank: 0,
    enslavedOriginTeam: null,
    enslavedOriginPlayerId: null,
  };
  state.units.push(unit);
  return unit;
}

/**
 * Свободные ряды для размещения саммона (есть слот по размеру команды).
 */
export function availableSummonRows(state: BattleState, summoner: BattleUnit): number[] {
  const teamAlive = state.units.filter(
    (unit) => unit.alive && unit.team === summoner.team
  ).length;
  if (teamAlive >= MAX_TEAM_SIZE) {
    return [];
  }
  return [0, 1];
}
