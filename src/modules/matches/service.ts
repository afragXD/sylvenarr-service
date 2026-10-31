import {
  applyAction,
  type BattleEndedMeta,
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
import {
  type DraftLimits,
  isDraftComplete,
  pickRandomValid,
  resolveTurnPlayerId,
  teamSize,
  validateMovePick,
  validatePick,
} from '../../game/draft/rules';
import type { DraftPick } from '../../game/draft/types';
import { type MatchRules, parseMatchRules, resolveMatchRules } from '../../game/matchRules';
import { prisma } from '../../shared/db';
import type { Prisma } from '../../shared/generated/prisma/client';
import { createInviteCode } from '../../utils/create-invite-code';
import { PresetsService } from '../presets/service';
import { computePtsChange } from '../rating/pts';
import type { MatchesModel } from './model';

type PickRow = {
  id: string;
  playerId: string;
  heroClassCode: string;
  row: number;
  pickOrder: number;
  source: 'draft' | 'preset';
  heroClass: { displayName: string; size: number };
};

type MatchRow = {
  id: string;
  status: MatchesModel.matchStatus;
  inviteCode: string;
  hostId: string;
  guestId: string | null;
  winnerPlayerId: string | null;
  fightingStartedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  rules: unknown;
  host: { id: string; displayName: string; avatarUrl: string | null };
  guest: { id: string; displayName: string; avatarUrl: string | null } | null;
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
  host: { select: { id: true, displayName: true, avatarUrl: true } },
  guest: { select: { id: true, displayName: true, avatarUrl: true } },
  picks: {
    orderBy: { pickOrder: 'asc' as const },
    select: {
      id: true,
      playerId: true,
      heroClassCode: true,
      row: true,
      pickOrder: true,
      source: true,
      heroClass: { select: { displayName: true, size: true } },
    },
  },
};

function draftEntryOf(picks: ReadonlyArray<DraftPick>, playerId: string): MatchesModel.draftEntry {
  const own = picks.filter((pick) => pick.playerId === playerId);
  if (own.length === 0) {
    return 'empty';
  }
  if (own.some((pick) => pick.source === 'preset')) {
    return 'preset';
  }
  return 'draft';
}

/**
 * Скрывает состав пресетного игрока от соперника на этапе drafting.
 */
function redactPicksForViewer(
  picks: ReadonlyArray<DraftPick>,
  status: MatchesModel.matchStatus,
  viewerId: string | null | undefined
): DraftPick[] {
  if (status !== 'drafting') {
    return [...picks];
  }
  const presetOwners = new Set(
    picks.filter((pick) => pick.source === 'preset').map((pick) => pick.playerId)
  );
  return picks.map((pick) => {
    if (!presetOwners.has(pick.playerId)) {
      return pick;
    }
    if (viewerId && pick.playerId === viewerId) {
      return pick;
    }
    return {
      ...pick,
      heroClassCode: '',
      displayName: 'Скрыто',
    };
  });
}

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
      source: pick.source ?? 'draft',
    }));
  }

  /**
   * Преобразует матч из БД в DTO с draft (+ battle при наличии).
   * viewerId — для скрытия чужого пресета на этапе drafting.
   */
  static mapMatch(
    row: MatchRow,
    battle: BattleSummary | null = null,
    viewerId: string | null = null
  ): MatchesModel.match {
    const picks = MatchesService.toDraftPicks(row.picks);
    const visible = redactPicksForViewer(picks, row.status, viewerId);
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
      durationSeconds: durationSeconds(row.fightingStartedAt, row.finishedAt),
      myRating: null,
      rules,
      draft: {
        turnPlayerId,
        hostPicks: visible.filter((pick) => pick.playerId === row.hostId),
        guestPicks: guestId ? visible.filter((pick) => pick.playerId === guestId) : [],
        hostSize,
        guestSize,
        initialTeamSize: rules.initialTeamSize,
        hostEntry: draftEntryOf(picks, row.hostId),
        guestEntry: guestId ? draftEntryOf(picks, guestId) : 'empty',
      },
      battle,
    };
  }

  /**
   * DTO матча с подгрузкой battle state из store и рейтинга зрителя.
   */
  static async mapMatchWithBattle(
    row: MatchRow,
    viewerId: string | null = null
  ): Promise<MatchesModel.match> {
    let battle: BattleSummary | null = null;
    if (row.status === 'fighting' || row.status === 'finished') {
      const state = await getBattleStore().get(row.id);
      if (state) {
        battle = toBattleSummary(state);
      }
    }
    const match = MatchesService.mapMatch(row, battle, viewerId);
    if (row.status === 'finished' && viewerId) {
      match.myRating = await MatchesService.loadMyRating(row.id, viewerId);
    }
    return match;
  }

  /**
   * RatingEntry текущего игрока по матчу; null — матч без рейтинга.
   */
  private static async loadMyRating(
    matchId: string,
    playerId: string
  ): Promise<MatchesModel.matchMyRating | null> {
    const entry = await prisma.ratingEntry.findFirst({
      where: { matchId, playerId },
      select: { ptsBefore: true, ptsAfter: true, ptsDelta: true },
    });
    if (!entry || entry.ptsBefore === null || entry.ptsAfter === null || entry.ptsDelta === null) {
      return null;
    }
    return {
      ptsBefore: entry.ptsBefore,
      ptsAfter: entry.ptsAfter,
      ptsDelta: entry.ptsDelta,
    };
  }

  /**
   * Создаёт лобби в статусе waiting с снимком правил.
   */
  static async createMatch(
    hostId: string,
    rulesInput?: Partial<MatchRules> | null
  ): Promise<{ ok: true; match: MatchesModel.match } | { ok: false; message: string }> {
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
    return { ok: true, match: MatchesService.mapMatch(row, null, hostId) };
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
      return {
        ok: true,
        match: MatchesService.mapMatch(existing, null, input.guestId),
      };
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
    return { ok: true, match: MatchesService.mapMatch(row, null, input.guestId) };
  }

  /**
   * Возвращает матч по id (viewerId — для редакции чужого пресета).
   */
  static async findById(
    id: string,
    viewerId: string | null = null
  ): Promise<MatchesModel.match | null> {
    const row = await prisma.match.findUnique({
      where: { id },
      include: matchInclude,
    });
    if (!row) {
      return null;
    }
    return MatchesService.mapMatchWithBattle(row, viewerId);
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
    if (picks.some((pick) => pick.playerId === input.playerId && pick.source === 'preset')) {
      return { ok: false, message: 'Отряд уже зафиксирован пресетом', status: 400 };
    }
    const limits = draftLimitsOf(existing);
    const turnPlayerId = resolveTurnPlayerId(picks, existing.hostId, existing.guestId, limits);
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
        source: 'draft',
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
        source: 'draft',
      },
    ];
    const drafted = isDraftComplete(afterPicks, existing.hostId, existing.guestId, limits);
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
    return {
      ok: true,
      match: await MatchesService.mapMatchWithBattle(row, input.playerId),
    };
  }

  /**
   * Применить пресет отряда целиком (свой или глобальный).
   */
  static async draftPreset(input: {
    readonly matchId: string;
    readonly playerId: string;
    readonly presetId: string;
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
    if (picks.some((pick) => pick.playerId === input.playerId)) {
      return {
        ok: false,
        message: 'Пресет можно взять только с пустым отрядом',
        status: 400,
      };
    }

    const rules = rulesOf(existing);
    if (rules.initialTeamSize < 3) {
      return {
        ok: false,
        message: 'Пресеты доступны при размере отряда от 3',
        status: 400,
      };
    }

    const preset = await PresetsService.getUsableByPlayer(input.presetId, input.playerId);
    if (!preset) {
      return { ok: false, message: 'Пресет не найден', status: 404 };
    }
    if (preset.teamSize !== rules.initialTeamSize) {
      return {
        ok: false,
        message: `Пресет на ${preset.teamSize}, в матче нужно ${rules.initialTeamSize}`,
        status: 400,
      };
    }

    const limits = draftLimitsOf(existing);
    let working = [...picks];
    const toCreate: Array<{
      heroClassCode: string;
      row: number;
      pickOrder: number;
    }> = [];
    let nextOrder = existing.picks.length + 1;

    for (const slot of [...preset.slots].sort((a, b) => a.slotOrder - b.slotOrder)) {
      const hero = {
        code: slot.heroClassCode,
        displayName: slot.heroClass.displayName,
        size: slot.heroClass.size,
        isPlayable: true,
      };
      const validation = validatePick({
        picks: working,
        playerId: input.playerId,
        hero,
        row: slot.row,
        limits,
      });
      if (!validation.ok) {
        return { ok: false, message: validation.message, status: 400 };
      }
      working = [
        ...working,
        {
          id: `pending-${nextOrder}`,
          playerId: input.playerId,
          heroClassCode: hero.code,
          displayName: hero.displayName,
          size: hero.size,
          row: slot.row,
          pickOrder: nextOrder,
          source: 'preset',
        },
      ];
      toCreate.push({
        heroClassCode: hero.code,
        row: slot.row,
        pickOrder: nextOrder,
      });
      nextOrder += 1;
    }

    await prisma.matchPick.createMany({
      data: toCreate.map((item) => ({
        matchId: existing.id,
        playerId: input.playerId,
        heroClassCode: item.heroClassCode,
        row: item.row,
        pickOrder: item.pickOrder,
        source: 'preset' as const,
      })),
    });

    const drafted = isDraftComplete(working, existing.hostId, existing.guestId, limits);
    if (drafted && existing.guestId) {
      await MatchesService.startBattle({
        matchId: existing.id,
        hostId: existing.hostId,
        guestId: existing.guestId,
        rules,
      });
    }

    const row = await prisma.match.findUniqueOrThrow({
      where: { id: existing.id },
      include: matchInclude,
    });
    return {
      ok: true,
      match: await MatchesService.mapMatchWithBattle(row, input.playerId),
    };
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
          maxMana: hero.maxMana,
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
      return {
        ok: true,
        match: await MatchesService.mapMatchWithBattle(existing, input.playerId),
      };
    }

    await prisma.matchPick.update({
      where: { id: input.pickId },
      data: { row: input.row },
    });

    const row = await prisma.match.findUniqueOrThrow({
      where: { id: existing.id },
      include: matchInclude,
    });
    return {
      ok: true,
      match: await MatchesService.mapMatchWithBattle(row, input.playerId),
    };
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
    if (picks.some((pick) => pick.playerId === input.playerId && pick.source === 'preset')) {
      return { ok: false, message: 'Отряд уже зафиксирован пресетом', status: 400 };
    }
    const limits = draftLimitsOf(existing);
    const turnPlayerId = resolveTurnPlayerId(picks, existing.hostId, existing.guestId, limits);
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
      return { ok: true, match: await MatchesService.mapMatchWithBattle(existing, input.playerId) };
    }
    if (existing.status !== 'waiting' && existing.status !== 'drafting') {
      return { ok: false, message: 'Матч нельзя отменить в текущем статусе', status: 400 };
    }
    const row = await prisma.match.update({
      where: { id: existing.id },
      data: { status: 'cancelled' },
      include: matchInclude,
    });
    return { ok: true, match: await MatchesService.mapMatchWithBattle(row, input.playerId) };
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
    const resultMeta = await MatchesService.finalizeBattle({
      matchId: existing.id,
      winnerPlayerId: state.winnerPlayerId,
      state,
      hostDisplayName: existing.host.displayName,
      guestDisplayName: existing.guest?.displayName ?? '—',
    });
    await store.set(state);
    publishBattle(existing.id, 'battle:ended', toBattleSummary(state), resultMeta ?? undefined);

    const row = await prisma.match.findUniqueOrThrow({
      where: { id: existing.id },
      include: matchInclude,
    });
    return { ok: true, match: await MatchesService.mapMatchWithBattle(row, input.playerId) };
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

    if (state.drawOfferByPlayerId && state.drawOfferByPlayerId !== input.playerId) {
      return MatchesService.acceptDraw(input);
    }
    if (state.drawOfferByPlayerId === input.playerId) {
      publishBattle(existing.id, 'battle:state', toBattleSummary(state));
      const row = await prisma.match.findUniqueOrThrow({
        where: { id: existing.id },
        include: matchInclude,
      });
      return { ok: true, match: await MatchesService.mapMatchWithBattle(row, input.playerId) };
    }

    state.drawOfferByPlayerId = input.playerId;
    state.log.push('Предложена ничья.');
    await store.set(state);
    publishBattle(existing.id, 'battle:state', toBattleSummary(state));

    const row = await prisma.match.findUniqueOrThrow({
      where: { id: existing.id },
      include: matchInclude,
    });
    return { ok: true, match: await MatchesService.mapMatchWithBattle(row, input.playerId) };
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
    const resultMeta = await MatchesService.finalizeBattle({
      matchId: existing.id,
      winnerPlayerId: null,
      state,
      hostDisplayName: existing.host.displayName,
      guestDisplayName: existing.guest?.displayName ?? '—',
    });
    await store.set(state);
    publishBattle(existing.id, 'battle:ended', toBattleSummary(state), resultMeta ?? undefined);

    const row = await prisma.match.findUniqueOrThrow({
      where: { id: existing.id },
      include: matchInclude,
    });
    return { ok: true, match: await MatchesService.mapMatchWithBattle(row, input.playerId) };
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
    return { ok: true, match: await MatchesService.mapMatchWithBattle(row, input.playerId) };
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
      const resultMeta = await MatchesService.finalizeBattle({
        matchId: existing.id,
        winnerPlayerId: state.winnerPlayerId,
        state,
        hostDisplayName: existing.host.displayName,
        guestDisplayName: existing.guest?.displayName ?? '—',
      });
      await store.set(state);
      const summary = toBattleSummary(state);
      publishBattle(existing.id, 'battle:ended', summary, resultMeta ?? undefined);
    } else {
      await store.set(state);
      publishBattle(existing.id, 'battle:state', toBattleSummary(state));
    }

    const row = await prisma.match.findUniqueOrThrow({
      where: { id: existing.id },
      include: matchInclude,
    });
    return { ok: true, match: await MatchesService.mapMatchWithBattle(row, input.playerId) };
  }

  /**
   * Завершает бой: статус, snapshot, ПТС (StickyFingaz / Heroes III).
   */
  private static async finalizeBattle(input: {
    readonly matchId: string;
    readonly winnerPlayerId: string | null;
    readonly state: BattleState;
    readonly hostDisplayName: string;
    readonly guestDisplayName: string;
  }): Promise<BattleEndedMeta | null> {
    const match = await prisma.match.findUnique({
      where: { id: input.matchId },
      include: {
        host: { select: { id: true, pts: true } },
        guest: { select: { id: true, pts: true } },
      },
    });
    if (!match || !match.guestId || !match.guest) {
      return null;
    }
    const snapshot = buildResultSnapshot({
      state: input.state,
      hostDisplayName: input.hostDisplayName,
      guestDisplayName: input.guestDisplayName,
    });

    const hostId = match.hostId;
    const guestId = match.guestId;
    const outcome =
      input.winnerPlayerId === null ? 'draw' : input.winnerPlayerId === hostId ? 'a_win' : 'b_win';
    const change = computePtsChange({
      ptsA: match.host.pts,
      ptsB: match.guest.pts,
      outcome,
    });

    const hostResult = outcome === 'draw' ? 'draw' : outcome === 'a_win' ? 'win' : 'loss';
    const guestResult = outcome === 'draw' ? 'draw' : outcome === 'b_win' ? 'win' : 'loss';

    const picks = await prisma.matchPick.findMany({
      where: { matchId: input.matchId },
      select: { playerId: true, heroClassCode: true },
    });
    const pickIncrements = picks.map((pick) =>
      prisma.heroPickStat.upsert({
        where: {
          playerId_heroClassCode: {
            playerId: pick.playerId,
            heroClassCode: pick.heroClassCode,
          },
        },
        create: {
          playerId: pick.playerId,
          heroClassCode: pick.heroClassCode,
          pickCount: 1,
        },
        update: {
          pickCount: { increment: 1 },
        },
      })
    );

    const finishedAt = new Date();
    await prisma.$transaction([
      prisma.match.update({
        where: { id: input.matchId },
        data: {
          status: 'finished',
          winnerPlayerId: input.winnerPlayerId,
          finishedAt,
          resultSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      }),
      prisma.player.update({
        where: { id: hostId },
        data: { pts: change.ptsAfterA },
      }),
      prisma.player.update({
        where: { id: guestId },
        data: { pts: change.ptsAfterB },
      }),
      prisma.ratingEntry.create({
        data: {
          playerId: hostId,
          result: hostResult,
          matchId: input.matchId,
          ptsBefore: match.host.pts,
          ptsDelta: change.deltaA,
          ptsAfter: change.ptsAfterA,
        },
      }),
      prisma.ratingEntry.create({
        data: {
          playerId: guestId,
          result: guestResult,
          matchId: input.matchId,
          ptsBefore: match.guest.pts,
          ptsDelta: change.deltaB,
          ptsAfter: change.ptsAfterB,
        },
      }),
      ...pickIncrements,
      // Драфт больше не нужен — состав и лог уже в resultSnapshot.
      prisma.matchPick.deleteMany({ where: { matchId: input.matchId } }),
    ]);
    return {
      durationSeconds: durationSeconds(match.fightingStartedAt, finishedAt),
      ratings: [
        {
          playerId: hostId,
          ptsBefore: match.host.pts,
          ptsAfter: change.ptsAfterA,
          ptsDelta: change.deltaA,
        },
        {
          playerId: guestId,
          ptsBefore: match.guest.pts,
          ptsAfter: change.ptsAfterB,
          ptsDelta: change.deltaB,
        },
      ],
    };
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
        host: { select: { id: true, displayName: true, avatarUrl: true } },
        guest: { select: { id: true, displayName: true, avatarUrl: true } },
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
        opponentAvatarUrl: opponent?.avatarUrl ?? null,
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
        host: { select: { id: true, displayName: true, avatarUrl: true } },
        guest: { select: { id: true, displayName: true, avatarUrl: true } },
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
    // После finalize пики удаляются; для старых матчей без snapshot — fallback на picks.
    let hostUnits = snapshot?.host.units ?? [];
    let guestUnits = snapshot?.guest.units ?? [];
    if (!snapshot) {
      const picks = await prisma.matchPick.findMany({
        where: { matchId },
        orderBy: { pickOrder: 'asc' },
        include: { heroClass: { select: { code: true, displayName: true } } },
      });
      hostUnits = picks
        .filter((pick) => pick.playerId === row.hostId)
        .map((pick) => unitFromPick(pick));
      guestUnits = picks
        .filter((pick) => pick.playerId === row.guestId)
        .map((pick) => unitFromPick(pick));
    }

    return {
      ok: true,
      detail: {
        id: row.id,
        result,
        opponentName: opponent?.displayName ?? '—',
        opponentAvatarUrl: opponent?.avatarUrl ?? null,
        finishedAt: (row.finishedAt ?? row.updatedAt).toISOString(),
        durationSeconds: durationSeconds(row.fightingStartedAt, row.finishedAt),
        stage: snapshot?.stage ?? null,
        outcome: snapshot?.outcome ?? null,
        hasSnapshot: snapshot !== null,
        log: snapshot?.log ?? [],
        host: {
          playerId: row.hostId,
          displayName: snapshot?.host.displayName ?? row.host.displayName,
          avatarUrl: row.host.avatarUrl,
          units: hostUnits,
        },
        guest: {
          playerId: row.guestId ?? '',
          displayName: snapshot?.guest.displayName ?? row.guest?.displayName ?? '—',
          avatarUrl: row.guest?.avatarUrl ?? null,
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
