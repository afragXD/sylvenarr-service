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

  export const matchRules = t.Object({
    initialTeamSize: t.Number(),
    maxTeamSize: t.Number(),
    maxRowSize: t.Number(),
    maxRounds: t.Number(),
    healthBonus: t.Number(),
    startingLevel: t.Number(),
    fairEnabled: t.Boolean(),
    fairFrequency: t.Number(),
    shopSize: t.Number(),
    goldBonus: t.Number(),
    heroDupes: t.Union([
      t.Literal('allow'),
      t.Literal('uniqueTeam'),
      t.Literal('uniqueMatch'),
    ]),
  });
  export type matchRules = typeof matchRules.static;

  export const createBody = t.Object({
    rules: t.Optional(t.Partial(matchRules)),
  });
  export type createBody = typeof createBody.static;

  export const battleEffect = t.Object({
    id: t.String(),
    rounds: t.Number(),
    power: t.Number(),
  });
  export type battleEffect = typeof battleEffect.static;

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
    effects: t.Array(battleEffect),
    isSummon: t.Boolean(),
    horseIsDead: t.Boolean(),
    mana: t.Number(),
    damage: t.Number(),
    armor: t.Number(),
    initiative: t.Number(),
    dodge: t.Number(),
    luck: t.Number(),
    accuracy: t.Number(),
    power: t.Number(),
    gold: t.Number(),
    critBank: t.Number(),
    ultaCharges: t.Number(),
    lvl: t.Number(),
  });
  export type battleUnit = typeof battleUnit.static;

  export const turnOrderEntry = t.Object({
    unitId: t.String(),
    displayName: t.String(),
    heroClassCode: t.String(),
    team: t.Union([t.Literal(0), t.Literal(1)]),
    alive: t.Boolean(),
    isActive: t.Boolean(),
    phase: t.Union([
      t.Literal('acted'),
      t.Literal('active'),
      t.Literal('waiting'),
      t.Literal('delayed'),
      t.Literal('dead'),
    ]),
    lvl: t.Number(),
  });
  export type turnOrderEntry = typeof turnOrderEntry.static;

  export const abilityInfo = t.Object({
    slot: t.Union([
      t.Literal(1),
      t.Literal(2),
      t.Literal(3),
      t.Literal(4),
      t.Literal(5),
    ]),
    label: t.String(),
    needsTarget: t.Boolean(),
    disabledReason: t.Nullable(t.String()),
    legalTargetIds: t.Array(t.String()),
  });
  export type abilityInfo = typeof abilityInfo.static;

  export const pendingPrompt = t.Object({
    unitId: t.String(),
    kind: t.String(),
    slot: t.Union([
      t.Literal(1),
      t.Literal(2),
      t.Literal(3),
      t.Literal(4),
      t.Literal(5),
    ]),
    options: t.Array(
      t.Object({
        id: t.String(),
        label: t.String(),
        description: t.Optional(t.String()),
      })
    ),
  });
  export type pendingPrompt = typeof pendingPrompt.static;

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
    turnOrder: t.Array(turnOrderEntry),
    legalTargetIds: t.Array(t.String()),
    skillLabel: t.Nullable(t.String()),
    legalSkillTargetIds: t.Array(t.String()),
    abilities: t.Array(abilityInfo),
    pendingPrompt: t.Nullable(pendingPrompt),
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
    rules: matchRules,
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
      t.Literal('ability'),
      t.Literal('move'),
    ]),
    targetId: t.Optional(t.String()),
    slot: t.Optional(
      t.Union([t.Literal(1), t.Literal(2), t.Literal(3), t.Literal(4), t.Literal(5)])
    ),
    choice: t.Optional(t.String()),
  });
  export type battleActionBody = typeof battleActionBody.static;

  export const matchHistoryItem = t.Object({
    id: t.String(),
    result: t.Union([t.Literal('win'), t.Literal('loss'), t.Literal('draw')]),
    opponentName: t.String(),
    finishedAt: t.String(),
    durationSeconds: t.Nullable(t.Number()),
  });
  export type matchHistoryItem = typeof matchHistoryItem.static;

  export const matchHistoryUnit = t.Object({
    pickId: t.String(),
    heroClassCode: t.String(),
    displayName: t.String(),
    row: t.Number(),
    column: t.Number(),
    maxHp: t.Number(),
    health: t.Number(),
    alive: t.Boolean(),
    damage: t.Number(),
    armor: t.Number(),
    initiative: t.Number(),
    lvl: t.Optional(t.Number()),
  });
  export type matchHistoryUnit = typeof matchHistoryUnit.static;

  export const matchHistoryTeam = t.Object({
    playerId: t.String(),
    displayName: t.String(),
    units: t.Array(matchHistoryUnit),
  });
  export type matchHistoryTeam = typeof matchHistoryTeam.static;

  export const matchHistoryDetail = t.Object({
    id: t.String(),
    result: t.Union([t.Literal('win'), t.Literal('loss'), t.Literal('draw')]),
    opponentName: t.String(),
    finishedAt: t.String(),
    durationSeconds: t.Nullable(t.Number()),
    stage: t.Nullable(t.Number()),
    outcome: t.Nullable(
      t.Union([t.Literal('host_win'), t.Literal('guest_win'), t.Literal('draw')])
    ),
    hasSnapshot: t.Boolean(),
    log: t.Array(t.String()),
    host: matchHistoryTeam,
    guest: matchHistoryTeam,
  });
  export type matchHistoryDetail = typeof matchHistoryDetail.static;

  export const errorResponse = t.Object({
    message: t.String(),
  });
  export type errorResponse = typeof errorResponse.static;
}
