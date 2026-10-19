import {
  applyAction,
  type BattleState,
  type BattleSummary,
  buildResultSnapshot,
  createBattleState,
  forceDraw,
  forceSurrender,
  getBattleStore,
  type HeroClassStats,
  type MatchResultSnapshot,
  publishBattle,
  toBattleSummary,
} from '../../game/combat';
import type { Prisma } from '../../shared/generated/prisma/client';
import {
  isDraftComplete,
  pickRandomValid,
  resolveTurnPlayerId,
  teamSize,
  validateMovePick,
  validatePick,
  type DraftLimits,
} from '../../game/draft/rules';
import type { DraftPick } from '../../game/draft/types';
import {
  type MatchRules,
  parseMatchRules,
  resolveMatchRules,
} from '../../game/matchRules';
import { prisma } from '../../shared/db';
import { createInviteCode } from '../../utils/create-invite-code';
import type { MatchesModel } from './model';

type PickRow = {
  id: string;
  playerId: string;
  heroClassCode: string;
  row: number;
  pickOrder: number;
  heroClass: { displayName: string; size: number };
};

type MatchRow = {
  id: string;
  status: MatchesModel.matchStatus;
  inviteCode: string;
  hostId: string;
  guestId: string | null;
  winnerPlayerId: string | null;
  finishedAt: Date | null;
  createdAt: Date;
  rules: unknown;
  host: { id: string; displayName: string };
  guest: { id: string; displayName: string } | null;
  picks: PickRow[];
};

function rulesOf(row: { rules: unknown }): MatchRules {
  return resolveMatchRules(row.rules);
}

function draftLimitsOf(row: { rules: unknown }): DraftLimits {
  const rules = rulesOf(row);
  return {
    initialTeamSize: rules.initialTeamSize,
    maxRowSize: rules.maxRowSize,
    heroDupes: rules.heroDupes,
  };
}

const matchInclude = {
  host: { select: { id: true, displayName: true } },
  guest: { select: { id: true, displayName: true } },
  picks: {
    orderBy: { pickOrder: 'asc' as const },
    select: {
      id: true,
      playerId: true,
      heroClassCode: true,
      row: true,
      pickOrder: true,
      heroClass: { select: { displayName: true, size: true } },
    },
  },
};

export abstract class MatchesService {
  /**
   * Пики матча → DraftPick[].
   */
  private static toDraftPicks(picks: ReadonlyArray<PickRow>): DraftPick[] {
    return picks.map((pick) => ({
      id: pick.id,
      playerId: pick.playerId,
      heroClassCode: pick.heroClassCode,
      displayName: pick.heroClass.displayName,
      size: pick.heroClass.size,
      row: pick.row,
      pickOrder: pick.pickOrder,
    }));
  }

  /**
   * Преобразует матч из БД в DTO с draft (+ battle при наличии).
   */
  static mapMatch(row: MatchRow, battle: BattleSummary | null = null): MatchesModel.match {
    const picks = MatchesService.toDraftPicks(row.picks);
    const rules = rulesOf(row);
    const limits = draftLimitsOf(row);
    const guestId = row.guestId ?? '';
    const hostSize = teamSize(picks, row.hostId);
    const guestSize = guestId ? teamSize(picks, guestId) : 0;
    const turnPlayerId =
      row.status === 'drafting' && row.guestId
        ? resolveTurnPlayerId(picks, row.hostId, row.guestId, limits)
        : null;

    return {
      id: row.id,
      status: row.status,
      inviteCode: row.inviteCode,
      host: row.host,
      guest: row.guest,
      createdAt: row.createdAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      winnerPlayerId: row.winnerPlayerId,
      rules,
      draft: {
        turnPlayerId,
        hostPicks: picks.filter((pick) => pick.playerId === row.hostId),
        guestPicks: guestId ? picks.filter((pick) => pick.playerId === guestId) : [],
        hostSize,
        guestSize,
        initialTeamSize: rules.initialTeamSize,
      },
      battle,
    };
  }

