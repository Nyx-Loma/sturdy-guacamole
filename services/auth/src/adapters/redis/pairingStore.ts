import type Redis from 'ioredis';

export interface PairingCacheRecord {
  accountId: string;
  primaryDeviceId: string;
  nonce: string;
}

const keyFor = (token: string) => `pairing:${token}`;

export const createRedisPairingStore = (redis: Redis) => {
  return {
    async cache(token: string, record: PairingCacheRecord, ttlMs: number) {
      await redis.set(keyFor(token), JSON.stringify(record), 'PX', ttlMs);
    },
    async get(token: string) {
      const value = await redis.get(keyFor(token));
      return value ? (JSON.parse(value) as PairingCacheRecord) : null;
    },
    async drop(token: string) {
      await redis.del(keyFor(token));
    }
  };
};

