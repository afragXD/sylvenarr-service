import { t } from 'elysia';

export namespace RatingModel {
  export const ratingRow = t.Object({
    playerId: t.String(),
    displayName: t.String(),
    pts: t.Number(),
    wins: t.Number(),
    losses: t.Number(),
    draws: t.Number(),
    games: t.Number(),
  });
  export type ratingRow = typeof ratingRow.static;

  export const listResponse = t.Object({
    items: t.Array(ratingRow),
  });
  export type listResponse = typeof listResponse.static;
}
