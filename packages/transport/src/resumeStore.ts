import Redis from 'ioredis';
import type { PersistResumeStateParams, ResumeState } from './types.js';

export interface ResumeStore {
  load: (token: string) => Promise<ResumeState | null>;
  persist: (state: PersistResumeStateParams) => Promise<void>;
  drop: (token: string) => Promise<void>;
}

export const createInMemoryResumeStore = (): ResumeStore => {
  const store = new Map<string, PersistResumeStateParams>();
  return {
    async load(token) {
      const value = store.get(token);
      if (!value) return null;
      const { outboundFrames, ...rest } = value;
      return { ...rest, outboundFrames };
    },
    async persist(state) {
      store.set(state.resumeToken, state);
    },
    async drop(token) {
      store.delete(token);
    }
  };
};

export interface RedisResumeStoreOptions {
  redis: Redis;
  keyPrefix?: string;
  ttlSeconds?: number;
}

const serializeState = (state: PersistResumeStateParams) => JSON.stringify(state);
const deserializeState = (raw: string | null): ResumeState | null => {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as PersistResumeStateParams;
  const { outboundFrames, ...rest } = parsed;
  return { ...rest, outboundFrames };
};

export const createRedisResumeStore = ({ redis, keyPrefix = 'resume:', ttlSeconds = 900 }: RedisResumeStoreOptions): ResumeStore => {
  const key = (token: string) => `${keyPrefix}${token}`;
  return {
    async load(token) {
      const raw = await redis.get(key(token));
      return deserializeState(raw);
    },
    async persist(state) {
      const data = serializeState(state);
      await redis.set(key(state.resumeToken), data, 'EX', ttlSeconds);
    },
    async drop(token) {
      await redis.del(key(token));
    }
  };
};
