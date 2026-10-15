import { t } from 'elysia';

export namespace MatchesModel {
  export const matchStatus = t.Union([
    t.Literal('waiting'),
    t.Literal('ready'),
    t.Literal('cancelled'),
  ]);
  export type matchStatus = typeof matchStatus.static;

  export const playerBrief = t.Object({
    id: t.String(),
    displayName: t.String(),
  });
  export type playerBrief = typeof playerBrief.static;

  export const match = t.Object({
    id: t.String(),
    status: matchStatus,
    inviteCode: t.String(),
    host: playerBrief,
    guest: t.Nullable(playerBrief),
    createdAt: t.String(),
  });
  export type match = typeof match.static;

  export const joinBody = t.Object({
    inviteCode: t.String({ minLength: 4, maxLength: 16 }),
  });
  export type joinBody = typeof joinBody.static;

  export const idParams = t.Object({
    id: t.String(),
  });
  export type idParams = typeof idParams.static;

  export const errorResponse = t.Object({
    message: t.String(),
  });
  export type errorResponse = typeof errorResponse.static;
}
