import { t } from 'elysia';

export namespace AuthModel {
  export const providerPublic = t.Object({
    id: t.String(),
    label: t.String(),
  });
  export type providerPublic = typeof providerPublic.static;

  export const providersResponse = t.Object({
    items: t.Array(providerPublic),
  });
  export type providersResponse = typeof providersResponse.static;

  export const providerParams = t.Object({
    provider: t.String(),
  });
  export type providerParams = typeof providerParams.static;

  export const callbackQuery = t.Object({
    code: t.Optional(t.String()),
    state: t.Optional(t.String()),
    error: t.Optional(t.String()),
  });
  export type callbackQuery = typeof callbackQuery.static;

  export const errorResponse = t.Object({
    message: t.String(),
  });
  export type errorResponse = typeof errorResponse.static;

  export const logoutResponse = t.Object({
    ok: t.Boolean(),
  });
  export type logoutResponse = typeof logoutResponse.static;
}
