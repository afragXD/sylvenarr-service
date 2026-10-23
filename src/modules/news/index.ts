import { Elysia, t } from 'elysia';

import { playerSessionPlugin } from '../../shared/plugins/player-session';
import { NewsModel } from './model';
import { NewsService } from './service';
import { saveNewsSceneFile } from './upload';

export const newsController = new Elysia({ tags: ['News'] })
  .get(
    '/news',
    async ({ query }) => {
      const limit = query.limit ? Number(query.limit) : 10;
      return await NewsService.listPublished({
        limit: Number.isFinite(limit) ? limit : 10,
        cursor: query.cursor ?? null,
      });
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
      }),
      response: {
        200: NewsModel.listResponse,
      },
      detail: {
        summary: 'Список опубликованных новостей',
      },
    }
  )
  .get(
    '/news/:slug',
    async ({ params, status }) => {
      const item = await NewsService.getPublishedBySlug(params.slug);
      if (!item) {
        return status(404, { message: 'Новость не найдена' });
      }
      return item;
    },
    {
      params: t.Object({ slug: t.String() }),
      response: {
        200: NewsModel.newsItem,
        404: NewsModel.errorResponse,
      },
      detail: {
        summary: 'Опубликованная новость по slug',
      },
    }
  )
  .use(playerSessionPlugin)
  .get(
    '/admin/news',
    async () => {
      return await NewsService.listAll();
    },
    {
      requireAdmin: true,
      response: {
        200: t.Array(NewsModel.newsItem),
        401: NewsModel.errorResponse,
        403: NewsModel.errorResponse,
      },
      detail: {
        summary: 'Все новости (включая черновики)',
      },
    }
  )
  .get(
    '/admin/news/:id',
    async ({ params, status }) => {
      const item = await NewsService.getById(params.id);
      if (!item) {
        return status(404, { message: 'Новость не найдена' });
      }
      return item;
    },
    {
      requireAdmin: true,
      params: t.Object({ id: t.String() }),
      response: {
        200: NewsModel.newsItem,
        401: NewsModel.errorResponse,
        403: NewsModel.errorResponse,
        404: NewsModel.errorResponse,
      },
      detail: {
        summary: 'Новость по id (админ)',
      },
    }
  )
  .post(
    '/admin/news/upload',
    async ({ body, status }) => {
      const result = await saveNewsSceneFile(body.file);
      if (!result.ok) {
        return status(400, { message: result.message });
      }
      return { url: result.url, fileName: result.fileName };
    },
    {
      requireAdmin: true,
      body: t.Object({
        file: t.File({ type: 'image', maxSize: '5m' }),
      }),
      response: {
        200: t.Object({
          url: t.String(),
          fileName: t.String(),
        }),
        400: NewsModel.errorResponse,
        401: NewsModel.errorResponse,
        403: NewsModel.errorResponse,
      },
      detail: {
        summary: 'Загрузить обложку/скрин новости в volume (/static/images/scenes)',
      },
    }
  )
  .post(
    '/admin/news',
    async ({ body, player, status }) => {
      const result = await NewsService.create(body, player.id);
      if (!result.ok) {
        return status(result.status, { message: result.message });
      }
      return result.item;
    },
    {
      requireAdmin: true,
      body: NewsModel.createBody,
      response: {
        200: NewsModel.newsItem,
        401: NewsModel.errorResponse,
        403: NewsModel.errorResponse,
        409: NewsModel.errorResponse,
      },
      detail: {
        summary: 'Создать новость',
      },
    }
  )
  .patch(
    '/admin/news/:id',
    async ({ params, body, status }) => {
      const result = await NewsService.update(params.id, body);
      if (!result.ok) {
        return status(result.status, { message: result.message });
      }
      return result.item;
    },
    {
      requireAdmin: true,
      params: t.Object({ id: t.String() }),
      body: NewsModel.updateBody,
      response: {
        200: NewsModel.newsItem,
        401: NewsModel.errorResponse,
        403: NewsModel.errorResponse,
        404: NewsModel.errorResponse,
        409: NewsModel.errorResponse,
      },
      detail: {
        summary: 'Обновить новость',
      },
    }
  )
  .delete(
    '/admin/news/:id',
    async ({ params, status }) => {
      const result = await NewsService.remove(params.id);
      if (!result.ok) {
        return status(result.status, { message: result.message });
      }
      return { ok: true };
    },
    {
      requireAdmin: true,
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ ok: t.Literal(true) }),
        401: NewsModel.errorResponse,
        403: NewsModel.errorResponse,
        404: NewsModel.errorResponse,
      },
      detail: {
        summary: 'Удалить новость',
      },
    }
  );

export { NewsService } from './service';
export { NewsModel } from './model';
