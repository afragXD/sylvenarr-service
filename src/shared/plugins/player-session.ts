import { Elysia } from 'elysia';
import { PlayersService } from '../../modules/players/service';
import { PLAYER_COOKIE_NAME } from '../constants/session';

/**
 * Макрос requirePlayer: загружает игрока из cookie или отвечает 401.
 */
export const playerSessionPlugin = new Elysia({ name: 'player-session' }).macro({
  requirePlayer: {
    async resolve({ cookie, status }) {
      const rawValue: unknown = cookie[PLAYER_COOKIE_NAME]?.value;
      if (typeof rawValue !== 'string' || rawValue.length === 0) {
        return status(401, {
          message: 'Требуется сессия игрока. Создайте гостя через POST /players',
        });
      }
      const player = await PlayersService.findById(rawValue);
      if (!player) {
        return status(401, { message: 'Сессия игрока недействительна' });
      }
      return { player };
    },
  },
});
