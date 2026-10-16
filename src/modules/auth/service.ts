import { config } from '../../config';
import { prisma } from '../../shared/db';
import type { Prisma } from '../../shared/generated/prisma/client';
import { isDev } from '../../utils/isDev';
import type { PlayersModel } from '../players/model';
import { PlayersService } from '../players/service';
import type { OAuthProfile } from './providers/types';

export abstract class AuthService {
  /**
   * URL редиректа после успешного OAuth.
   */
  static successRedirectUrl(): string {
    return (
      config.AUTH_SUCCESS_REDIRECT ||
      (isDev ? config.LOCAL_FRONTEND_URL : config.FRONTEND_URL) ||
      config.FRONTEND_URL
    );
  }

  /**
   * URL редиректа при ошибке OAuth.
   */
  static errorRedirectUrl(reason?: string): string {
    const frontendBase = isDev ? config.LOCAL_FRONTEND_URL : config.FRONTEND_URL;
    const base = config.AUTH_ERROR_REDIRECT || `${frontendBase.replace(/\/$/, '')}/sign-in`;
    const url = new URL(base);
    url.searchParams.set('auth', 'error');
    if (reason) {
      url.searchParams.set('reason', reason.slice(0, 80));
    }
    return url.toString();
  }

  /**
   * Создаёт или обновляет Player + OAuthAccount по профилю провайдера.
   */
  static async upsertOAuthPlayer(
    provider: string,
    profile: OAuthProfile
  ): Promise<PlayersModel.player> {
    const existingAccount = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId: profile.providerUserId,
        },
      },
      select: { playerId: true },
    });

    if (existingAccount) {
      await prisma.player.update({
        where: { id: existingAccount.playerId },
        data: {
          displayName: profile.displayName,
          email: profile.email,
          avatarUrl: profile.avatarUrl,
        },
      });
      await prisma.oAuthAccount.update({
        where: {
          provider_providerUserId: {
            provider,
            providerUserId: profile.providerUserId,
          },
        },
        data: {
          email: profile.email,
          rawProfile: profile.raw as Prisma.InputJsonValue,
        },
      });
      const player = await PlayersService.findAuthenticatedById(existingAccount.playerId);
      if (!player) {
        throw new Error('Не удалось загрузить игрока после OAuth');
      }
      return player;
    }

    const created = await prisma.player.create({
      data: {
        displayName: profile.displayName,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
        oauthAccounts: {
          create: {
            provider,
            providerUserId: profile.providerUserId,
            email: profile.email,
            rawProfile: profile.raw as Prisma.InputJsonValue,
          },
        },
      },
      select: { id: true },
    });

    const player = await PlayersService.findAuthenticatedById(created.id);
    if (!player) {
      throw new Error('Не удалось загрузить созданного игрока');
    }
    return player;
  }
}
