import { prisma } from '../../shared/db';
import type { PresetsModel } from './model';
import { normalizePresetName, validatePresetSlots } from './validate';

type SlotRow = {
  id: string;
  heroClassCode: string;
  row: number;
  slotOrder: number;
  heroClass: { displayName: string; size: number };
};

type PresetRow = {
  id: string;
  name: string;
  teamSize: number;
  playerId: string | null;
  catalogCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  slots: SlotRow[];
};

const presetInclude = {
  slots: {
    orderBy: { slotOrder: 'asc' as const },
    include: {
      heroClass: { select: { displayName: true, size: true } },
    },
  },
} as const;

function mapPreset(row: PresetRow): PresetsModel.preset {
  return {
    id: row.id,
    name: row.name,
    teamSize: row.teamSize,
    isGlobal: row.playerId === null,
    catalogCode: row.catalogCode,
    slots: row.slots.map((slot) => ({
      id: slot.id,
      heroClassCode: slot.heroClassCode,
      displayName: slot.heroClass.displayName,
      size: slot.heroClass.size,
      row: slot.row,
      slotOrder: slot.slotOrder,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadHeroMap(): Promise<
  Map<string, { code: string; displayName: string; size: number; isPlayable: boolean }>
> {
  const heroes = await prisma.heroClass.findMany({
    select: { code: true, displayName: true, size: true, isPlayable: true },
  });
  return new Map(heroes.map((hero) => [hero.code, hero]));
}

/**
 * CRUD пресетов отряда (личные + глобальные для admin).
 */
export class PresetsService {
  static async list(input: {
    readonly playerId: string;
    readonly teamSize?: number | null;
    readonly scope?: 'mine' | 'global' | 'all';
  }): Promise<PresetsModel.preset[]> {
    const scope = input.scope ?? 'all';
    const where =
      scope === 'mine'
        ? { playerId: input.playerId }
        : scope === 'global'
          ? { playerId: null }
          : {
              OR: [{ playerId: input.playerId }, { playerId: null }],
            };
    const rows = await prisma.squadPreset.findMany({
      where: {
        ...where,
        ...(typeof input.teamSize === 'number' ? { teamSize: input.teamSize } : {}),
      },
      include: presetInclude,
      orderBy: [{ playerId: 'asc' }, { teamSize: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => mapPreset(row));
  }

  static async getById(id: string): Promise<PresetsModel.preset | null> {
    const row = await prisma.squadPreset.findUnique({
      where: { id },
      include: presetInclude,
    });
    return row ? mapPreset(row) : null;
  }

  /**
   * Пресет доступен игроку: свой или глобальный.
   */
  static async getUsableByPlayer(
    presetId: string,
    playerId: string
  ): Promise<PresetRow | null> {
    const row = await prisma.squadPreset.findUnique({
      where: { id: presetId },
      include: presetInclude,
    });
    if (!row) {
      return null;
    }
    if (row.playerId !== null && row.playerId !== playerId) {
      return null;
    }
    return row;
  }

  static async create(input: {
    readonly playerId: string;
    readonly isAdmin: boolean;
    readonly body: PresetsModel.createBody;
  }): Promise<
    | { ok: true; preset: PresetsModel.preset }
    | { ok: false; message: string; status: 400 | 403 }
  > {
    const wantGlobal = Boolean(input.body.global);
    if (wantGlobal && !input.isAdmin) {
      return { ok: false, message: 'Недостаточно прав', status: 403 };
    }
    const name = normalizePresetName(input.body.name);
    if (!name) {
      return { ok: false, message: 'Некорректное имя пресета', status: 400 };
    }
    const heroesByCode = await loadHeroMap();
    const validated = validatePresetSlots({
      slots: input.body.slots,
      heroesByCode,
    });
    if (!validated.ok) {
      return { ok: false, message: validated.message, status: 400 };
    }
    const row = await prisma.squadPreset.create({
      data: {
        name,
        teamSize: validated.teamSize,
        playerId: wantGlobal ? null : input.playerId,
        catalogCode: null,
        slots: {
          create: validated.slots.map((slot, index) => ({
            heroClassCode: slot.heroClassCode,
            row: slot.row,
            slotOrder: index,
          })),
        },
      },
      include: presetInclude,
    });
    return { ok: true, preset: mapPreset(row) };
  }

  static async update(input: {
    readonly presetId: string;
    readonly playerId: string;
    readonly isAdmin: boolean;
    readonly body: PresetsModel.updateBody;
  }): Promise<
    | { ok: true; preset: PresetsModel.preset }
    | { ok: false; message: string; status: 400 | 403 | 404 }
  > {
    const existing = await prisma.squadPreset.findUnique({
      where: { id: input.presetId },
      select: { id: true, playerId: true },
    });
    if (!existing) {
      return { ok: false, message: 'Пресет не найден', status: 404 };
    }
    const isGlobal = existing.playerId === null;
    if (isGlobal && !input.isAdmin) {
      return { ok: false, message: 'Недостаточно прав', status: 403 };
    }
    if (!isGlobal && existing.playerId !== input.playerId) {
      return { ok: false, message: 'Недостаточно прав', status: 403 };
    }

    let name: string | undefined;
    if (input.body.name !== undefined) {
      const normalized = normalizePresetName(input.body.name);
      if (!normalized) {
        return { ok: false, message: 'Некорректное имя пресета', status: 400 };
      }
      name = normalized;
    }

    let teamSize: number | undefined;
    let slotsCreate:
      | Array<{ heroClassCode: string; row: number; slotOrder: number }>
      | undefined;
    if (input.body.slots) {
      const heroesByCode = await loadHeroMap();
      const validated = validatePresetSlots({
        slots: input.body.slots,
        heroesByCode,
      });
      if (!validated.ok) {
        return { ok: false, message: validated.message, status: 400 };
      }
      teamSize = validated.teamSize;
      slotsCreate = validated.slots.map((slot, index) => ({
        heroClassCode: slot.heroClassCode,
        row: slot.row,
        slotOrder: index,
      }));
    }

    if (slotsCreate) {
      await prisma.squadPresetSlot.deleteMany({ where: { presetId: existing.id } });
    }

    const row = await prisma.squadPreset.update({
      where: { id: existing.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(teamSize !== undefined ? { teamSize } : {}),
        ...(slotsCreate
          ? {
              slots: { create: slotsCreate },
            }
          : {}),
      },
      include: presetInclude,
    });
    return { ok: true, preset: mapPreset(row) };
  }

  static async remove(input: {
    readonly presetId: string;
    readonly playerId: string;
    readonly isAdmin: boolean;
  }): Promise<{ ok: true } | { ok: false; message: string; status: 403 | 404 }> {
    const existing = await prisma.squadPreset.findUnique({
      where: { id: input.presetId },
      select: { id: true, playerId: true },
    });
    if (!existing) {
      return { ok: false, message: 'Пресет не найден', status: 404 };
    }
    const isGlobal = existing.playerId === null;
    if (isGlobal && !input.isAdmin) {
      return { ok: false, message: 'Недостаточно прав', status: 403 };
    }
    if (!isGlobal && existing.playerId !== input.playerId) {
      return { ok: false, message: 'Недостаточно прав', status: 403 };
    }
    await prisma.squadPreset.delete({ where: { id: existing.id } });
    return { ok: true };
  }
}
