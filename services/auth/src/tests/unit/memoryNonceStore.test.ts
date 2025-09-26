import { describe, expect, it, vi } from 'vitest';
import { createMemoryNonceStore } from '../../adapters/memoryNonceStore';
import { createRedisNonceStore } from '../../adapters/redis';
import Redis from 'ioredis-mock';

describe('nonce stores', () => {
  it('memory store issues and consumes once', async () => {
    const store = createMemoryNonceStore();
    await store.issue('device', 'nonce', 1000);
    expect(await store.consume('device', 'nonce')).toBe(true);
    expect(await store.consume('device', 'nonce')).toBe(false);
  });

  it('redis store issues and consumes once', async () => {
    const redis = new Redis();
    const store = createRedisNonceStore(redis as any);
    await store.issue('device', 'nonce', 1000);
    expect(await store.consume('device', 'nonce')).toBe(true);
    expect(await store.consume('device', 'nonce')).toBe(false);
  });
});


