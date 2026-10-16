import type { BattleSummary } from './engine';

type Listener = (payload: { type: 'battle:state' | 'battle:ended'; battle: BattleSummary }) => void;

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
  battle: BattleSummary
): void {
  const set = rooms.get(matchId);
  if (!set) {
    return;
  }
  for (const listener of set) {
    try {
      listener({ type, battle });
    } catch {
      /* ignore broken sockets */
    }
  }
}
