import { t } from 'elysia';

export namespace ItemsModel {
  export const itemTarget = t.Union([
    t.Literal('self'),
    t.Literal('ally'),
    t.Literal('allySummon'),
    t.Literal('enemy'),
    t.Literal('enemySummon'),
    t.Literal('sellOnly'),
  ]);
  export type itemTarget = typeof itemTarget.static;

  export const itemBrief = t.Object({
    code: t.Number(),
    name: t.String(),
    description: t.String(),
    cost: t.Number(),
    category: t.Number(),
    tier: t.Number(),
    target: itemTarget,
    sellOnly: t.Boolean(),
  });
  export type itemBrief = typeof itemBrief.static;

  export const perkBrief = t.Object({
    id: t.String(),
    name: t.String(),
    description: t.String(),
    kind: t.Union([t.Literal('item'), t.Literal('other')]),
    category: t.Optional(t.Number()),
  });
  export type perkBrief = typeof perkBrief.static;

  export const itemsResponse = t.Object({
    items: t.Array(itemBrief),
  });
  export type itemsResponse = typeof itemsResponse.static;

  export const perksResponse = t.Object({
    items: t.Array(perkBrief),
  });
  export type perksResponse = typeof perksResponse.static;
}
