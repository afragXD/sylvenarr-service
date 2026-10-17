export type BattleAction = 'attack' | 'defend' | 'wait' | 'skill' | 'ability';

export type AbilitySlot = 1 | 2 | 3 | 4 | 5;

export type EffectId =
  | 'GUARDED'
  | 'STRENGTH'
  | 'BLESSED'
  | 'POISON'
  | 'BURNING'
  | 'BLEEDING'
  | 'FATMAN'
  | 'HAPPY'
  | 'CHAINED'
  | 'FEAR'
  | 'VAMPWEAPON';

export type BattleEffect = {
  id: EffectId;
  rounds: number;
  /** Числовой параметр эффекта (урон баффа, % и т.п.). */
  power: number;
};

export type PromptOption = {
  id: string;
  label: string;
};

export type PendingPrompt = {
  unitId: string;
  kind: string;
  slot: AbilitySlot;
  options: PromptOption[];
  /** Сохранённый контекст (targetId, summonCode…). */
  context: Record<string, string>;
};

export type BattleUnit = {
  readonly id: string;
  readonly playerId: string;
  readonly team: 0 | 1;
  readonly heroClassCode: string;
  readonly displayName: string;
  row: number;
  column: number;
  readonly maxHp: number;
  health: number;
  damage: number;
  armor: number;
  initiative: number;
  dodge: number;
  luck: number;
  accuracy: number;
  readonly attackStyle: 'melee' | 'ranged' | 'magic';
  power: number;
  mana: number;
  gold: number;
  defending: boolean;
  alive: boolean;
  effects: BattleEffect[];
  isSummon: boolean;
  summonerId: string | null;
  /** Пилотные runtime-флаги. */
  horseIsDead: boolean;
  authority: number;
  maxSummons: number;
  cumRage: number;
  lichGrade: number;
  isLichSummon: boolean;
};

export type BattleState = {
  readonly matchId: string;
  readonly hostPlayerId: string;
  readonly guestPlayerId: string;
  /** Каталог статов классов для саммонов. */
  catalog: Record<string, HeroClassStats>;
  stage: number;
  units: BattleUnit[];
  doneIds: string[];
  delayedIds: string[];
  activeUnitId: string | null;
  turnPlayerId: string | null;
  log: string[];
  outcome: 'ongoing' | 'host_win' | 'guest_win' | 'draw';
  winnerPlayerId: string | null;
  pendingPrompt: PendingPrompt | null;
  /** id юнитов, для которых preChoice уже сработал в этом «заходе» хода. */
  preChoiceDoneIds: string[];
};

export type HeroClassStats = {
  readonly code: string;
  readonly displayName: string;
  readonly health: number;
  readonly damage: number;
  readonly armor: number;
  readonly initiative: number;
  readonly dodge: number;
  readonly luck: number;
  readonly accuracy: number;
  readonly power: number;
  readonly mana: number;
  readonly gold: number;
  readonly size: number;
};

export type DraftPickSeed = {
  readonly id: string;
  readonly playerId: string;
  readonly heroClassCode: string;
  readonly row: number;
  readonly pickOrder: number;
};

export type AbilityInfo = {
  slot: AbilitySlot;
  label: string;
  needsTarget: boolean;
  disabledReason: string | null;
  legalTargetIds: string[];
};
