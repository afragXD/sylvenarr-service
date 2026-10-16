export type DraftPick = {
  readonly id: string;
  readonly playerId: string;
  readonly heroClassCode: string;
  readonly displayName: string;
  readonly size: number;
  readonly row: number;
  readonly pickOrder: number;
};

export type DraftHeroRef = {
  readonly code: string;
  readonly displayName: string;
  readonly size: number;
  readonly isPlayable: boolean;
};
