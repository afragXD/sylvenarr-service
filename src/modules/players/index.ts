import { Elysia } from 'elysia';
import { playerSessionPlugin } from '../../shared/plugins/player-session';
import { PlayersModel } from './model';

export const playersController = new Elysia({ prefix: '/players', tags: ['Players'] })
  .use(playerSessionPlugin)
  .get(
    '/me',
    async ({ player }) => {
      return player;
    },
    {
      requireAuth: true,
      response: {
        200: PlayersModel.player,
        401: PlayersModel.errorResponse,
      },
      detail: {
        summary: 'Текущий авторизованный игрок из cookie',
      },
    }
  );
