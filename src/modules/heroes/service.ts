import { prisma } from '../../shared/db';
import type { HeroesModel } from './model';

export abstract class HeroesService {
  /**
   * Возвращает список классов героев.
   */
  static async listHeroes(query: HeroesModel.listQuery): Promise<HeroesModel.listResponse> {
    const playableOnly = query.playableOnly ?? true;
    const items = await prisma.heroClass.findMany({
      where: playableOnly ? { isPlayable: true } : undefined,
      select: {
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
      },
    });
    items.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru'));
    return { items };
  }

  /**
   * Возвращает класс героя по коду или null.
   */
  static async findByCode(code: string): Promise<HeroesModel.heroClass | null> {
    return prisma.heroClass.findUnique({
      where: { code },
      select: {
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
      },
    });
  }
}
