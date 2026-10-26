import type { AbilitySlot, BattleSfxEvent, BattleState, BattleUnit } from './types';

const SFX_TAIL = 40;

/**
 * Добавляет звуковое событие в хвост боя. Возвращает seq.
 */
export function pushSfx(
  state: BattleState,
  unit: BattleUnit,
  kind: BattleSfxEvent['kind'],
  slot?: AbilitySlot
): number {
  const seq = (state.sfxSeq ?? 0) + 1;
  state.sfxSeq = seq;
  const events = state.sfxEvents ?? [];
  events.push({
    seq,
    unitId: unit.id,
    heroClassCode: unit.heroClassCode,
    kind,
    ...(slot ? { slot } : {}),
  });
  state.sfxEvents = events.length > SFX_TAIL ? events.slice(-SFX_TAIL) : events;
  return seq;
}

/**
 * Удаляет одно событие по seq (отказ / ожидание выбора в способности).
 */
export function dropSfx(state: BattleState, seq: number): void {
  if (state.sfxEvents) {
    state.sfxEvents = state.sfxEvents.filter((event) => event.seq !== seq);
  }
}
