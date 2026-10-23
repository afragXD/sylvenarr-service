import { t } from 'elysia';

export namespace HeroesModel {
  export const heroClass = t.Object({
    code: t.String(),
    displayName: t.String(),
    description: t.String(),
    roleSummary: t.String(),
    health: t.Number(),
    damage: t.Number(),
    armor: t.Number(),
    initiative: t.Number(),
    dodge: t.Number(),
    luck: t.Number(),
    morale: t.Number(),
    mana: t.Number(),
    maxMana: t.Number(),
    power: t.Number(),
    gold: t.Number(),
    accuracy: t.Number(),
    size: t.Number(),
    isPlayable: t.Boolean(),
    sortOrder: t.Number(),
  });
  export type heroClass = typeof heroClass.static;

  export const listQuery = t.Object({
    playableOnly: t.Optional(t.Boolean()),
  });
  export type listQuery = typeof listQuery.static;

  export const listResponse = t.Object({
    items: t.Array(heroClass),
  });
  export type listResponse = typeof listResponse.static;

  export const codeParams = t.Object({
    code: t.String(),
  });
  export type codeParams = typeof codeParams.static;

  export const favoriteHero = t.Object({
    code: t.String(),
    displayName: t.String(),
    pickCount: t.Number(),
  });
  export type favoriteHero = typeof favoriteHero.static;

  export const favoritesQuery = t.Object({
    limit: t.Optional(t.Number({ minimum: 1, maximum: 24 })),
  });
  export type favoritesQuery = typeof favoritesQuery.static;

  export const favoritesResponse = t.Array(favoriteHero);
  export type favoritesResponse = typeof favoritesResponse.static;

  export const errorResponse = t.Object({
    message: t.String(),
  });
  export type errorResponse = typeof errorResponse.static;
}
