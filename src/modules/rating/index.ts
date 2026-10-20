import { Elysia } from 'elysia';
import { RatingModel } from './model';
import { RatingService } from './service';

export const ratingController = new Elysia({ prefix: '/rating', tags: ['Rating'] }).get(
  '',
  async () => {
    return await RatingService.listRating();
  },
  {
    response: {
      200: RatingModel.listResponse,
    },
    detail: {
      summary: 'Таблица рейтинга (ПТС Heroes III)',
    },
  }
);