  /**
   * DTO матча с подгрузкой battle state из store.
   */
  static async mapMatchWithBattle(row: MatchRow): Promise<MatchesModel.match> {
    let battle: BattleSummary | null = null;
    if (row.status === 'fighting' || row.status === 'finished') {
      const state = await getBattleStore().get(row.id);
      if (state) {
        battle = toBattleSummary(state);
      }
    }
    return MatchesService.mapMatch(row, battle);
  }

  /**
   * Создаёт лобби в статусе waiting с снимком правил.
   */
  static async createMatch(
    hostId: string,
    rulesInput?: Partial<MatchRules> | null
  ): Promise<
    { ok: true; match: MatchesModel.match } | { ok: false; message: string }
  > {
    const parsed = parseMatchRules(rulesInput ?? {});
    if (!parsed.ok) {
      return { ok: false, message: parsed.message };
    }
    const inviteCode = createInviteCode();
    const row = await prisma.match.create({
      data: {
        hostId,
        inviteCode,
        status: 'waiting',
        rules: parsed.rules as Prisma.InputJsonValue,
      },
      include: matchInclude,
    });
    return { ok: true, match: MatchesService.mapMatch(row) };
  }

  /**
   * Присоединяет гостя к лобби по коду → drafting.
   */
  static async joinMatch(input: {
    readonly inviteCode: string;
    readonly guestId: string;
  }): Promise<{ ok: true; match: MatchesModel.match } | { ok: false; message: string }> {
    const normalizedCode = input.inviteCode.trim().toUpperCase();
    const existing = await prisma.match.findUnique({
      where: { inviteCode: normalizedCode },
      include: matchInclude,
    });
    if (!existing) {
      return { ok: false, message: 'Матч с таким кодом не найден' };
    }
    if (existing.status === 'cancelled') {
      return { ok: false, message: 'Матч отменён' };
    }
    if (existing.hostId === input.guestId) {
      return { ok: false, message: 'Нельзя присоединиться к своему матчу' };
    }
    if (existing.guestId && existing.guestId !== input.guestId) {
      return { ok: false, message: 'Матч уже заполнен' };
    }
    if (existing.guestId === input.guestId) {
      return { ok: true, match: MatchesService.mapMatch(existing) };
    }
    if (existing.status !== 'waiting') {
      return { ok: false, message: 'К этому матчу уже нельзя присоединиться' };
    }
    const row = await prisma.match.update({
      where: { id: existing.id },
      data: {
        guestId: input.guestId,
        status: 'drafting',
      },
      include: matchInclude,
    });
    return { ok: true, match: MatchesService.mapMatch(row) };
  }

  /**
   * Возвращает матч по id.
   */
  static async findById(id: string): Promise<MatchesModel.match | null> {
    const row = await prisma.match.findUnique({
      where: { id },
      include: matchInclude,
    });
    if (!row) {
      return null;
    }
    return MatchesService.mapMatchWithBattle(row);
  }

  /**
   * Проверяет, что игрок — участник матча.
   */
  private static isParticipant(row: MatchRow, playerId: string): boolean {
    return row.hostId === playerId || row.guestId === playerId;
  }

