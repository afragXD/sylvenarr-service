import { Elysia, t } from 'elysia';

import { PLAYER_COOKIE_NAME } from '../../shared/constants/session';
import { saveStaticImage } from '../../shared/static-upload';
import { playerSessionPlugin } from '../../shared/plugins/player-session';
import { MatchesService } from '../matches/service';
import { PlayersModel } from './model';
import { PlayersService } from './service';

export const playersController = new Elysia({ prefix: '/players', tags: ['Players'] })
  .use(playerSessionPlugin)
  .get(
    '/me',
    async ({ cookie }) => {
      const rawValue: unknown = cookie[PLAYER_COOKIE_NAME]?.value;
      // Возвращаем null (не new Response): Elysia 1.4 валидирует Response как {} → 422.
      // Клиент в fetchCurrentPlayer уже принимает 200 + пустое тело / "null" / JSON null.
      if (typeof rawValue !== 'string' || rawValue.length === 0) {
        return null;
      }
      const player = await PlayersService.findAuthenticatedById(rawValue);
      if (!player) {
        return null;
      }
      return player;
    },
    {
      response: {
        200: t.Nullable(PlayersModel.player),
      },
      detail: {
        summary: 'Текущий игрок из cookie; JSON null если гость',
      },
    }
  )
  .patch(
    '/me',
    async ({ player, body, status }) => {
      const result = await PlayersService.updateDisplayName(player.id, body.displayName);
      if (!result.ok) {
        return status(result.status, { message: result.message });
      }
      return result.player;
    },
    {
      requireAuth: true,
      body: PlayersModel.updateProfileBody,
      response: {
        200: PlayersModel.player,
        400: PlayersModel.errorResponse,
        401: PlayersModel.errorResponse,
        404: PlayersModel.errorResponse,
        409: PlayersModel.errorResponse,
      },
      detail: {
        summary: 'Сменить displayName текущего игрока',
      },
    }
  )
  .post(
    '/me/avatar',
    async ({ player, body, status }) => {
      const saved = await saveStaticImage(body.file, {
        subdir: 'images/avatars',
        urlPrefix: '/static/images/avatars',
        maxBytes: 2 * 1024 * 1024,
      });
      if (!saved.ok) {
        return status(400, { message: saved.message });
      }
      const result = await PlayersService.updateAvatarUrl(player.id, saved.url);
      if (!result.ok) {
        return status(result.status, { message: result.message });
      }
      return result.player;
    },
    {
      requireAuth: true,
      body: t.Object({
        file: t.File({ type: 'image', maxSize: '2m' }),
      }),
      response: {
        200: PlayersModel.player,
        400: PlayersModel.errorResponse,
        401: PlayersModel.errorResponse,
        404: PlayersModel.errorResponse,
      },
      detail: {
        summary: 'Загрузить аватар в volume (/static/images/avatars)',
      },
    }
  )
  .get(
    '/me/favorite-heroes',
    async ({ player, query }) => {
      const limit = query.limit ? Number(query.limit) : 5;
      return await PlayersService.listFavoriteHeroes(
        player.id,
        Number.isFinite(limit) ? limit : 5
      );
    },
    {
      requireAuth: true,
      query: PlayersModel.favoriteHeroesQuery,
      response: {
        200: t.Array(PlayersModel.favoriteHero),
        401: PlayersModel.errorResponse,
      },
      detail: {
        summary: 'Любимые герои текущего игрока по числу выборов',
      },
    }
  )
  .get(
    '/me/matches',
    async ({ player }) => {
      return await MatchesService.listHistoryForPlayer(player.id);
    },
    {
      requireAuth: true,
      response: {
        200: t.Array(PlayersModel.matchHistoryItem),
        401: PlayersModel.errorResponse,
      },
      detail: {
        summary: 'История завершённых матчей текущего игрока',
      },
    }
  )
  .get(
    '/me/matches/:id',
    async ({ player, params, status }) => {
      const result = await MatchesService.getHistoryDetailForPlayer(player.id, params.id);
      if (!result.ok) {
        return status(result.status, { message: result.message });
      }
      return result.detail;
    },
    {
      requireAuth: true,
      params: t.Object({ id: t.String() }),
      response: {
        200: PlayersModel.matchHistoryDetail,
        401: PlayersModel.errorResponse,
        403: PlayersModel.errorResponse,
        404: PlayersModel.errorResponse,
      },
      detail: {
        summary: 'Детали завершённого матча текущего игрока',
      },
    }
  );
