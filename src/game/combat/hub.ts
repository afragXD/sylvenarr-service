import type { BattleSummary } from './engine';

/** Мета итога в кадре battle:ended — чтобы клиент не ждал отдельный GET. */
export type BattleEndedMeta = {
  readonly durationSeconds: number | null;
  readonly ratings: ReadonlyArray<{
    readonly playerId: string;
    readonly ptsBefore: number;
    readonly ptsAfter: number;
    readonly ptsDelta: number;
  }>;
};

export type BattleHubPayload = {
  readonly type: 'battle:state' | 'battle:ended';
  readonly battle: BattleSummary;
  readonly resultMeta?: BattleEndedMeta;
};

type Listener = (payload: BattleHubPayload) => void;

const rooms = new Map<string, Set<Listener>>();

/**
 * In-process fan-out для WebSocket комнат матча.
 */
export function subscribeBattle(matchId: string, listener: Listener): () => void {
  let set = rooms.get(matchId);
  if (!set) {
    set = new Set();
    rooms.set(matchId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) {
      rooms.delete(matchId);
    }
  };
}

/**
 * Рассылает снимок боя подписчикам комнаты.
 */
export function publishBattle(
  matchId: string,
  type: 'battle:state' | 'battle:ended',
  battle: BattleSummary,
  resultMeta?: BattleEndedMeta
): void {
  const set = rooms.get(matchId);
  if (!set) {
    return;
  }
  const payload: BattleHubPayload = resultMeta ? { type, battle, resultMeta } : { type, battle };
  for (const listener of set) {
    try {
      listener(payload);
    } catch {
      /* ignore broken sockets */
    }
  }
}