  /**
   * Пик героя в draft.
   */
  static async draftPick(input: {
    readonly matchId: string;
    readonly playerId: string;
    readonly heroCode: string;
    readonly row: number;
  }): Promise<
    | { ok: true; match: MatchesModel.match }
    | { ok: false; message: string; status: 400 | 403 | 404 }
  > {
    const existing = await prisma.match.findUnique({
      where: { id: input.matchId },
      include: matchInclude,
    });
    if (!existing) {
      return { ok: false, message: 'Матч не найден', status: 404 };
    }
    if (!MatchesService.isParticipant(existing, input.playerId)) {
      return { ok: false, message: 'Вы не участник этого матча', status: 403 };
    }
    if (existing.status !== 'drafting' || !existing.guestId) {
      return { ok: false, message: 'Сейчас нельзя выбирать героев', status: 400 };
    }

    const picks = MatchesService.toDraftPicks(existing.picks);
    const limits = draftLimitsOf(existing);
    const turnPlayerId = resolveTurnPlayerId(
      picks,
      existing.hostId,
      existing.guestId,
      limits
    );
    if (turnPlayerId !== input.playerId) {
      return { ok: false, message: 'Сейчас не ваш ход', status: 400 };
    }

    const hero = await prisma.heroClass.findUnique({
      where: { code: input.heroCode },
      select: { code: true, displayName: true, size: true, isPlayable: true },
    });
    if (!hero) {
      return { ok: false, message: 'Класс героя не найден', status: 400 };
    }

    const validation = validatePick({
      picks,
      playerId: input.playerId,
      hero,
      row: input.row,
      limits,
    });
    if (!validation.ok) {
      return { ok: false, message: validation.message, status: 400 };
    }

    const nextOrder = existing.picks.length + 1;
    await prisma.matchPick.create({
      data: {
        matchId: existing.id,
        playerId: input.playerId,
        heroClassCode: hero.code,
        row: input.row,
        pickOrder: nextOrder,
      },
    });

    const afterPicks: DraftPick[] = [
      ...picks,
      {
        id: 'pending',
        playerId: input.playerId,
        heroClassCode: hero.code,
        displayName: hero.displayName,
        size: hero.size,
        row: input.row,
        pickOrder: nextOrder,
      },
    ];
    const drafted = isDraftComplete(
      afterPicks,
      existing.hostId,
      existing.guestId,
      limits
    );
    if (drafted && existing.guestId) {
      await MatchesService.startBattle({
        matchId: existing.id,
        hostId: existing.hostId,
        guestId: existing.guestId,
        rules: rulesOf(existing),
      });
    }

    const row = await prisma.match.findUniqueOrThrow({
      where: { id: existing.id },
      include: matchInclude,
    });
    return { ok: true, match: await MatchesService.mapMatchWithBattle(row) };
  }

  /**
   * Инициализирует бой и переводит матч в fighting.
   */
  private static async startBattle(input: {
    readonly matchId: string;
    readonly hostId: string;
    readonly guestId: string;
    readonly rules: MatchRules;
  }): Promise<void> {
    const picks = await prisma.matchPick.findMany({
      where: { matchId: input.matchId },
      orderBy: { pickOrder: 'asc' },
    });
    const heroes = await prisma.heroClass.findMany();
    const heroMap = new Map<string, HeroClassStats>(
      heroes.map((hero) => [
        hero.code,
        {
          code: hero.code,
          displayName: hero.displayName,
          health: hero.health,
          damage: hero.damage,
          armor: hero.armor,
          initiative: hero.initiative,
          dodge: hero.dodge,
          luck: hero.luck,
          accuracy: hero.accuracy,
          power: hero.power,
          mana: hero.mana,
          gold: hero.gold,
          size: hero.size,
          morale: hero.morale,
        },
      ])
    );

    const state = createBattleState({
      matchId: input.matchId,
      hostPlayerId: input.hostId,
      guestPlayerId: input.guestId,
      picks: picks.map((pick) => ({
        id: pick.id,
        playerId: pick.playerId,
        heroClassCode: pick.heroClassCode,
        row: pick.row,
        pickOrder: pick.pickOrder,
      })),
      heroes: heroMap,
      rules: {
        maxTeamSize: input.rules.maxTeamSize,
        maxRowSize: input.rules.maxRowSize,
        maxRounds: input.rules.maxRounds,
        healthBonus: input.rules.healthBonus,
        startingLevel: input.rules.startingLevel,
      },
    });
    await getBattleStore().set(state);
    await prisma.match.update({
      where: { id: input.matchId },
      data: { status: 'fighting', fightingStartedAt: new Date() },
    });
    publishBattle(input.matchId, 'battle:state', toBattleSummary(state));
  }

