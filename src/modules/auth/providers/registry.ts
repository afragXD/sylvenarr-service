import type { OAuthProviderAdapter, OAuthProviderPublic } from './types';
import { createYandexProvider } from './yandex';

const adapters: OAuthProviderAdapter[] = [createYandexProvider()].filter(
  (adapter): adapter is OAuthProviderAdapter => adapter !== null
);

const byId = new Map(adapters.map((adapter) => [adapter.id, adapter]));

/**
 * Список включённых OAuth-провайдеров (есть credentials в env).
 */
export function listEnabledProviders(): OAuthProviderPublic[] {
  return adapters.map((adapter) => ({ id: adapter.id, label: adapter.label }));
}

/**
 * Возвращает адаптер по id или null, если выключен / неизвестен.
 */
export function getProvider(providerId: string): OAuthProviderAdapter | null {
  return byId.get(providerId) ?? null;
}
