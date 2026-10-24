import { t } from 'elysia';

export namespace PresetsModel {
  export const errorResponse = t.Object({ message: t.String() });
  export type errorResponse = typeof errorResponse.static;

  export const slotInput = t.Object({
    heroClassCode: t.String(),
    row: t.Number(),
  });
  export type slotInput = typeof slotInput.static;

  export const slot = t.Object({
    id: t.String(),
    heroClassCode: t.String(),
    displayName: t.String(),
    size: t.Number(),
    row: t.Number(),
    slotOrder: t.Number(),
  });
  export type slot = typeof slot.static;

  export const preset = t.Object({
    id: t.String(),
    name: t.String(),
    teamSize: t.Number(),
    isGlobal: t.Boolean(),
    catalogCode: t.Nullable(t.String()),
    slots: t.Array(slot),
    createdAt: t.String(),
    updatedAt: t.String(),
  });
  export type preset = typeof preset.static;

  export const createBody = t.Object({
    name: t.String({ minLength: 1, maxLength: 40 }),
    slots: t.Array(slotInput, { minItems: 1 }),
    global: t.Optional(t.Boolean()),
  });
  export type createBody = typeof createBody.static;

  export const updateBody = t.Object({
    name: t.Optional(t.String({ minLength: 1, maxLength: 40 })),
    slots: t.Optional(t.Array(slotInput, { minItems: 1 })),
  });
  export type updateBody = typeof updateBody.static;

  export const listQuery = t.Object({
    teamSize: t.Optional(t.String()),
    scope: t.Optional(
      t.Union([t.Literal('mine'), t.Literal('global'), t.Literal('all')])
    ),
  });
  export type listQuery = typeof listQuery.static;

  export const idParams = t.Object({ id: t.String() });
  export type idParams = typeof idParams.static;
}