  /**
   * Перенос своего пика на другой ряд.
   */
  static async moveDraftPick(input: {
    readonly matchId: string;
    readonly pickId: string;
    readonly playerId: string;
    readonly row: number;
  }): Promise<
    | { ok: true; match: MatchesModel.match }
    | { ok: false; message: string; status: 400 | 403 | 404 }
  > {
    const existing = await prisma.match.findUnique({
      where: { id: input.matchId },
      include: matchInclude,
    });
    if (!existing) {
      return { ok: false, message: 'Матч не найден', status: 404 };
    }
    if (!MatchesService.isParticipant(existing, input.playerId)) {
      return { ok: false, message: 'Вы не участник этого матча', status: 403 };
    }
    if (existing.status !== 'drafting') {
      return { ok: false, message: 'Сейчас нельзя менять расстановку', status: 400 };
    }

    const picks = MatchesService.toDraftPicks(existing.picks);
    const limits = draftLimitsOf(existing);
    const validation = validateMovePick({
      picks,
      pickId: input.pickId,
      playerId: input.playerId,
      row: input.row,
      limits,
    });
    if (!validation.ok) {
      return { ok: false, message: validation.message, status: 400 };
    }

    const target = picks.find((pick) => pick.id === input.pickId);
    if (!target) {
      return { ok: false, message: 'Пик не найден', status: 404 };
    }
    if (target.row === input.row) {
      return { ok: true, match: await MatchesService.mapMatchWithBattle(existing) };
    }

    await prisma.matchPick.update({
      where: { id: input.pickId },
      data: { row: input.row },
    });

    const row = await prisma.match.findUniqueOrThrow({
      where: { id: existing.id },
      include: matchInclude,
    });
    return { ok: true, match: await MatchesService.mapMatchWithBattle(row) };
  }

  /**
   * Случайный валидный пик.
   */
  static async draftRandom(input: {
    readonly matchId: string;
    readonly playerId: string;
    readonly preferredRow?: number;
  }): Promise<
    | { ok: true; match: MatchesModel.match }
    | { ok: false; message: string; status: 400 | 403 | 404 }
  > {
    const existing = await prisma.match.findUnique({
      where: { id: input.matchId },
      include: matchInclude,
    });
    if (!existing) {
      return { ok: false, message: 'Матч не найден', status: 404 };
    }
    if (!MatchesService.isParticipant(existing, input.playerId)) {
      return { ok: false, message: 'Вы не участник этого матча', status: 403 };
    }
    if (existing.status !== 'drafting' || !existing.guestId) {
      return { ok: false, message: 'Сейчас нельзя выбирать героев', status: 400 };
    }

    const picks = MatchesService.toDraftPicks(existing.picks);
    const limits = draftLimitsOf(existing);
    const turnPlayerId = resolveTurnPlayerId(
      picks,
      existing.hostId,
      existing.guestId,
      limits
    );
    if (turnPlayerId !== input.playerId) {
      return { ok: false, message: 'Сейчас не ваш ход', status: 400 };
    }

    const heroes = await prisma.heroClass.findMany({
      where: { isPlayable: true },
      select: { code: true, displayName: true, size: true, isPlayable: true },
    });
    const chosen = pickRandomValid({
      picks,
      playerId: input.playerId,
      heroes,
      preferredRow: input.preferredRow,
      limits,
    });
    if (!chosen) {
      return { ok: false, message: 'Нет доступных героев для случайного выбора', status: 400 };
    }

    return MatchesService.draftPick({
      matchId: input.matchId,
      playerId: input.playerId,
      heroCode: chosen.hero.code,
      row: chosen.row,
    });
  }

