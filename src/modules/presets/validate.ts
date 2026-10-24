import { MAX_ROW_SIZE, ROW_BACK, ROW_FRONT } from '../../game/draft/settings';
import type { DraftHeroRef } from '../../game/draft/types';

export const PRESET_TEAM_SIZE_MIN = 3;
export const PRESET_TEAM_SIZE_MAX = 6;
export const PRESET_NAME_MAX = 40;

export type PresetSlotDraft = {
  readonly heroClassCode: string;
  readonly row: number;
};

export type PresetValidation =
  | { ok: true; teamSize: number; slots: ReadonlyArray<PresetSlotDraft & { size: number }> }
  | { ok: false; message: string };

/**
 * Валидация слотов пресета: playable, ряды, квота 3–6, maxRowSize.
 */
export function validatePresetSlots(input: {
  readonly slots: ReadonlyArray<PresetSlotDraft>;
  readonly heroesByCode: ReadonlyMap<string, DraftHeroRef>;
  readonly maxRowSize?: number;
}): PresetValidation {
  const maxRowSize = input.maxRowSize ?? MAX_ROW_SIZE;
  if (input.slots.length === 0) {
    return { ok: false, message: 'Нужен хотя бы один герой' };
  }
  const resolved: Array<PresetSlotDraft & { size: number }> = [];
  let teamSize = 0;
  const rowCounts = new Map<number, number>();

  for (const slot of input.slots) {
    if (slot.row !== ROW_FRONT && slot.row !== ROW_BACK) {
      return { ok: false, message: 'Некорректный ряд' };
    }
    const hero = input.heroesByCode.get(slot.heroClassCode);
    if (!hero || !hero.isPlayable) {
      return { ok: false, message: `Класс «${slot.heroClassCode}» недоступен` };
    }
    const rowCount = (rowCounts.get(slot.row) ?? 0) + 1;
    if (rowCount > maxRowSize) {
      return { ok: false, message: 'На этом ряду нет места' };
    }
    rowCounts.set(slot.row, rowCount);
    teamSize += hero.size;
    resolved.push({ ...slot, size: hero.size });
  }

  if (teamSize < PRESET_TEAM_SIZE_MIN || teamSize > PRESET_TEAM_SIZE_MAX) {
    return {
      ok: false,
      message: `Размер пресета должен быть от ${PRESET_TEAM_SIZE_MIN} до ${PRESET_TEAM_SIZE_MAX} (сейчас ${teamSize})`,
    };
  }

  return { ok: true, teamSize, slots: resolved };
}

export function normalizePresetName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < 1 || name.length > PRESET_NAME_MAX) {
    return null;
  }
  return name;
}
