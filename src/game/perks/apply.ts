import { grantEffect } from '../combat/effects';
import { changeResist } from '../combat/resists';
import type { BattleState, BattleUnit } from '../combat/types';
import { getPerk, PERK_CATALOG } from './catalog';

/** Мгновенные эффекты при изучении перка. */
export function applyPerkInstant(state: BattleState, unit: BattleUnit, perkId: string): void {
  const perk = getPerk(perkId);
  if (!perk) {
    return;
  }
  switch (perkId) {
    case 'GRAND_MERCHANT':
      unit.merchant = (unit.merchant ?? 0) + 0.25;
      break;
    case 'SIGMALIKE':
      changeResist(unit, 'STUN', 40);
      break;
    case 'LUCKYBASTARD':
      unit.critBank += 1;
      unit.dodgeBank += 1;
      break;
    case 'MANDATEOFHEAVEN':
      unit.maxHp = Math.round(unit.maxHp * 1.25);
      unit.healRate = (unit.healRate ?? 1) + 0.25;
      break;
    case 'ARMORPENETRATOR':
      unit.armorPenetration += 0.3;
      break;
    case 'SHINEOFTHISUNGLASSES':
      grantEffect(unit, 'REFLECTION', 5);
      break;
    case 'LONGWEAPON':
      unit.weaponReach = (unit.weaponReach ?? 1) + 1;
      break;
    case 'MORESUMMONS':
      unit.maxSummons += 1;
      break;
    default:
      break;
  }
  state.log.push(`${unit.displayName} изучает «${perk.name}».`);
}

export function addPerkToUnit(unit: BattleUnit, perkId: string): void {
  unit.perks = unit.perks ?? [];
  if (!unit.perks.includes(perkId)) {
    unit.perks.push(perkId);
  }
}

export function unitHasPerk(unit: BattleUnit, perkId: string): boolean {
  return (unit.perks ?? []).includes(perkId);
}

/** Случайный неизученный перк (для EvilTree «Мудрость»). */
export function pickUnlearnedPerkId(unit: BattleUnit): string | null {
  const learned = new Set(unit.perks ?? []);
  const pool = PERK_CATALOG.filter((p) => !learned.has(p.id));
  if (pool.length === 0) {
    return null;
  }
  return pool[Math.floor(Math.random() * pool.length)]!.id;
}

/** Стереть все перки (болезнь «деградация»). */
export function clearAllPerks(unit: BattleUnit): void {
  unit.perks = [];
}