  /**
   * Отменяет матч (только host) из waiting/drafting.
   */
  static async cancelMatch(input: {
    readonly matchId: string;
    readonly playerId: string;
  }): Promise<
    | { ok: true; match: MatchesModel.match }
    | { ok: false; message: string; status: 403 | 404 | 400 }
  > {
    const existing = await prisma.match.findUnique({
      where: { id: input.matchId },
      include: matchInclude,
    });
    if (!existing) {
      return { ok: false, message: 'Матч не найден', status: 404 };
    }
    if (existing.hostId !== input.playerId) {
      return { ok: false, message: 'Отменить матч может только хост', status: 403 };
    }
    if (existing.status === 'cancelled') {
      return { ok: true, match: await MatchesService.mapMatchWithBattle(existing) };
    }
    if (existing.status !== 'waiting' && existing.status !== 'drafting') {
      return { ok: false, message: 'Матч нельзя отменить в текущем статусе', status: 400 };
    }
    const row = await prisma.match.update({
      where: { id: existing.id },
      data: { status: 'cancelled' },
      include: matchInclude,
    });
    return { ok: true, match: await MatchesService.mapMatchWithBattle(row) };
  }

  /**
   * Сдача в бою: поражение сдающегося, победа оппонента.
   */
  static async surrenderMatch(input: {
    readonly matchId: string;
    readonly playerId: string;
  }): Promise<
    | { ok: true; match: MatchesModel.match }
    | { ok: false; message: string; status: 400 | 403 | 404 }
  > {
    const existing = await prisma.match.findUnique({
      where: { id: input.matchId },
      include: matchInclude,
    });
    if (!existing) {
      return { ok: false, message: 'Матч не найден', status: 404 };
    }
    if (!MatchesService.isParticipant(existing, input.playerId)) {
      return { ok: false, message: 'Вы не участник этого матча', status: 403 };
    }
    if (existing.status !== 'fighting') {
      return { ok: false, message: 'Сдаться можно только во время боя', status: 400 };
    }

    const store = getBattleStore();
    const state = await store.get(existing.id);
    if (!state) {
      return { ok: false, message: 'Состояние боя не найдено', status: 400 };
    }
    if (state.outcome !== 'ongoing') {
      return { ok: false, message: 'Бой уже завершён', status: 400 };
    }

    forceSurrender(state, input.playerId);
    await MatchesService.finalizeBattle({
      matchId: existing.id,
      winnerPlayerId: state.winnerPlayerId,
      state,
      hostDisplayName: existing.host.displayName,
      guestDisplayName: existing.guest?.displayName ?? '—',
    });
    await store.set(state);
    publishBattle(existing.id, 'battle:ended', toBattleSummary(state));

    const row = await prisma.match.findUniqueOrThrow({
      where: { id: existing.id },
      include: matchInclude,
    });
    return { ok: true, match: await MatchesService.mapMatchWithBattle(row) };
  }

  /**
   * Предложить ничью. Повторный offer при чужом оффере = accept.
   */
  static async offerDraw(input: {
    readonly matchId: string;
    readonly playerId: string;
  }): Promise<
    | { ok: true; match: MatchesModel.match }
    | { ok: false; message: string; status: 400 | 403 | 404 }
  > {
    const loaded = await MatchesService.loadFightingBattle(input);
    if (!loaded.ok) {
      return loaded;
    }
    const { existing, state, store } = loaded;

    if (
      state.drawOfferByPlayerId &&
      state.drawOfferByPlayerId !== input.playerId
    ) {
      return MatchesService.acceptDraw(input);
    }
    if (state.drawOfferByPlayerId === input.playerId) {
      const row = await prisma.match.findUniqueOrThrow({
        where: { id: existing.id },
        include: matchInclude,
      });
      return { ok: true, match: await MatchesService.mapMatchWithBattle(row) };
    }

    state.drawOfferByPlayerId = input.playerId;
    state.log.push('Предложена ничья.');
    await store.set(state);
    publishBattle(existing.id, 'battle:state', toBattleSummary(state));

    const row = await prisma.match.findUniqueOrThrow({
      where: { id: existing.id },
      include: matchInclude,
    });
    return { ok: true, match: await MatchesService.mapMatchWithBattle(row) };
  }

