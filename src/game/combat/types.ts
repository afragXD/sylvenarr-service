export type BattleAction = 'attack' | 'defend' | 'wait' | 'skill';

export type BattleUnit = {
  readonly id: string;
  readonly playerId: string;
  readonly team: 0 | 1;
  readonly heroClassCode: string;
  readonly displayName: string;
  readonly row: number;
  readonly column: number;
  readonly maxHp: number;
  health: number;
  readonly damage: number;
  readonly armor: number;
  readonly initiative: number;
  readonly dodge: number;
  readonly luck: number;
  readonly accuracy: number;
  /** Атакующий стиль для фазы 3.1–3.5. */
  readonly attackStyle: 'melee' | 'ranged' | 'magic';
  readonly power: number;
  defending: boolean;
  alive: boolean;
};

export type BattleState = {
  readonly matchId: string;
  readonly hostPlayerId: string;
  readonly guestPlayerId: string;
  stage: number;
  units: BattleUnit[];
  /** id юнитов, уже ходивших в этом раунде. */
  doneIds: string[];
  /** id юнитов, отложивших ход. */
  delayedIds: string[];
  activeUnitId: string | null;
  /** Игрок, который должен действовать (владелец activeUnit). */
  turnPlayerId: string | null;
  log: string[];
  outcome: 'ongoing' | 'host_win' | 'guest_win' | 'draw';
  winnerPlayerId: string | null;
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
};

export type DraftPickSeed = {
  readonly id: string;
  readonly playerId: string;
  readonly heroClassCode: string;
  readonly row: number;
  readonly pickOrder: number;
};
