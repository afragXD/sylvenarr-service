import { resolveAttackStyle } from '../attack-style';
import { HEALTH_BONUS, MAX_TEAM_SIZE } from '../settings';
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
    const old = state.units.find((unit) => unit.id === input.replaceUnitId);
    if (old) {
      old.alive = false;
      old.health = 0;
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
    defending: false,
    alive: true,
    effects: [],
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
