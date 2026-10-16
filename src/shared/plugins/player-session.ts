import { Elysia } from 'elysia';
import { PlayersService } from '../../modules/players/service';
import { PLAYER_COOKIE_NAME } from '../constants/session';

/**
 * Макрос requireAuth: cookie → Player с OAuthAccount, иначе 401.
 */
export const playerSessionPlugin = new Elysia({ name: 'player-session' }).macro({
  requireAuth: {
    async resolve({ cookie, status }) {
      const rawValue: unknown = cookie[PLAYER_COOKIE_NAME]?.value;
      if (typeof rawValue !== 'string' || rawValue.length === 0) {
        return status(401, {
          message: 'Требуется авторизация через OAuth',
        });
      }
      const player = await PlayersService.findAuthenticatedById(rawValue);
      if (!player) {
        return status(401, { message: 'Сессия недействительна. Войдите снова' });
      }
      return { player };
    },
  },
});
