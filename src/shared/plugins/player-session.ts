import { Elysia } from 'elysia';
import { PlayersService } from '../../modules/players/service';
import { isCreatorRole, isStaffRole } from '../auth/roles';
import { PLAYER_COOKIE_NAME } from '../constants/session';

/**
 * Макросы requireAuth / requireAdmin / requireCreator: cookie → Player.
 * requireAdmin: admin или creator; requireCreator: только creator.
 */
export const playerSessionPlugin = new Elysia({ name: 'player-session' }).macro({
  requireAuth: {
    async resolve({ cookie, status }) {
      const rawValue: unknown = cookie[PLAYER_COOKIE_NAME]?.value;
      if (typeof rawValue !== 'string' || rawValue.length === 0) {
        return status(401, {
          message: 'Требуется авторизация',
        });
      }
      const player = await PlayersService.findAuthenticatedById(rawValue);
      if (!player) {
        return status(401, { message: 'Сессия недействительна. Войдите снова' });
      }
      return { player };
    },
  },
  requireAdmin: {
    async resolve({ cookie, status }) {
      const rawValue: unknown = cookie[PLAYER_COOKIE_NAME]?.value;
      if (typeof rawValue !== 'string' || rawValue.length === 0) {
        return status(401, {
          message: 'Требуется авторизация',
        });
      }
      const player = await PlayersService.findAuthenticatedById(rawValue);
      if (!player) {
        return status(401, { message: 'Сессия недействительна. Войдите снова' });
      }
      if (!isStaffRole(player.role)) {
        return status(403, { message: 'Недостаточно прав' });
      }
      return { player };
    },
  },
  requireCreator: {
    async resolve({ cookie, status }) {
      const rawValue: unknown = cookie[PLAYER_COOKIE_NAME]?.value;
      if (typeof rawValue !== 'string' || rawValue.length === 0) {
        return status(401, {
          message: 'Требуется авторизация',
        });
      }
      const player = await PlayersService.findAuthenticatedById(rawValue);
      if (!player) {
        return status(401, { message: 'Сессия недействительна. Войдите снова' });
      }
      if (!isCreatorRole(player.role)) {
        return status(403, { message: 'Недостаточно прав' });
      }
      return { player };
    },
  },
});
