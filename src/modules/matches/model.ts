import { t } from 'elysia';

export namespace MatchesModel {
  export const matchStatus = t.Union([
    t.Literal('waiting'),
    t.Literal('ready'),
    t.Literal('drafting'),
    t.Literal('drafted'),
    t.Literal('cancelled'),
  ]);
  export type matchStatus = typeof matchStatus.static;

  export const playerBrief = t.Object({
    id: t.String(),
    displayName: t.String(),
  });
  export type playerBrief = typeof playerBrief.static;

  export const draftPick = t.Object({
    id: t.String(),
    playerId: t.String(),
    heroClassCode: t.String(),
    displayName: t.String(),
    size: t.Number(),
    row: t.Number(),
    pickOrder: t.Number(),
  });
  export type draftPick = typeof draftPick.static;

  export const draftState = t.Object({
    turnPlayerId: t.Nullable(t.String()),
    hostPicks: t.Array(draftPick),
    guestPicks: t.Array(draftPick),
    hostSize: t.Number(),
    guestSize: t.Number(),
    initialTeamSize: t.Number(),
  });
  export type draftState = typeof draftState.static;

  export const match = t.Object({
    id: t.String(),
    status: matchStatus,
    inviteCode: t.String(),
    host: playerBrief,
    guest: t.Nullable(playerBrief),
    createdAt: t.String(),
    draft: draftState,
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

  export const pickBody = t.Object({
    heroCode: t.String({ minLength: 1, maxLength: 64 }),
    row: t.Number({ minimum: 0, maximum: 1 }),
  });
  export type pickBody = typeof pickBody.static;

  export const randomBody = t.Object({
    row: t.Optional(t.Number({ minimum: 0, maximum: 1 })),
  });
  export type randomBody = typeof randomBody.static;

  export const errorResponse = t.Object({
    message: t.String(),
  });
  export type errorResponse = typeof errorResponse.static;
}
