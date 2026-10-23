import { Elysia } from 'elysia';
import { HeroesModel } from './model';
import { HeroesService } from './service';

export const heroesController = new Elysia({ prefix: '/heroes', tags: ['Heroes'] })
  .get(
    '',
    async ({ query }) => {
      return await HeroesService.listHeroes(query);
    },
    {
      query: HeroesModel.listQuery,
      response: {
        200: HeroesModel.listResponse,
      },
      detail: {
        summary: 'Список классов героев',
      },
    }
  )
  .get(
    '/favorites',
    async ({ query }) => {
      return await HeroesService.listFavorites(query.limit ?? 24);
    },
    {
      query: HeroesModel.favoritesQuery,
      response: {
        200: HeroesModel.favoritesResponse,
      },
      detail: {
        summary: 'Популярные герои по числу выборов на арене',
      },
    }
  )
  .get(
    '/:code',
    async ({ params, status }) => {
      const hero = await HeroesService.findByCode(params.code);
      if (!hero) {
        return status(404, { message: 'Герой не найден' });
      }
      return hero;
    },
    {
      params: HeroesModel.codeParams,
      response: {
        200: HeroesModel.heroClass,
        404: HeroesModel.errorResponse,
      },
      detail: {
        summary: 'Карточка героя по коду',
      },
    }
  );
