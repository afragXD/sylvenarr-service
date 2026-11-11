import { t } from 'elysia';

export namespace CreatorMatchesModel {
  export const errorResponse = t.Object({
    message: t.String(),
  });
  export type errorResponse = typeof errorResponse.static;

  export const matchListItem = t.Object({
    id: t.String(),
    hostDisplayName: t.String(),
    guestDisplayName: t.Nullable(t.String()),
    stage: t.Nullable(t.Number()),
    status: t.Literal('fighting'),
  });
  export type matchListItem = typeof matchListItem.static;

  export const listResponse = t.Array(matchListItem);
  export type listResponse = typeof listResponse.static;

  export const unitPatchBody = t.Object({
    health: t.Optional(t.Number()),
    maxHp: t.Optional(t.Number()),
    damage: t.Optional(t.Number()),
    armor: t.Optional(t.Number()),
    initiative: t.Optional(t.Number()),
    dodge: t.Optional(t.Number()),
    luck: t.Optional(t.Number()),
    accuracy: t.Optional(t.Number()),
    power: t.Optional(t.Number()),
    mana: t.Optional(t.Number()),
    maxMana: t.Optional(t.Number()),
    morale: t.Optional(t.Number()),
    lvl: t.Optional(t.Number()),
    ultaCharges: t.Optional(t.Number()),
    critBank: t.Optional(t.Number()),
  });
  export type unitPatchBody = typeof unitPatchBody.static;

  /** Поля юнита для редактора (полный снимок статов MVP). */
  export const editorUnit = t.Object({
    id: t.String(),
    playerId: t.String(),
    team: t.Union([t.Literal(0), t.Literal(1)]),
    heroClassCode: t.String(),
    displayName: t.String(),
    row: t.Number(),
    column: t.Number(),
    health: t.Number(),
    maxHp: t.Number(),
    alive: t.Boolean(),
    damage: t.Number(),
    armor: t.Number(),
    initiative: t.Number(),
    dodge: t.Number(),
    luck: t.Number(),
    accuracy: t.Number(),
    power: t.Number(),
    mana: t.Number(),
    maxMana: t.Number(),
    morale: t.Number(),
    lvl: t.Number(),
    hiddenLvl: t.Number(),
    ultaCharges: t.Number(),
    critBank: t.Number(),
    isSummon: t.Boolean(),
  });
  export type editorUnit = typeof editorUnit.static;

  export const inventoryStack = t.Object({
    code: t.Number(),
    name: t.String(),
    description: t.String(),
    quantity: t.Number(),
    category: t.Number(),
    tier: t.Number(),
    target: t.Union([
      t.Literal('self'),
      t.Literal('ally'),
      t.Literal('allySummon'),
      t.Literal('enemy'),
      t.Literal('enemySummon'),
      t.Literal('sellOnly'),
    ]),
  });
  export type inventoryStack = typeof inventoryStack.static;

  export const editorTeam = t.Object({
    gold: t.Number(),
    inventory: t.Array(inventoryStack),
  });
  export type editorTeam = typeof editorTeam.static;

  export const inventoryStackPatch = t.Object({
    code: t.Number(),
    quantity: t.Number(),
  });
  export type inventoryStackPatch = typeof inventoryStackPatch.static;

  export const teamInventoryPatchBody = t.Object({
    inventory: t.Array(inventoryStackPatch),
  });
  export type teamInventoryPatchBody = typeof teamInventoryPatchBody.static;

  export const matchDetail = t.Object({
    id: t.String(),
    status: t.Literal('fighting'),
    hostDisplayName: t.String(),
    guestDisplayName: t.Nullable(t.String()),
    stage: t.Number(),
    phase: t.String(),
    activeUnitId: t.Nullable(t.String()),
    units: t.Array(editorUnit),
    teams: t.Tuple([editorTeam, editorTeam]),
  });
  export type matchDetail = typeof matchDetail.static;
}
