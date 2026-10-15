import { Elysia } from 'elysia';
import { AppModel } from './model';
import { AppService } from './service';

export const appController = new Elysia().get(
  '/healthcheck',
  async () => {
    return await AppService.healthcheck();
  },
  {
    response: {
      200: AppModel.healthcheckResponse,
    },
    detail: {
      summary: 'Проверка доступности сервиса и зависимостей',
      tags: ['App'],
    },
  }
);