  /**
   * Принять предложение ничьей.
   */
  static async acceptDraw(input: {
    readonly matchId: string;
    readonly playerId: string;
  }): Promise<
    | { ok: true; match: MatchesModel.match }
    | { ok: false; message: string; status: 400 | 403 | 404 }
  > {
    const loaded = await MatchesService.loadFightingBattle(input);
    if (!loaded.ok) {
      return loaded;
    }
    const { existing, state, store } = loaded;

    if (!state.drawOfferByPlayerId) {
      return { ok: false, message: 'Нет предложения ничьей', status: 400 };
    }
    if (state.drawOfferByPlayerId === input.playerId) {
      return { ok: false, message: 'Нельзя принять своё предложение', status: 400 };
    }

    forceDraw(state);
    await MatchesService.finalizeBattle({
      matchId: existing.id,
      winnerPlayerId: null,
      state,
      hostDisplayName: existing.host.displayName,
      guestDisplayName: existing.guest?.displayName ?? '—',
    });
    await store.set(state);
    publishBattle(existing.id, 'battle:ended', toBattleSummary(state));

    const row = await prisma.match.findUniqueOrThrow({
      where: { id: existing.id },
      include: matchInclude,
    });
    return { ok: true, match: await MatchesService.mapMatchWithBattle(row) };
  }

  /**
   * Отклонить предложение ничьей.
   */
  static async declineDraw(input: {
    readonly matchId: string;
    readonly playerId: string;
  }): Promise<
    | { ok: true; match: MatchesModel.match }
    | { ok: false; message: string; status: 400 | 403 | 404 }
  > {
    const loaded = await MatchesService.loadFightingBattle(input);
    if (!loaded.ok) {
      return loaded;
    }
    const { existing, state, store } = loaded;

    if (!state.drawOfferByPlayerId) {
      return { ok: false, message: 'Нет предложения ничьей', status: 400 };
    }
    if (state.drawOfferByPlayerId === input.playerId) {
      return { ok: false, message: 'Нельзя отклонить своё предложение', status: 400 };
    }

    state.drawOfferByPlayerId = null;
    state.log.push('Предложение ничьей отклонено.');
    await store.set(state);
    publishBattle(existing.id, 'battle:state', toBattleSummary(state));

    const row = await prisma.match.findUniqueOrThrow({
      where: { id: existing.id },
      include: matchInclude,
    });
    return { ok: true, match: await MatchesService.mapMatchWithBattle(row) };
  }

  private static async loadFightingBattle(input: {
    readonly matchId: string;
    readonly playerId: string;
  }): Promise<
    | {
        ok: true;
        existing: MatchRow;
        state: BattleState;
        store: ReturnType<typeof getBattleStore>;
      }
    | { ok: false; message: string; status: 400 | 403 | 404 }
  > {
    const existing = await prisma.match.findUnique({
      where: { id: input.matchId },
      include: matchInclude,
    });
    if (!existing) {
      return { ok: false, message: 'Матч не найден', status: 404 };
    }
    if (!MatchesService.isParticipant(existing, input.playerId)) {
      return { ok: false, message: 'Вы не участник этого матча', status: 403 };
    }
    if (existing.status !== 'fighting') {
      return { ok: false, message: 'Доступно только во время боя', status: 400 };
    }
    const store = getBattleStore();
    const state = await store.get(existing.id);
    if (!state) {
      return { ok: false, message: 'Состояние боя не найдено', status: 400 };
    }
    if (state.outcome !== 'ongoing') {
      return { ok: false, message: 'Бой уже завершён', status: 400 };
    }
    // Backfill for battles started before drawOffer field existed.
    if (state.drawOfferByPlayerId === undefined) {
      state.drawOfferByPlayerId = null;
    }
    return { ok: true, existing: existing as MatchRow, state, store };
  }

