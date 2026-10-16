import { Elysia, t } from 'elysia';

import { playerSessionPlugin } from '../../shared/plugins/player-session';
import { MatchesService } from '../matches/service';
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
  );
