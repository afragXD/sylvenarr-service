/**
 * Каталог героев из arenamsterbot/background.py → stats_dict.
 */
export type HeroSeed = {
  readonly code: string;
  readonly displayName: string;
  readonly health: number;
  readonly damage: number;
  readonly armor: number;
  readonly initiative: number;
  readonly dodge: number;
  readonly luck: number;
  readonly morale: number;
  readonly mana: number;
  readonly power: number;
  readonly gold: number;
  readonly accuracy: number;
  readonly isPlayable: boolean;
  readonly sortOrder: number;
};

const summonCodes = new Set([
  'GoblinTrapper',
  'GoblinShaman',
  'Zombie',
  'SkeletonChampion',
  'Ectoplasm',
  'Imp',
]);

const rawHeroes: ReadonlyArray<Omit<HeroSeed, 'isPlayable' | 'sortOrder'>> = [
  { code: 'Assassin', displayName: 'Ассасин', health: 200, damage: 28, armor: 0, initiative: 48, dodge: 10, luck: 20, morale: -10, mana: 8, power: 15, gold: 350, accuracy: 92 },
  { code: 'Paladin', displayName: 'Святой мститель', health: 230, damage: 16, armor: 15, initiative: 46, dodge: 0, luck: 5, morale: 0, mana: 8, power: 28, gold: 350, accuracy: 95 },
  { code: 'Inquisitor', displayName: 'Инквизитор', health: 220, damage: 30, armor: 5, initiative: 40, dodge: 0, luck: 0, morale: 10, mana: 7, power: 30, gold: 320, accuracy: 90 },
  { code: 'Detective', displayName: 'Детектив', health: 200, damage: 30, armor: 0, initiative: 44, dodge: 15, luck: 10, morale: 5, mana: 3, power: 10, gold: 350, accuracy: 90 },
  { code: 'DemonLord', displayName: 'Демон-принц', health: 350, damage: 28, armor: 5, initiative: 30, dodge: 0, luck: 10, morale: 0, mana: 6, power: 32, gold: 0, accuracy: 85 },
  { code: 'Abbess', displayName: 'Аббатиса', health: 205, damage: 5, armor: 0, initiative: 30, dodge: 5, luck: 10, morale: 0, mana: 12, power: 28, gold: 380, accuracy: 105 },
  { code: 'OrcKing', displayName: 'Хан орков', health: 260, damage: 30, armor: 10, initiative: 38, dodge: 0, luck: -37, morale: -10, mana: 0, power: 0, gold: 350, accuracy: 90 },
  { code: 'Marauder', displayName: 'Мародёр', health: 210, damage: 24, armor: 0, initiative: 56, dodge: 0, luck: 8, morale: -10, mana: 7, power: 25, gold: 430, accuracy: 95 },
  { code: 'Archlich', displayName: 'Архилич', health: 215, damage: 5, armor: 5, initiative: 36, dodge: 0, luck: 10, morale: -200, mana: 14, power: 32, gold: 400, accuracy: 90 },
  { code: 'Witch', displayName: 'Ведьмочка', health: 205, damage: 34, armor: 0, initiative: 46, dodge: 5, luck: 8, morale: 0, mana: 12, power: 28, gold: 400, accuracy: 88 },
  { code: 'GhostWarrior', displayName: 'Воин-призрак', health: 200, damage: 35, armor: 0, initiative: 15, dodge: 15, luck: 0, morale: -200, mana: 0, power: 0, gold: 50, accuracy: 95 },
  { code: 'Specter', displayName: 'Полуденница', health: 180, damage: 0, armor: 0, initiative: 5, dodge: 12, luck: 0, morale: -200, mana: 0, power: 25, gold: 380, accuracy: 55 },
  { code: 'Werewolf', displayName: 'Оборотень', health: 210, damage: 12, armor: 0, initiative: 56, dodge: 0, luck: 8, morale: -10, mana: 7, power: 25, gold: 430, accuracy: 95 },
  { code: 'Oracle', displayName: 'Оракул эльфов', health: 180, damage: 0, armor: 0, initiative: 15, dodge: 5, luck: 0, morale: 0, mana: 6, power: 30, gold: 200, accuracy: 100 },
  { code: 'Herbalist', displayName: 'Травница', health: 165, damage: 0, armor: 20, initiative: 10, dodge: 5, luck: 0, morale: 10, mana: 3, power: 30, gold: 400, accuracy: 100 },
  { code: 'Demiurge', displayName: 'Белый маг', health: 200, damage: 0, armor: 0, initiative: 32, dodge: 0, luck: 10, morale: 0, mana: 8, power: 27, gold: 220, accuracy: 90 },
  { code: 'GoldGolem', displayName: 'Золотой голем', health: 185, damage: 35, armor: 25, initiative: 25, dodge: -20, luck: 0, morale: -200, mana: 0, power: 0, gold: 300, accuracy: 95 },
  { code: 'BeerElemental', displayName: 'Пивной элем-таль', health: 150, damage: 0, armor: 0, initiative: 30, dodge: 25, luck: 0, morale: 0, mana: 0, power: 0, gold: 450, accuracy: 100 },
  { code: 'Knight', displayName: 'Рыцарь-кентавр', health: 210, damage: 20, armor: 15, initiative: 40, dodge: 0, luck: 0, morale: 15, mana: 0, power: 0, gold: 360, accuracy: 92 },
  { code: 'Mermaid', displayName: 'Русалка', health: 180, damage: 0, armor: 0, initiative: 48, dodge: 0, luck: 0, morale: 0, mana: 2, power: 30, gold: 290, accuracy: 100 },
  { code: 'Patriarch', displayName: 'Патриарх', health: 170, damage: 0, armor: 5, initiative: 15, dodge: 5, luck: 0, morale: 0, mana: 12, power: 25, gold: 150, accuracy: 100 },
  { code: 'Pyro', displayName: 'Гном-пироман', health: 220, damage: 5, armor: 10, initiative: 41, dodge: 7, luck: 12, morale: 0, mana: 2, power: 18, gold: 350, accuracy: 88 },
  { code: 'EvilTree', displayName: 'Злое дерево', health: 200, damage: 0, armor: 10, initiative: 40, dodge: -5, luck: 0, morale: 0, mana: 6, power: 30, gold: 320, accuracy: 92 },
  { code: 'Dracolich', displayName: 'Драколич', health: 270, damage: 30, armor: 15, initiative: 35, dodge: -15, luck: 0, morale: -200, mana: 6, power: 14, gold: 550, accuracy: 75 },
  { code: 'GoblinTrapper', displayName: 'Гоблин-лучник', health: 45, damage: 15, armor: 0, initiative: 50, dodge: 10, luck: 8, morale: -30, mana: 0, power: 0, gold: 0, accuracy: 90 },
  { code: 'GoblinShaman', displayName: 'Гоблин-шаман', health: 45, damage: 10, armor: 10, initiative: 20, dodge: 0, luck: 0, morale: 0, mana: 6, power: 11, gold: 0, accuracy: 80 },
  { code: 'Zombie', displayName: 'Зомби', health: 70, damage: 18, armor: 0, initiative: 30, dodge: 0, luck: 0, morale: -200, mana: 0, power: 0, gold: 0, accuracy: 80 },
  { code: 'SkeletonChampion', displayName: 'Скелет-чемпион', health: 120, damage: 30, armor: 15, initiative: 50, dodge: 0, luck: 15, morale: -200, mana: 0, power: 0, gold: 0, accuracy: 85 },
  { code: 'Ectoplasm', displayName: 'Эктоплазма', health: 60, damage: 0, armor: 0, initiative: 70, dodge: 0, luck: 50, morale: 0, mana: 0, power: 15, gold: 0, accuracy: 80 },
  { code: 'Imp', displayName: 'Толстый бес', health: 60, damage: 0, armor: 0, initiative: 70, dodge: 0, luck: 40, morale: 0, mana: 0, power: 20, gold: 0, accuracy: 80 },
];

export const heroSeeds: ReadonlyArray<HeroSeed> = rawHeroes.map((hero, index) => ({
  ...hero,
  isPlayable: !summonCodes.has(hero.code),
  sortOrder: index + 1,
}));
