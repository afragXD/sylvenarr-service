import { t } from 'elysia';

import { MatchesModel } from '../matches/model';

export namespace PlayersModel {
  export const playerRole = t.Union([t.Literal('player'), t.Literal('admin')]);
  export type playerRole = typeof playerRole.static;

  export const player = t.Object({
    id: t.String(),
    displayName: t.String(),
    email: t.Nullable(t.String()),
    avatarUrl: t.Nullable(t.String()),
    role: playerRole,
    providers: t.Array(t.String()),
    createdAt: t.String(),
  });
  export type player = typeof player.static;

  export const matchHistoryItem = MatchesModel.matchHistoryItem;
  export type matchHistoryItem = MatchesModel.matchHistoryItem;

  export const matchHistoryDetail = MatchesModel.matchHistoryDetail;
  export type matchHistoryDetail = MatchesModel.matchHistoryDetail;

  export const errorResponse = t.Object({
    message: t.String(),
  });
  export type errorResponse = typeof errorResponse.static;
}