  /**
   * Ход в бою.
   */
  static async battleAction(input: {
    readonly matchId: string;
    readonly playerId: string;
    readonly unitId: string;
    readonly action: 'attack' | 'defend' | 'wait' | 'skill' | 'ability' | 'move';
    readonly targetId?: string;
    readonly slot?: 1 | 2 | 3 | 4 | 5;
    readonly choice?: string;
  }): Promise<
    | { ok: true; match: MatchesModel.match }
    | { ok: false; message: string; status: 400 | 403 | 404 }
  > {
    const existing = await prisma.match.findUnique({
      where: { id: input.matchId },
      include: matchInclude,
    });
    if (!existing) {
      return { ok: false, message: 'Матч не найден', status: 404 };
    }
    if (!MatchesService.isParticipant(existing, input.playerId)) {
      return { ok: false, message: 'Вы не участник этого матча', status: 403 };
    }
    if (existing.status !== 'fighting') {
      return { ok: false, message: 'Бой сейчас недоступен', status: 400 };
    }

    const store = getBattleStore();
    const state = await store.get(existing.id);
    if (!state) {
      return { ok: false, message: 'Состояние боя не найдено', status: 400 };
    }

    const result = applyAction(state, {
      playerId: input.playerId,
      unitId: input.unitId,
      action: input.action,
      targetId: input.targetId,
      slot: input.slot,
      choice: input.choice,
    });
    if (!result.ok) {
      return { ok: false, message: result.message, status: 400 };
    }

    if (state.outcome !== 'ongoing') {
      await MatchesService.finalizeBattle({
        matchId: existing.id,
        winnerPlayerId: state.winnerPlayerId,
        state,
        hostDisplayName: existing.host.displayName,
        guestDisplayName: existing.guest?.displayName ?? '—',
      });
      await store.set(state);
      const summary = toBattleSummary(state);
      publishBattle(existing.id, 'battle:ended', summary);
    } else {
      await store.set(state);
      publishBattle(existing.id, 'battle:state', toBattleSummary(state));
    }

    const row = await prisma.match.findUniqueOrThrow({
      where: { id: existing.id },
      include: matchInclude,
    });
    return { ok: true, match: await MatchesService.mapMatchWithBattle(row) };
  }

