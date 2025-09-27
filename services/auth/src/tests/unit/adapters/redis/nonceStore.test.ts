import { describe, expect, it, vi } from 'vitest';
import { createRedisNonceStore } from '../../../../adapters/redis/nonceStore';

describe('redis nonce store', () => {
  it('issues nonce with PX ttl and consumes once', async () => {
    const redis = {
      set: vi.fn().mockResolvedValue('OK'),
      getdel: vi.fn().mockResolvedValue('1')
    } as any;
    const store = createRedisNonceStore(redis);
    await store.issue('device', 'nonce', 1000);
    const first = await store.consume('device', 'nonce');
    expect(first).toBe(true);
    expect(redis.set).toHaveBeenCalledWith('nonce:device:nonce', '1', 'PX', 1000);
    expect(redis.getdel).toHaveBeenCalledWith('nonce:device:nonce');
  });

  it('returns false when nonce missing', async () => {
    const redis = {
      set: vi.fn().mockResolvedValue('OK'),
      getdel: vi.fn().mockResolvedValue(null)
    } as any;
    const store = createRedisNonceStore(redis);
    const consumed = await store.consume('device', 'missing');
    expect(consumed).toBe(false);
  });
});

