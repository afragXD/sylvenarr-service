import { t } from 'elysia';

export namespace RatingModel {
  export const ratingRow = t.Object({
    playerId: t.String(),
    displayName: t.String(),
    wins: t.Number(),
    games: t.Number(),
    winrate: t.Number(),
  });
  export type ratingRow = typeof ratingRow.static;

  export const listResponse = t.Object({
    items: t.Array(ratingRow),
  });
  export type listResponse = typeof listResponse.static;
}
