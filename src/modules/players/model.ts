import { t } from 'elysia';

export namespace PlayersModel {
  export const player = t.Object({
    id: t.String(),
    displayName: t.String(),
    createdAt: t.String(),
  });
  export type player = typeof player.static;

  export const createBody = t.Object({
    displayName: t.Optional(t.String({ minLength: 1, maxLength: 40 })),
  });
  export type createBody = typeof createBody.static;

  export const errorResponse = t.Object({
    message: t.String(),
  });
  export type errorResponse = typeof errorResponse.static;
}
