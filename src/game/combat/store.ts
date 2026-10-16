import Redis from 'ioredis';

import { config } from '../../config';
import type { BattleState } from './types';

export interface BattleStore {
  get(matchId: string): Promise<BattleState | null>;
  set(state: BattleState): Promise<void>;
  delete(matchId: string): Promise<void>;
}

const memory = new Map<string, string>();

class MemoryBattleStore implements BattleStore {
  async get(matchId: string): Promise<BattleState | null> {
    const raw = memory.get(matchId);
    return raw ? (JSON.parse(raw) as BattleState) : null;
  }

  async set(state: BattleState): Promise<void> {
    memory.set(state.matchId, JSON.stringify(state));
  }

  async delete(matchId: string): Promise<void> {
    memory.delete(matchId);
  }
}

class RedisBattleStore implements BattleStore {
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: 2, lazyConnect: true });
  }

  private key(matchId: string): string {
    return `sylvenarr:battle:${matchId}`;
  }

  async get(matchId: string): Promise<BattleState | null> {
    if (this.redis.status !== 'ready') {
      await this.redis.connect();
    }
    const raw = await this.redis.get(this.key(matchId));
    return raw ? (JSON.parse(raw) as BattleState) : null;
  }

  async set(state: BattleState): Promise<void> {
    if (this.redis.status !== 'ready') {
      await this.redis.connect();
    }
    await this.redis.set(this.key(state.matchId), JSON.stringify(state), 'EX', 60 * 60 * 6);
  }

  async delete(matchId: string): Promise<void> {
    if (this.redis.status !== 'ready') {
      await this.redis.connect();
    }
    await this.redis.del(this.key(matchId));
  }
}

let store: BattleStore | null = null;

/**
 * Store боя: Redis если есть REDIS_URL, иначе память процесса.
 */
export function getBattleStore(): BattleStore {
  if (store) {
    return store;
  }
  if (config.REDIS_URL) {
    store = new RedisBattleStore(config.REDIS_URL);
    return store;
  }
  store = new MemoryBattleStore();
  return store;
}

/** Только для тестов. */
export function resetBattleStoreForTests(): void {
  memory.clear();
  store = new MemoryBattleStore();
}
