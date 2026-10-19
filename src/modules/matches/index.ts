import { Elysia, t } from 'elysia';
import { playerSessionPlugin } from '../../shared/plugins/player-session';
import { MatchesModel } from './model';
import { MatchesService } from './service';

export const matchesController = new Elysia({ prefix: '/matches', tags: ['Matches'] })
  .use(playerSessionPlugin)
  .post(
    '',
    async ({ body, player, status }) => {
      const result = await MatchesService.createMatch(player.id, body?.rules);
      if (!result.ok) {
        return status(400, { message: result.message });
      }
      return result.match;
    },
    {
      requireAuth: true,
      body: t.Optional(MatchesModel.createBody),
      response: {
        200: MatchesModel.match,
        400: MatchesModel.errorResponse,
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
      requireAuth: true,
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
        summary: 'Получить матч по id (включая draft state)',
      },
    }
  )
  .post(
    '/:id/draft/pick',
    async ({ params, body, player, status }) => {
      const result = await MatchesService.draftPick({
        matchId: params.id,
        playerId: player.id,
        heroCode: body.heroCode,
        row: body.row,
      });
      if (!result.ok) {
        return status(result.status, { message: result.message });
      }
      return result.match;
    },
    {
      requireAuth: true,
      params: MatchesModel.idParams,
      body: MatchesModel.pickBody,
      response: {
        200: MatchesModel.match,
        400: MatchesModel.errorResponse,
        401: MatchesModel.errorResponse,
        403: MatchesModel.errorResponse,
        404: MatchesModel.errorResponse,
      },
      detail: {
        summary: 'Выбрать героя в draft',
      },
    }
  )
  .post(
    '/:id/draft/random',
    async ({ params, body, player, status }) => {
      const result = await MatchesService.draftRandom({
        matchId: params.id,
        playerId: player.id,
        preferredRow: body?.row,
      });
      if (!result.ok) {
        return status(result.status, { message: result.message });
      }
      return result.match;
    },
    {
      requireAuth: true,
      params: MatchesModel.idParams,
      body: t.Optional(MatchesModel.randomBody),
      response: {
        200: MatchesModel.match,
        400: MatchesModel.errorResponse,
        401: MatchesModel.errorResponse,
        403: MatchesModel.errorResponse,
        404: MatchesModel.errorResponse,
      },
      detail: {
        summary: 'Случайный герой в draft',
      },
    }
  )
  .patch(
    '/:id/draft/picks/:pickId',
    async ({ params, body, player, status }) => {
      const result = await MatchesService.moveDraftPick({
        matchId: params.id,
        pickId: params.pickId,
        playerId: player.id,
        row: body.row,
      });
      if (!result.ok) {
        return status(result.status, { message: result.message });
      }
      return result.match;
    },
    {
      requireAuth: true,
      params: MatchesModel.pickIdParams,
      body: MatchesModel.movePickBody,
      response: {
        200: MatchesModel.match,
        400: MatchesModel.errorResponse,
        401: MatchesModel.errorResponse,
        403: MatchesModel.errorResponse,
        404: MatchesModel.errorResponse,
      },
      detail: {
        summary: 'Перенести своего героя на другой ряд',
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
      requireAuth: true,
      params: MatchesModel.idParams,
      response: {
        200: MatchesModel.match,
        400: MatchesModel.errorResponse,
        401: MatchesModel.errorResponse,
        403: MatchesModel.errorResponse,
        404: MatchesModel.errorResponse,
      },
      detail: {
        summary: 'Отменить матч (хост, waiting/drafting)',
      },
    }
  )
  .post(
    '/:id/battle/surrender',
    async ({ params, player, status }) => {
      const result = await MatchesService.surrenderMatch({
        matchId: params.id,
        playerId: player.id,
      });
      if (!result.ok) {
        return status(result.status, { message: result.message });
      }
      return result.match;
    },
    {
      requireAuth: true,
      params: MatchesModel.idParams,
      response: {
        200: MatchesModel.match,
        400: MatchesModel.errorResponse,
        401: MatchesModel.errorResponse,
        403: MatchesModel.errorResponse,
        404: MatchesModel.errorResponse,
      },
      detail: {
        summary: 'Сдаться в бою',
      },
    }
  )
  .post(
    '/:id/battle/action',
    async ({ params, body, player, status }) => {
      const result = await MatchesService.battleAction({
        matchId: params.id,
        playerId: player.id,
        unitId: body.unitId,
        action: body.action,
        targetId: body.targetId,
        slot: body.slot,
        choice: body.choice,
      });
      if (!result.ok) {
        return status(result.status, { message: result.message });
      }
      return result.match;
    },
    {
      requireAuth: true,
      params: MatchesModel.idParams,
      body: MatchesModel.battleActionBody,
      response: {
        200: MatchesModel.match,
        400: MatchesModel.errorResponse,
        401: MatchesModel.errorResponse,
        403: MatchesModel.errorResponse,
        404: MatchesModel.errorResponse,
      },
      detail: {
        summary: 'Действие юнита в бою',
      },
    }
  );
