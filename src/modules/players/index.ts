import { Elysia } from 'elysia';
import { PLAYER_COOKIE_NAME } from '../../shared/constants/session';
import { playerSessionPlugin } from '../../shared/plugins/player-session';
import { isDev } from '../../utils/isDev';
import { PlayersModel } from './model';
import { PlayersService } from './service';

export const playersController = new Elysia({ prefix: '/players', tags: ['Players'] })
  .use(playerSessionPlugin)
  .post(
    '',
    async ({ body, cookie }) => {
      const existingId: unknown = cookie[PLAYER_COOKIE_NAME]?.value;
      if (typeof existingId === 'string' && existingId.length > 0) {
        const existing = await PlayersService.findById(existingId);
        if (existing) {
          return existing;
        }
      }
      const player = await PlayersService.createGuest(body.displayName);
      cookie[PLAYER_COOKIE_NAME].set({
        value: player.id,
        httpOnly: true,
        path: '/',
        sameSite: isDev ? 'lax' : 'none',
        secure: !isDev,
        maxAge: 60 * 60 * 24 * 365,
      });
      return player;
    },
    {
      body: PlayersModel.createBody,
      response: {
        200: PlayersModel.player,
      },
      detail: {
        summary: 'Создать или вернуть гостевого игрока (cookie)',
      },
    }
  )
  .get(
    '/me',
    async ({ player }) => {
      return player;
    },
    {
      requirePlayer: true,
      response: {
        200: PlayersModel.player,
        401: PlayersModel.errorResponse,
      },
      detail: {
        summary: 'Текущий игрок из cookie',
      },
    }
  );
