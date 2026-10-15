import { Elysia } from 'elysia';
import { playerSessionPlugin } from '../../shared/plugins/player-session';
import { MatchesModel } from './model';
import { MatchesService } from './service';

export const matchesController = new Elysia({ prefix: '/matches', tags: ['Matches'] })
  .use(playerSessionPlugin)
  .post(
    '',
    async ({ player }) => {
      return await MatchesService.createMatch(player.id);
    },
    {
      requirePlayer: true,
      response: {
        200: MatchesModel.match,
        401: MatchesModel.errorResponse,
      },
      detail: {
        summary: 'Создать лобби',
      },
    }
  )
  .post(
    '/join',
    async ({ body, player, status }) => {
      const result = await MatchesService.joinMatch({
        inviteCode: body.inviteCode,
        guestId: player.id,
      });
      if (!result.ok) {
        return status(400, { message: result.message });
      }
      return result.match;
    },
    {
      requirePlayer: true,
      body: MatchesModel.joinBody,
      response: {
        200: MatchesModel.match,
        400: MatchesModel.errorResponse,
        401: MatchesModel.errorResponse,
      },
      detail: {
        summary: 'Присоединиться к лобби по коду',
      },
    }
  )
  .get(
    '/:id',
    async ({ params, status }) => {
      const match = await MatchesService.findById(params.id);
      if (!match) {
        return status(404, { message: 'Матч не найден' });
      }
      return match;
    },
    {
      params: MatchesModel.idParams,
      response: {
        200: MatchesModel.match,
        404: MatchesModel.errorResponse,
      },
      detail: {
        summary: 'Получить матч по id',
      },
    }
  )
  .post(
    '/:id/cancel',
    async ({ params, player, status }) => {
      const result = await MatchesService.cancelMatch({
        matchId: params.id,
        playerId: player.id,
      });
      if (!result.ok) {
        return status(result.status, { message: result.message });
      }
      return result.match;
    },
    {
      requirePlayer: true,
      params: MatchesModel.idParams,
      response: {
        200: MatchesModel.match,
        401: MatchesModel.errorResponse,
        403: MatchesModel.errorResponse,
        404: MatchesModel.errorResponse,
      },
      detail: {
        summary: 'Отменить матч (хост)',
      },
    }
  );
