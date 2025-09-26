import type Redis from 'ioredis';
import type { NonceStore } from '../../domain/services/deviceAssertion';

const keyFor = (deviceId: string, nonce: string) => `nonce:${deviceId}:${nonce}`;

export const createRedisNonceStore = (redis: Redis): NonceStore => {
  return {
    async issue(deviceId, nonce, ttlMs) {
      const key = keyFor(deviceId, nonce);
      await redis.set(key, '1', 'PX', ttlMs);
    },
    async consume(deviceId, nonce) {
      const key = keyFor(deviceId, nonce);
      const value = (await redis.getdel(key)) as string | null;
      return value === '1';
    }
  };
};

