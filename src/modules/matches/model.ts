import { t } from 'elysia';

export namespace MatchesModel {
  export const matchStatus = t.Union([
    t.Literal('waiting'),
    t.Literal('ready'),
    t.Literal('drafting'),
    t.Literal('drafted'),
    t.Literal('fighting'),
    t.Literal('finished'),
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

  export const battleUnit = t.Object({
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
    defending: t.Boolean(),
    attackStyle: t.Union([t.Literal('melee'), t.Literal('ranged'), t.Literal('magic')]),
  });
  export type battleUnit = typeof battleUnit.static;

  export const battleState = t.Object({
    stage: t.Number(),
    activeUnitId: t.Nullable(t.String()),
    turnPlayerId: t.Nullable(t.String()),
    outcome: t.Union([
      t.Literal('ongoing'),
      t.Literal('host_win'),
      t.Literal('guest_win'),
      t.Literal('draw'),
    ]),
    winnerPlayerId: t.Nullable(t.String()),
    log: t.Array(t.String()),
    legalTargetIds: t.Array(t.String()),
    skillLabel: t.Nullable(t.String()),
    legalSkillTargetIds: t.Array(t.String()),
    units: t.Array(battleUnit),
  });
  export type battleState = typeof battleState.static;

  export const match = t.Object({
    id: t.String(),
    status: matchStatus,
    inviteCode: t.String(),
    host: playerBrief,
    guest: t.Nullable(playerBrief),
    createdAt: t.String(),
    finishedAt: t.Nullable(t.String()),
    winnerPlayerId: t.Nullable(t.String()),
    draft: draftState,
    battle: t.Nullable(battleState),
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

  export const pickIdParams = t.Object({
    id: t.String(),
    pickId: t.String(),
  });
  export type pickIdParams = typeof pickIdParams.static;

  export const movePickBody = t.Object({
    row: t.Number({ minimum: 0, maximum: 1 }),
  });
  export type movePickBody = typeof movePickBody.static;

  export const battleActionBody = t.Object({
    unitId: t.String(),
    action: t.Union([
      t.Literal('attack'),
      t.Literal('defend'),
      t.Literal('wait'),
      t.Literal('skill'),
    ]),
    targetId: t.Optional(t.String()),
  });
  export type battleActionBody = typeof battleActionBody.static;

  export const matchHistoryItem = t.Object({
    id: t.String(),
    result: t.Union([t.Literal('win'), t.Literal('loss'), t.Literal('draw')]),
    opponentName: t.String(),
    finishedAt: t.String(),
    heroCodes: t.Array(t.String()),
  });
  export type matchHistoryItem = typeof matchHistoryItem.static;

  export const errorResponse = t.Object({
    message: t.String(),
  });
  export type errorResponse = typeof errorResponse.static;
}
