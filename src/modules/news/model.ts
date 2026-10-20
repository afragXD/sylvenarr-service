import { t } from 'elysia';

export namespace NewsModel {
  export const category = t.Union([
    t.Literal('announcement'),
    t.Literal('devlog'),
    t.Literal('update'),
    t.Literal('fix'),
  ]);
  export type category = typeof category.static;

  export const newsItem = t.Object({
    id: t.String(),
    slug: t.String(),
    title: t.String(),
    summary: t.String(),
    body: t.String(),
    category,
    coverUrl: t.Nullable(t.String()),
    publishedAt: t.Nullable(t.String()),
    authorId: t.Nullable(t.String()),
    createdAt: t.String(),
    updatedAt: t.String(),
  });
  export type newsItem = typeof newsItem.static;

  export const newsSummary = t.Object({
    id: t.String(),
    slug: t.String(),
    title: t.String(),
    summary: t.String(),
    category,
    coverUrl: t.Nullable(t.String()),
    publishedAt: t.Nullable(t.String()),
  });
  export type newsSummary = typeof newsSummary.static;

  export const listResponse = t.Object({
    items: t.Array(newsSummary),
    nextCursor: t.Nullable(t.String()),
  });
  export type listResponse = typeof listResponse.static;

  export const createBody = t.Object({
    slug: t.String({ minLength: 1, maxLength: 120 }),
    title: t.String({ minLength: 1, maxLength: 200 }),
    summary: t.String({ minLength: 1, maxLength: 500 }),
    body: t.String({ minLength: 1 }),
    category: t.Optional(category),
    coverUrl: t.Optional(t.Nullable(t.String())),
    publishedAt: t.Optional(t.Nullable(t.String())),
  });
  export type createBody = typeof createBody.static;

  export const updateBody = t.Object({
    slug: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
    title: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
    summary: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
    body: t.Optional(t.String({ minLength: 1 })),
    category: t.Optional(category),
    coverUrl: t.Optional(t.Nullable(t.String())),
    publishedAt: t.Optional(t.Nullable(t.String())),
  });
  export type updateBody = typeof updateBody.static;

  export const errorResponse = t.Object({
    message: t.String(),
  });
  export type errorResponse = typeof errorResponse.static;
}
