import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createInMemoryResumeStore, createRedisResumeStore } from '../src/resumeStore';

const sampleState = {
  resumeToken: 'token-123',
  accountId: 'account-1',
  deviceId: 'device-1',
  lastServerSeq: 42,
  expiresAt: Date.now() + 1000,
  outboundFrames: [{ seq: 1, payload: 'data' }]
};

describe('createInMemoryResumeStore', () => {
  it('persists and loads resume state', async () => {
    const store = createInMemoryResumeStore();
    await store.persist(sampleState);
    const loaded = await store.load(sampleState.resumeToken);
    expect(loaded).toEqual(sampleState);
  });

  it('returns null when state missing', async () => {
    const store = createInMemoryResumeStore();
    const loaded = await store.load('missing');
    expect(loaded).toBeNull();
  });

  it('drops state', async () => {
    const store = createInMemoryResumeStore();
    await store.persist(sampleState);
    await store.drop(sampleState.resumeToken);
    expect(await store.load(sampleState.resumeToken)).toBeNull();
  });
});

describe('createRedisResumeStore', () => {
  const redis = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists with TTL and loads value', async () => {
    const store = createRedisResumeStore({ redis: redis as any, keyPrefix: 'test:', ttlSeconds: 60 });
    redis.get.mockResolvedValueOnce(JSON.stringify(sampleState));

    await store.persist(sampleState);
    expect(redis.set).toHaveBeenCalledWith('test:token-123', JSON.stringify(sampleState), 'EX', 60);

    const loaded = await store.load('token-123');
    expect(redis.get).toHaveBeenCalledWith('test:token-123');
    expect(loaded).toEqual(sampleState);
  });

  it('returns null when redis missing entry', async () => {
    const store = createRedisResumeStore({ redis: redis as any });
    redis.get.mockResolvedValueOnce(null);
    const loaded = await store.load(sampleState.resumeToken);
    expect(loaded).toBeNull();
  });

  it('drops redis key', async () => {
    const store = createRedisResumeStore({ redis: redis as any, keyPrefix: 'prefix:' });
    await store.drop(sampleState.resumeToken);
    expect(redis.del).toHaveBeenCalledWith('prefix:token-123');
  });
});
