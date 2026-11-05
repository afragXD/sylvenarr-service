import { Elysia, t } from 'elysia';

import { playerSessionPlugin } from '../../shared/plugins/player-session';
import { CreatorMatchesModel } from './model';
import { CreatorMatchesService } from './service';

export const creatorMatchesController = new Elysia({
  prefix: '/creator/matches',
  tags: ['CreatorMatches'],
})
  .use(playerSessionPlugin)
  .get(
    '',
    async () => {
      return await CreatorMatchesService.listFighting();
    },
    {
      requireCreator: true,
      response: {
        200: CreatorMatchesModel.listResponse,
        401: CreatorMatchesModel.errorResponse,
        403: CreatorMatchesModel.errorResponse,
      },
      detail: {
        summary: 'Список матчей в статусе fighting (только creator)',
      },
    }
  )
  .get(
    '/:id',
    async ({ params, status }) => {
      const result = await CreatorMatchesService.getDetail(params.id);
      if (!result.ok) {
        return status(result.status, { message: result.message });
      }
      return result.detail;
    },
    {
      requireCreator: true,
      params: t.Object({ id: t.String() }),
      response: {
        200: CreatorMatchesModel.matchDetail,
        401: CreatorMatchesModel.errorResponse,
        403: CreatorMatchesModel.errorResponse,
        404: CreatorMatchesModel.errorResponse,
      },
      detail: {
        summary: 'Снимок боя для редактора (только creator)',
      },
    }
  )
  .patch(
    '/:id/units/:unitId',
    async ({ params, body, status }) => {
      const result = await CreatorMatchesService.patchUnit({
        matchId: params.id,
        unitId: params.unitId,
        patch: body,
      });
      if (!result.ok) {
        return status(result.status, { message: result.message });
      }
      return result.detail;
    },
    {
      requireCreator: true,
      params: t.Object({ id: t.String(), unitId: t.String() }),
      body: CreatorMatchesModel.unitPatchBody,
      response: {
        200: CreatorMatchesModel.matchDetail,
        400: CreatorMatchesModel.errorResponse,
        401: CreatorMatchesModel.errorResponse,
        403: CreatorMatchesModel.errorResponse,
        404: CreatorMatchesModel.errorResponse,
      },
      detail: {
        summary: 'Правка статов юнита в живом BattleState (только creator)',
      },
    }
  );
