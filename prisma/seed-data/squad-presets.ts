/**
 * Глобальные пресеты отряда (seed). catalogCode — идемпотентный ключ.
 * Все герои playable, сумма size = teamSize.
 */
export type SquadPresetSeedSlot = {
  readonly heroClassCode: string;
  readonly row: 0 | 1;
  readonly slotOrder: number;
};

export type SquadPresetSeed = {
  readonly catalogCode: string;
  readonly name: string;
  readonly teamSize: number;
  readonly slots: ReadonlyArray<SquadPresetSeedSlot>;
};

export const globalSquadPresetSeeds: ReadonlyArray<SquadPresetSeed> = [
  {
    catalogCode: 'dracolich-mirror',
    name: 'Зеркало драколича',
    teamSize: 3,
    slots: [
      { heroClassCode: 'Dracolich', row: 0, slotOrder: 0 },
      { heroClassCode: 'Demiurge', row: 1, slotOrder: 1 },
    ],
  },
];

/** catalogCode старых сидов — удаляем при ресиде, чтобы не плодить мёртвые глобальные. */
export const retiredSquadPresetCatalogCodes: ReadonlyArray<string> = [
  'balanced-3',
  'aggro-3',
  'control-3',
  'giant-core-4',
];