  /**
   * Завершает бой: статус, snapshot, рейтинг (без ничьей).
   */
  private static async finalizeBattle(input: {
    readonly matchId: string;
    readonly winnerPlayerId: string | null;
    readonly state: BattleState;
    readonly hostDisplayName: string;
    readonly guestDisplayName: string;
  }): Promise<void> {
    const match = await prisma.match.findUnique({ where: { id: input.matchId } });
    if (!match || !match.guestId) {
      return;
    }
    const snapshot = buildResultSnapshot({
      state: input.state,
      hostDisplayName: input.hostDisplayName,
      guestDisplayName: input.guestDisplayName,
    });
    await prisma.match.update({
      where: { id: input.matchId },
      data: {
        status: 'finished',
        winnerPlayerId: input.winnerPlayerId,
        finishedAt: new Date(),
        resultSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    if (!input.winnerPlayerId) {
      return;
    }
    const loserId = input.winnerPlayerId === match.hostId ? match.guestId : match.hostId;
    await prisma.ratingEntry.createMany({
      data: [
        { playerId: input.winnerPlayerId, result: 'win' },
        { playerId: loserId, result: 'loss' },
      ],
    });
  }

  /**
   * История завершённых матчей игрока.
   */
  static async listHistoryForPlayer(playerId: string): Promise<MatchesModel.matchHistoryItem[]> {
    const rows = await prisma.match.findMany({
      where: {
        status: 'finished',
        OR: [{ hostId: playerId }, { guestId: playerId }],
      },
      orderBy: { finishedAt: 'desc' },
      take: 50,
      include: {
        host: { select: { id: true, displayName: true } },
        guest: { select: { id: true, displayName: true } },
      },
    });

    return rows.map((row) => {
      const isHost = row.hostId === playerId;
      const opponent = isHost ? row.guest : row.host;
      let result: 'win' | 'loss' | 'draw' = 'draw';
      if (row.winnerPlayerId === playerId) {
        result = 'win';
      } else if (row.winnerPlayerId) {
        result = 'loss';
      }
      return {
        id: row.id,
        result,
        opponentName: opponent?.displayName ?? '—',
        finishedAt: (row.finishedAt ?? row.updatedAt).toISOString(),
        durationSeconds: durationSeconds(row.fightingStartedAt, row.finishedAt),
      };
    });
  }

  /**
   * Детали завершённого матча для участника.
   */
  static async getHistoryDetailForPlayer(
    playerId: string,
    matchId: string
  ): Promise<
    | { ok: true; detail: MatchesModel.matchHistoryDetail }
    | { ok: false; message: string; status: 403 | 404 }
  > {
    const row = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        host: { select: { id: true, displayName: true } },
        guest: { select: { id: true, displayName: true } },
        picks: {
          orderBy: { pickOrder: 'asc' },
          include: { heroClass: { select: { code: true, displayName: true } } },
        },
      },
    });
    if (!row) {
      return { ok: false, message: 'Матч не найден', status: 404 };
    }
    if (row.hostId !== playerId && row.guestId !== playerId) {
      return { ok: false, message: 'Нет доступа к матчу', status: 403 };
    }
    if (row.status !== 'finished') {
      return { ok: false, message: 'Матч ещё не завершён', status: 404 };
    }

    const isHost = row.hostId === playerId;
    const opponent = isHost ? row.guest : row.host;
    let result: 'win' | 'loss' | 'draw' = 'draw';
    if (row.winnerPlayerId === playerId) {
      result = 'win';
    } else if (row.winnerPlayerId) {
      result = 'loss';
    }

    const snapshot = parseResultSnapshot(row.resultSnapshot);
    const hostUnits =
      snapshot?.host.units ??
      row.picks
        .filter((pick) => pick.playerId === row.hostId)
        .map((pick) => unitFromPick(pick));
    const guestUnits =
      snapshot?.guest.units ??
      row.picks
        .filter((pick) => pick.playerId === row.guestId)
        .map((pick) => unitFromPick(pick));

    return {
      ok: true,
      detail: {
        id: row.id,
        result,
        opponentName: opponent?.displayName ?? '—',
        finishedAt: (row.finishedAt ?? row.updatedAt).toISOString(),
        durationSeconds: durationSeconds(row.fightingStartedAt, row.finishedAt),
        stage: snapshot?.stage ?? null,
        outcome: snapshot?.outcome ?? null,
        hasSnapshot: snapshot !== null,
        log: snapshot?.log ?? [],
        host: {
          playerId: row.hostId,
          displayName: snapshot?.host.displayName ?? row.host.displayName,
          units: hostUnits,
        },
        guest: {
          playerId: row.guestId ?? '',
          displayName:
            snapshot?.guest.displayName ?? row.guest?.displayName ?? '—',
          units: guestUnits,
        },
      },
    };
  }
}

function durationSeconds(startedAt: Date | null, finishedAt: Date | null): number | null {
  if (!startedAt || !finishedAt) {
    return null;
  }
  return Math.max(0, Math.floor((finishedAt.getTime() - startedAt.getTime()) / 1000));
}

function parseResultSnapshot(value: unknown): MatchResultSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const snap = value as Partial<MatchResultSnapshot>;
  if (!snap.host || !snap.guest || !Array.isArray(snap.log)) {
    return null;
  }
  return snap as MatchResultSnapshot;
}

function unitFromPick(pick: {
  id: string;
  heroClassCode: string;
  row: number;
  heroClass: { displayName: string };
}): MatchesModel.matchHistoryUnit {
  return {
    pickId: pick.id,
    heroClassCode: pick.heroClassCode,
    displayName: pick.heroClass.displayName,
    row: pick.row,
    column: 0,
    maxHp: 0,
    health: 0,
    alive: true,
    damage: 0,
    armor: 0,
    initiative: 0,
    lvl: 1,
  };
}
