import { Elysia, t } from 'elysia';

import { playerSessionPlugin } from '../../shared/plugins/player-session';
import { PresetsModel } from './model';
import { PresetsService } from './service';

export const presetsController = new Elysia({ prefix: '/presets', tags: ['Presets'] })
  .use(playerSessionPlugin)
  .get(
    '',
    async ({ query, player }) => {
      const teamSizeRaw = query.teamSize ? Number(query.teamSize) : null;
      const teamSize =
        teamSizeRaw !== null && Number.isFinite(teamSizeRaw) ? teamSizeRaw : null;
      return await PresetsService.list({
        playerId: player.id,
        teamSize,
        scope: query.scope,
      });
    },
    {
      requireAuth: true,
      query: PresetsModel.listQuery,
      response: {
        200: t.Array(PresetsModel.preset),
        401: PresetsModel.errorResponse,
      },
      detail: {
        summary: 'Список пресетов (свои + глобальные)',
      },
    }
  )
  .get(
    '/:id',
    async ({ params, status }) => {
      const preset = await PresetsService.getById(params.id);
      if (!preset) {
        return status(404, { message: 'Пресет не найден' });
      }
      return preset;
    },
    {
      requireAuth: true,
      params: PresetsModel.idParams,
      response: {
        200: PresetsModel.preset,
        401: PresetsModel.errorResponse,
        404: PresetsModel.errorResponse,
      },
      detail: {
        summary: 'Пресет по id',
      },
    }
  )
  .post(
    '',
    async ({ body, player, status }) => {
      const result = await PresetsService.create({
        playerId: player.id,
        isAdmin: player.role === 'admin',
        body,
      });
      if (!result.ok) {
        return status(result.status, { message: result.message });
      }
      return result.preset;
    },
    {
      requireAuth: true,
      body: PresetsModel.createBody,
      response: {
        200: PresetsModel.preset,
        400: PresetsModel.errorResponse,
        401: PresetsModel.errorResponse,
        403: PresetsModel.errorResponse,
      },
      detail: {
        summary: 'Создать пресет (global: true — только admin)',
      },
    }
  )
  .patch(
    '/:id',
    async ({ params, body, player, status }) => {
      const result = await PresetsService.update({
        presetId: params.id,
        playerId: player.id,
        isAdmin: player.role === 'admin',
        body,
      });
      if (!result.ok) {
        return status(result.status, { message: result.message });
      }
      return result.preset;
    },
    {
      requireAuth: true,
      params: PresetsModel.idParams,
      body: PresetsModel.updateBody,
      response: {
        200: PresetsModel.preset,
        400: PresetsModel.errorResponse,
        401: PresetsModel.errorResponse,
        403: PresetsModel.errorResponse,
        404: PresetsModel.errorResponse,
      },
      detail: {
        summary: 'Обновить пресет',
      },
    }
  )
  .delete(
    '/:id',
    async ({ params, player, status }) => {
      const result = await PresetsService.remove({
        presetId: params.id,
        playerId: player.id,
        isAdmin: player.role === 'admin',
      });
      if (!result.ok) {
        return status(result.status, { message: result.message });
      }
      return { ok: true as const };
    },
    {
      requireAuth: true,
      params: PresetsModel.idParams,
      response: {
        200: t.Object({ ok: t.Literal(true) }),
        401: PresetsModel.errorResponse,
        403: PresetsModel.errorResponse,
        404: PresetsModel.errorResponse,
      },
      detail: {
        summary: 'Удалить пресет',
      },
    }
  );

export { PresetsService } from './service';
export { PresetsModel } from './model';
