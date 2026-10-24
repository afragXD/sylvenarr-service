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
    catalogCode: 'balanced-3',
    name: 'Сбалансированная тройка',
    teamSize: 3,
    slots: [
      { heroClassCode: 'Knight', row: 0, slotOrder: 0 },
      { heroClassCode: 'Oracle', row: 1, slotOrder: 1 },
      { heroClassCode: 'Herbalist', row: 1, slotOrder: 2 },
    ],
  },
  {
    catalogCode: 'aggro-3',
    name: 'Агрессивная тройка',
    teamSize: 3,
    slots: [
      { heroClassCode: 'Assassin', row: 0, slotOrder: 0 },
      { heroClassCode: 'Marauder', row: 1, slotOrder: 1 },
      { heroClassCode: 'Pyro', row: 1, slotOrder: 2 },
    ],
  },
  {
    catalogCode: 'control-3',
    name: 'Контроль тройка',
    teamSize: 3,
    slots: [
      { heroClassCode: 'Inquisitor', row: 0, slotOrder: 0 },
      { heroClassCode: 'Mermaid', row: 1, slotOrder: 1 },
      { heroClassCode: 'Specter', row: 1, slotOrder: 2 },
    ],
  },
  {
    catalogCode: 'giant-core-4',
    name: 'Ядро с гигантом',
    teamSize: 4,
    slots: [
      { heroClassCode: 'DemonLord', row: 0, slotOrder: 0 },
      { heroClassCode: 'Abbess', row: 1, slotOrder: 1 },
      { heroClassCode: 'Detective', row: 0, slotOrder: 2 },
    ],
  },
];
