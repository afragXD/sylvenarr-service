import type { BattleState, BattleUnit } from '../types';

/** Классовый прирост до/вместо базового bump (зеркало Hero.levelup). */
export type ClassLevelUpFn = (unit: BattleUnit, ind: number, state: BattleState) => void;
