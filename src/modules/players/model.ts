import { t } from 'elysia';

export namespace PlayersModel {
  export const player = t.Object({
    id: t.String(),
    displayName: t.String(),
    email: t.Nullable(t.String()),
    avatarUrl: t.Nullable(t.String()),
    providers: t.Array(t.String()),
    createdAt: t.String(),
  });
  export type player = typeof player.static;

  export const errorResponse = t.Object({
    message: t.String(),
  });
  export type errorResponse = typeof errorResponse.static;
}
