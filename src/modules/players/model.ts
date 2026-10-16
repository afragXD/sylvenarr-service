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

  export const matchHistoryItem = t.Object({
    id: t.String(),
    result: t.Union([t.Literal('win'), t.Literal('loss'), t.Literal('draw')]),
    opponentName: t.String(),
    finishedAt: t.String(),
    heroCodes: t.Array(t.String()),
  });
  export type matchHistoryItem = typeof matchHistoryItem.static;

  export const errorResponse = t.Object({
    message: t.String(),
  });
  export type errorResponse = typeof errorResponse.static;
}
