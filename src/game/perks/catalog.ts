/** Каталог перков (порт dperks.py + CUT-2026-11-03b). */

export type PerkKind = 'item' | 'other';

export type PerkCatalogEntry = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: PerkKind;
  /** Категория предметов 1–9; только для kind: 'item'. */
  readonly category?: number;
};

/** 9 перков предметов + 16 прочих = 25. AURAS не переносится. */
export const PERK_CATALOG: readonly PerkCatalogEntry[] = [
  {
    id: 'TALISMANS',
    name: 'Талисманы',
    description: 'Научитесь применять талисманы: они призывают существ.',
    kind: 'item',
    category: 1,
  },
  {
    id: 'TECHNO',
    name: 'Технологии',
    description: 'Научитесь применять огнестрельное оружие, артефакты Древних и многое другое.',
    kind: 'item',
    category: 2,
  },
  {
    id: 'ORBS',
    name: 'Сферы',
    description: 'Научитесь применять сферы: удар, порча и чужие свойства.',
    kind: 'item',
    category: 3,
  },
  {
    id: 'SCROLLS',
    name: 'Свитки',
    description: 'Научитесь применять свитки: разовое колдовство по цели.',
    kind: 'item',
    category: 4,
  },
  {
    id: 'RELICS',
    name: 'Реликвии',
    description: 'Научитесь применять реликвии: святыни, воскрешение, церковные вещи.',
    kind: 'item',
    category: 5,
  },
  {
    id: 'ARTIFACTS',
    name: 'Артефакты',
    description: 'Научитесь применять артефакты: редкие вещи с собственным эффектом.',
    kind: 'item',
    category: 6,
  },
  {
    id: 'MISC',
    name: 'Расходники',
    description: 'Зелья, алкоголь, минорные магические вещи. Доступен почти каждому.',
    kind: 'item',
    category: 7,
  },
  {
    id: 'STAFFS',
    name: 'Посохи',
    description:
      'Отличительной особенностью этого класса предметов является повторное использование.',
    kind: 'item',
    category: 8,
  },
  {
    id: 'MILITARY',
    name: 'Военное дело',
    description: 'Использование знамён, командирских рогов.',
    kind: 'item',
    category: 9,
  },
  {
    id: 'LOWHP_EXTRATURN',
    name: 'Предсмертный хрип',
    description: 'Шанс дополнительного хода при низком уровне здоровья',
    kind: 'other',
  },
  {
    id: 'GRAND_MERCHANT',
    name: 'Суперкоммерсант',
    description: '+25% к навыку торговли',
    kind: 'other',
  },
  {
    id: 'BONUS_MOVEMENT',
    name: 'Крылья',
    description: 'С шансом 65% после вашего перемещения вы сможете сделать ещё один ход.',
    kind: 'other',
  },
  {
    id: 'CORPSE_BONUS',
    name: 'Упивающийся смертью',
    description: 'Ваш урон увеличивается на 15% за каждый труп во время сражения',
    kind: 'other',
  },
  {
    id: 'DOUBLE_USING_INVENTORY',
    name: 'Упаковка',
    description: 'С шансом 50% использование предмета из инвентаря не потратит ваш ход',
    kind: 'other',
  },
  {
    id: 'SUMMON_LEVEL_UP',
    name: 'Благословение демиурга',
    description: 'Призванное существо сразу поднимает 3 уровня',
    kind: 'other',
  },
  {
    id: 'DARK_CREATURES_SLAYER',
    name: 'Борец за чистоту',
    description: '+20% урона против нежити и демонов в ближнем бою',
    kind: 'other',
  },
  {
    id: 'NONHUMAN_SLAYER',
    name: 'Водитель-расист',
    description: '+20% урона против нелюдей в ближнем бою',
    kind: 'other',
  },
  {
    id: 'LUDOMANIA',
    name: 'Лудоман',
    description:
      'Вы настолько наловчились открывать кейсы, что этот процесс больше не тратит ваш ход.',
    kind: 'other',
  },
  {
    id: 'SIGMALIKE',
    name: 'Сигма',
    description: '+40% сопротивления Оглушению навсегда',
    kind: 'other',
  },
  {
    id: 'LUCKYBASTARD',
    name: 'Везунчик',
    description: '+1 к банку критов и уклонений',
    kind: 'other',
  },
  {
    id: 'MANDATEOFHEAVEN',
    name: 'Небесный мандат',
    description: '+25% макс хп, +25% объёма получаемого лечения.',
    kind: 'other',
  },
  {
    id: 'ARMORPENETRATOR',
    name: 'Пенетратор латников',
    description: '+30% к игнорированию брони',
    kind: 'other',
  },
  {
    id: 'SHINEOFTHISUNGLASSES',
    name: 'Сверкающие очки',
    description: 'Накладывает эффект Отражения на 5 раундов',
    kind: 'other',
  },
  {
    id: 'LONGWEAPON',
    name: 'Умелый хват',
    description: '+1 к радиусу поражения оружия ближнего боя.',
    kind: 'other',
  },
  {
    id: 'MORESUMMONS',
    name: 'Многодетный отец',
    description: 'Максимальное количество призывных существ увеличивается на 1.',
    kind: 'other',
  },
] as const;

export const PERK_BY_ID: ReadonlyMap<string, PerkCatalogEntry> = new Map(
  PERK_CATALOG.map((perk) => [perk.id, perk])
);

export const ITEM_PERK_BY_CATEGORY: ReadonlyMap<number, PerkCatalogEntry> = new Map(
  PERK_CATALOG.filter((perk) => perk.kind === 'item' && perk.category != null).map((perk) => [
    perk.category!,
    perk,
  ])
);

export function getPerk(id: string): PerkCatalogEntry | undefined {
  return PERK_BY_ID.get(id);
}
