import { Elysia } from 'elysia';
import { OAUTH_STATE_COOKIE_NAME, PLAYER_COOKIE_NAME } from '../../shared/constants/session';
import { isDev } from '../../utils/isDev';
import { AuthModel } from './model';
import { getProvider, listEnabledProviders } from './providers/registry';
import { AuthService } from './service';

const sessionCookieOptions = {
  httpOnly: true,
  path: '/',
  sameSite: isDev ? ('lax' as const) : ('none' as const),
  secure: !isDev,
  maxAge: 60 * 60 * 24 * 365,
};

const stateCookieOptions = {
  httpOnly: true,
  path: '/',
  sameSite: isDev ? ('lax' as const) : ('none' as const),
  secure: !isDev,
  maxAge: 60 * 10,
};

export const authController = new Elysia({ prefix: '/auth', tags: ['Auth'] })
  .get(
    '/providers',
    () => ({
      items: listEnabledProviders(),
    }),
    {
      response: {
        200: AuthModel.providersResponse,
      },
      detail: {
        summary: 'Список включённых OAuth-провайдеров',
      },
    }
  )
  .get(
    '/:provider',
    ({ params, cookie, status, redirect }) => {
      const adapter = getProvider(params.provider);
      if (!adapter) {
        return status(404, { message: 'Провайдер не найден или отключён' });
      }
      const state = crypto.randomUUID();
      cookie[OAUTH_STATE_COOKIE_NAME].set({
        value: state,
        ...stateCookieOptions,
      });
      return redirect(adapter.getAuthorizationUrl(state));
    },
    {
      params: AuthModel.providerParams,
      response: {
        404: AuthModel.errorResponse,
      },
      detail: {
        summary: 'Старт OAuth: редирект на провайдера',
      },
    }
  )
  .get(
    '/:provider/callback',
    async ({ params, query, cookie, redirect }) => {
      const adapter = getProvider(params.provider);
      if (!adapter) {
        return redirect(AuthService.errorRedirectUrl('unknown_provider'));
      }
      if (query.error) {
        return redirect(AuthService.errorRedirectUrl(query.error));
      }
      if (!query.code || !query.state) {
        return redirect(AuthService.errorRedirectUrl('missing_code'));
      }
      const expectedState: unknown = cookie[OAUTH_STATE_COOKIE_NAME]?.value;
      cookie[OAUTH_STATE_COOKIE_NAME].remove();
      if (typeof expectedState !== 'string' || expectedState !== query.state) {
        return redirect(AuthService.errorRedirectUrl('invalid_state'));
      }
      try {
        const profile = await adapter.exchangeCode(query.code);
        const player = await AuthService.upsertOAuthPlayer(adapter.id, profile);
        cookie[PLAYER_COOKIE_NAME].set({
          value: player.id,
          ...sessionCookieOptions,
        });
        return redirect(AuthService.successRedirectUrl());
      } catch (error) {
        console.error('[auth] OAuth callback failed', error);
        return redirect(AuthService.errorRedirectUrl('exchange_failed'));
      }
    },
    {
      params: AuthModel.providerParams,
      query: AuthModel.callbackQuery,
      detail: {
        summary: 'OAuth callback: обмен code и установка сессии',
      },
    }
  )
  .post(
    '/logout',
    ({ cookie }) => {
      cookie[PLAYER_COOKIE_NAME].remove();
      cookie[OAUTH_STATE_COOKIE_NAME].remove();
      return { ok: true };
    },
    {
      response: {
        200: AuthModel.logoutResponse,
      },
      detail: {
        summary: 'Выход: очистка cookie сессии',
      },
    }
  );
