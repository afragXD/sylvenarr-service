import { prisma } from '../../shared/db';
import type { HeroesModel } from './model';

const heroClassSelect = {
  code: true,
  displayName: true,
  description: true,
  roleSummary: true,
  health: true,
  damage: true,
  armor: true,
  initiative: true,
  dodge: true,
  luck: true,
  morale: true,
  mana: true,
  maxMana: true,
  power: true,
  gold: true,
  accuracy: true,
  size: true,
  isPlayable: true,
  sortOrder: true,
  roleTags: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      tag: {
        select: {
          id: true,
          label: true,
          mood: true,
        },
      },
    },
  },
} as const;

type HeroRow = {
  code: string;
  displayName: string;
  description: string;
  roleSummary: string;
  health: number;
  damage: number;
  armor: number;
  initiative: number;
  dodge: number;
  luck: number;
  morale: number;
  mana: number;
  maxMana: number;
  power: number;
  gold: number;
  accuracy: number;
  size: number;
  isPlayable: boolean;
  sortOrder: number;
  roleTags: Array<{ tag: HeroesModel.heroRoleTag }>;
};

function mapHero(row: HeroRow): HeroesModel.heroClass {
  const { roleTags, ...rest } = row;
  return {
    ...rest,
    tags: roleTags.map((link) => link.tag),
  };
}

export abstract class HeroesService {
  /**
   * Возвращает список классов героев.
   */
  static async listHeroes(query: HeroesModel.listQuery): Promise<HeroesModel.listResponse> {
    const playableOnly = query.playableOnly ?? true;
    const items = await prisma.heroClass.findMany({
      where: playableOnly ? { isPlayable: true } : undefined,
      select: heroClassSelect,
    });
    const mapped = items.map(mapHero);
    mapped.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru'));
    return { items: mapped };
  }

  /**
   * Глобальный топ героев по сумме выборов на арене.
   */
  static async listFavorites(limit = 24): Promise<HeroesModel.favoriteHero[]> {
    const capped = Math.min(Math.max(1, limit), 24);
    const grouped = await prisma.heroPickStat.groupBy({
      by: ['heroClassCode'],
      _sum: { pickCount: true },
      orderBy: { _sum: { pickCount: 'desc' } },
      take: capped,
    });
    if (grouped.length === 0) {
      return [];
    }
    const heroes = await prisma.heroClass.findMany({
      where: { code: { in: grouped.map((row) => row.heroClassCode) } },
      select: { code: true, displayName: true },
    });
    const nameByCode = new Map(heroes.map((hero) => [hero.code, hero.displayName]));
    return grouped
      .map((row) => ({
        code: row.heroClassCode,
        displayName: nameByCode.get(row.heroClassCode) ?? row.heroClassCode,
        pickCount: row._sum.pickCount ?? 0,
      }))
      .filter((row) => row.pickCount > 0);
  }

  /**
   * Возвращает класс героя по коду или null.
   */
  static async findByCode(code: string): Promise<HeroesModel.heroClass | null> {
    const row = await prisma.heroClass.findUnique({
      where: { code },
      select: heroClassSelect,
    });
    return row ? mapHero(row) : null;
  }
}
