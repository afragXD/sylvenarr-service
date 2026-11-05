import {
  type BattleSummary,
  getBattleStore,
  publishBattle,
  toBattleSummary,
} from '../../game/combat';
import type { BattleState, BattleUnit } from '../../game/combat/types';
import { prisma } from '../../shared/db';
import { withBattleLock } from '../matches/battle-lock';
import type { CreatorMatchesModel } from './model';
import { applyUnitStatsPatch } from './patch-unit';

function toEditorUnit(unit: BattleUnit): CreatorMatchesModel.editorUnit {
  return {
    id: unit.id,
    playerId: unit.playerId,
    team: unit.team,
    heroClassCode: unit.heroClassCode,
    displayName: unit.displayName,
    row: unit.row,
    column: unit.column,
    health: Math.max(0, unit.health),
    maxHp: unit.maxHp,
    alive: unit.alive,
    damage: unit.damage,
    armor: unit.armor,
    initiative: unit.initiative,
    dodge: unit.dodge,
    luck: unit.luck,
    accuracy: unit.accuracy,
    power: unit.power,
    mana: unit.mana,
    maxMana: unit.maxMana,
    morale: unit.morale,
    lvl: unit.lvl,
    hiddenLvl: unit.hiddenLvl,
    ultaCharges: unit.ultaCharges,
    critBank: unit.critBank,
    isSummon: unit.isSummon,
  };
}

function toDetail(
  matchId: string,
  hostDisplayName: string,
  guestDisplayName: string | null,
  state: BattleState
): CreatorMatchesModel.matchDetail {
  return {
    id: matchId,
    status: 'fighting',
    hostDisplayName,
    guestDisplayName,
    stage: state.stage,
    phase: state.phase ?? 'combat',
    activeUnitId: state.activeUnitId,
    units: state.units.map(toEditorUnit),
  };
}

export class CreatorMatchesService {
  static async listFighting(): Promise<CreatorMatchesModel.listResponse> {
    const rows = await prisma.match.findMany({
      where: { status: 'fighting' },
      orderBy: { fightingStartedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        host: { select: { displayName: true } },
        guest: { select: { displayName: true } },
      },
    });
    const store = getBattleStore();
    const items: CreatorMatchesModel.listResponse = [];
    for (const row of rows) {
      const state = await store.get(row.id);
      items.push({
        id: row.id,
        hostDisplayName: row.host.displayName,
        guestDisplayName: row.guest?.displayName ?? null,
        stage: state?.stage ?? null,
        status: 'fighting',
      });
    }
    return items;
  }

  static async getDetail(
    matchId: string
  ): Promise<
    | { ok: true; detail: CreatorMatchesModel.matchDetail }
    | { ok: false; status: 404; message: string }
  > {
    const row = await prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        status: true,
        host: { select: { displayName: true } },
        guest: { select: { displayName: true } },
      },
    });
    if (!row || row.status !== 'fighting') {
      return { ok: false, status: 404, message: 'Бой не найден или уже не идёт' };
    }
    const state = await getBattleStore().get(matchId);
    if (!state) {
      return { ok: false, status: 404, message: 'Состояние боя недоступно' };
    }
    return {
      ok: true,
      detail: toDetail(row.id, row.host.displayName, row.guest?.displayName ?? null, state),
    };
  }

  static async patchUnit(input: {
    readonly matchId: string;
    readonly unitId: string;
    readonly patch: CreatorMatchesModel.unitPatchBody;
  }): Promise<
    | { ok: true; detail: CreatorMatchesModel.matchDetail; summary: BattleSummary }
    | { ok: false; status: 400 | 404; message: string }
  > {
    const row = await prisma.match.findUnique({
      where: { id: input.matchId },
      select: {
        id: true,
        status: true,
        host: { select: { displayName: true } },
        guest: { select: { displayName: true } },
      },
    });
    if (!row || row.status !== 'fighting') {
      return { ok: false, status: 404, message: 'Бой не найден или уже не идёт' };
    }

    try {
      return await withBattleLock(input.matchId, async () => {
        const store = getBattleStore();
        const state = await store.get(input.matchId);
        if (!state) {
          return { ok: false as const, status: 404 as const, message: 'Состояние боя недоступно' };
        }
        const unit = state.units.find((item) => item.id === input.unitId);
        if (!unit) {
          return { ok: false as const, status: 404 as const, message: 'Юнит не найден' };
        }
        applyUnitStatsPatch(unit, input.patch);
        await store.set(state);
        const summary = toBattleSummary(state);
        publishBattle(input.matchId, 'battle:state', summary);
        return {
          ok: true as const,
          detail: toDetail(
            row.id,
            row.host.displayName,
            row.guest?.displayName ?? null,
            state
          ),
          summary,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось обновить юнита';
      return { ok: false, status: 400, message };
    }
  }
}
