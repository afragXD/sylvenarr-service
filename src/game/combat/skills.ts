import { enemiesOf, listAttackTargets } from './abilities/targets';
import type { BattleState, BattleUnit } from './types';

/** Множители базовой атаки по классам. */
const CLASS_ATTACK_MULT: Record<string, number> = {
  Assassin: 1.15,
  Archlich: 1.1,
  DemonLord: 1.2,
  Dracolich: 1.2,
  Inquisitor: 1.1,
  Knight: 1.05,
  GoldGolem: 0.9,
  Abbess: 0.95,
  Herbalist: 0.9,
  GhostWarrior: 1.1,
  OrcKing: 1.1,
  Paladin: 1.05,
  Pyro: 1.1,
  Werewolf: 1.15,
};

export type ClassAttackMods = {
  readonly damageMult: number;
  /** 0..1 доля брони, которую игнорируем. */
  readonly armorIgnore: number;
  /** Шанс задеть юнита в той же колонке позади цели. */
  readonly splashChance: number;
  readonly splashMult: number;
  /** Доп. удар по той же цели. */
  readonly doubleStrikeChance: number;
  /** Урон всем живым врагам переднего ряда (кроме основной цели). */
  readonly cleaveFront: boolean;
  readonly cleaveMult: number;
  /** Вампиризм от нанесённого урона. */
  readonly lifesteal: number;
};

export type ClassSkillKind =
  | 'pierce'
  | 'heavy'
  | 'heal_self'
  | 'heal_ally'
  | 'cleave'
  | 'mark_strike'
  | 'none';

export type ClassSkillDef = {
  readonly kind: ClassSkillKind;
  readonly label: string;
  readonly needsTarget: boolean;
  readonly damageMult: number;
  /** Игнор ряда (можно бить задний при живом фронте). */
  readonly ignoreMelee: boolean;
  readonly healFraction: number;
};

const DEFAULT_MODS: ClassAttackMods = {
  damageMult: 1,
  armorIgnore: 0,
  splashChance: 0,
  splashMult: 0.6,
  doubleStrikeChance: 0,
  cleaveFront: false,
  cleaveMult: 0.5,
  lifesteal: 0,
};

/**
 * Модификаторы основной атаки (порт firstAction-эффектов в упрощённом виде).
 */
export function classAttackMods(code: string): ClassAttackMods {
  const base: ClassAttackMods = {
    ...DEFAULT_MODS,
    damageMult: CLASS_ATTACK_MULT[code] ?? 1,
  };
  switch (code) {
    case 'Knight':
      return { ...base, splashChance: 0.55, splashMult: 0.6 };
    case 'DemonLord':
      return { ...base, cleaveFront: true, cleaveMult: 0.45 };
    case 'Paladin':
      return { ...base, doubleStrikeChance: 0.35 };
    case 'Assassin':
      return { ...base, armorIgnore: 0.35 };
    case 'Witch':
      return { ...base, armorIgnore: 0.5 };
    case 'OrcKing':
      return { ...base, damageMult: base.damageMult * 1.15, armorIgnore: 0.25 };
    case 'GhostWarrior':
      return { ...base, damageMult: base.damageMult * 1.2 };
    case 'GoldGolem':
      return { ...base, armorIgnore: 0.2 };
    case 'Dracolich':
      return { ...base, armorIgnore: 0.25 };
    case 'Pyro':
      return { ...base, splashChance: 0.4, splashMult: 0.4 };
    case 'Werewolf':
      return { ...base, lifesteal: 0.2 };
    case 'Detective':
      return { ...base, armorIgnore: 0.15 };
    default:
      return base;
  }
}

/**
 * Уникальный навык (упрощённый secondAction).
 */
export function classSkill(code: string): ClassSkillDef {
  switch (code) {
    case 'Knight':
      return {
        kind: 'pierce',
        label: 'Удар пикой',
        needsTarget: true,
        damageMult: 0.75,
        ignoreMelee: true,
        healFraction: 0,
      };
    case 'DemonLord':
      return {
        kind: 'heavy',
        label: 'Двойной удар',
        needsTarget: true,
        damageMult: 2,
        ignoreMelee: false,
        healFraction: 0,
      };
    case 'Abbess':
    case 'Herbalist':
    case 'Patriarch':
      return {
        kind: 'heal_ally',
        label: 'Исцеление',
        needsTarget: true,
        damageMult: 0,
        ignoreMelee: false,
        healFraction: 0.35,
      };
    case 'Oracle':
    case 'Demiurge':
      return {
        kind: 'heal_self',
        label: 'Восстановление',
        needsTarget: false,
        damageMult: 0,
        ignoreMelee: false,
        healFraction: 0.3,
      };
    case 'Inquisitor':
      return {
        kind: 'heavy',
        label: 'Кара',
        needsTarget: true,
        damageMult: 1.25,
        ignoreMelee: false,
        healFraction: 0,
      };
    case 'Marauder':
      return {
        kind: 'mark_strike',
        label: 'Прицельный выстрел',
        needsTarget: true,
        damageMult: 1.25,
        ignoreMelee: true,
        healFraction: 0,
      };
    case 'Archlich':
      return {
        kind: 'cleave',
        label: 'Смертный шторм',
        needsTarget: false,
        damageMult: 0.55,
        ignoreMelee: true,
        healFraction: 0,
      };
    case 'Specter':
      return {
        kind: 'pierce',
        label: 'Сквозной удар',
        needsTarget: true,
        damageMult: 0.85,
        ignoreMelee: true,
        healFraction: 0,
      };
    default:
      return {
        kind: 'none',
        label: '',
        needsTarget: false,
        damageMult: 1,
        ignoreMelee: false,
        healFraction: 0,
      };
  }
}

/**
 * Подпись основной атаки.
 */
export function attackLabel(unit: BattleUnit): string {
  switch (unit.attackStyle) {
    case 'ranged':
      return unit.heroClassCode === 'Assassin' ? 'Удар из тени' : 'Выстрел';
    case 'magic':
      if (unit.heroClassCode === 'Archlich') {
        return 'Смерть';
      }
      if (unit.heroClassCode === 'Demiurge') {
        return 'Свет';
      }
      return 'Заклинание';
    default:
      if (unit.heroClassCode === 'Knight') {
        return 'Удар копья';
      }
      return 'Удар';
  }
}

/**
 * Классовый множитель урона.
 */
export function classDamageMult(code: string): number {
  return classAttackMods(code).damageMult;
}

/**
 * Краткое описание доступных действий юнита.
 */
export function describeActions(unit: BattleUnit): string[] {
  const skill = classSkill(unit.heroClassCode);
  const actions = [attackLabel(unit), 'Защита', 'Ждать'];
  if (skill.kind !== 'none') {
    actions.splice(1, 0, skill.label);
  }
  return actions;
}

/**
 * Цели для навыка класса.
 */
export function listSkillTargets(state: BattleState, actor: BattleUnit): BattleUnit[] {
  const skill = classSkill(actor.heroClassCode);
  if (skill.kind === 'none' || skill.kind === 'heal_self' || skill.kind === 'cleave') {
    return [];
  }
  if (skill.kind === 'heal_ally') {
    return state.units.filter((unit) => unit.alive && unit.team === actor.team);
  }
  // offensive skills — SANCTUM/GUARDED как у Pattern.
  if (skill.ignoreMelee) {
    return enemiesOf(state, actor);
  }
  return listAttackTargets(state, actor);
}
