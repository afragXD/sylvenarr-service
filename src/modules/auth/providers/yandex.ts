import { config } from '../../../config';
import type { OAuthProfile, OAuthProviderAdapter } from './types';

const AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize';
const TOKEN_URL = 'https://oauth.yandex.ru/token';
const INFO_URL = 'https://login.yandex.ru/info';

type YandexTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type YandexInfoResponse = {
  id?: string;
  login?: string;
  display_name?: string;
  real_name?: string;
  default_email?: string;
  default_avatar_id?: string;
  is_avatar_empty?: boolean;
};

/**
 * Адаптер Yandex ID (OAuth 2.0 authorization code).
 */
export const createYandexProvider = (): OAuthProviderAdapter | null => {
  const clientId = config.YANDEX_CLIENT_ID;
  const clientSecret = config.YANDEX_CLIENT_SECRET;
  const redirectUri = config.YANDEX_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return {
    id: 'yandex',
    label: 'Яндекс',
    getAuthorizationUrl(state: string): string {
      const url = new URL(AUTHORIZE_URL);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('state', state);
      url.searchParams.set('force_confirm', 'yes');
      return url.toString();
    },
    async exchangeCode(code: string): Promise<OAuthProfile> {
      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
      });
      const tokenResponse = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString(),
      });
      const tokenJson = (await tokenResponse.json()) as YandexTokenResponse;
      if (!tokenResponse.ok || !tokenJson.access_token) {
        throw new Error(
          tokenJson.error_description || tokenJson.error || 'Не удалось получить токен Яндекса'
        );
      }

      const infoResponse = await fetch(`${INFO_URL}?format=json`, {
        headers: { Authorization: `OAuth ${tokenJson.access_token}` },
      });
      const info = (await infoResponse.json()) as YandexInfoResponse;
      if (!infoResponse.ok || !info.id) {
        throw new Error('Не удалось получить профиль Яндекса');
      }

      const displayName =
        info.display_name?.trim() ||
        info.real_name?.trim() ||
        info.login?.trim() ||
        `Игрок-${info.id.slice(0, 6)}`;

      let avatarUrl: string | null = null;
      if (info.default_avatar_id && !info.is_avatar_empty) {
        avatarUrl = `https://avatars.yandex.net/get-yapic/${info.default_avatar_id}/islands-200`;
      }

      return {
        providerUserId: info.id,
        email: info.default_email ?? null,
        displayName,
        avatarUrl,
        raw: info,
      };
    },
  };
};
