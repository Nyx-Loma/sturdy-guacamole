import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createParticipantCache } from '../../../app/stream/participantCache';

const createFakeRedis = () => {
  const store = new Map<string, string>();
  let messageHandler: ((channel: string, message: string) => void) | undefined;

  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    incr: vi.fn(async (key: string) => {
      const current = Number(store.get(key) ?? '0');
      const next = current + 1;
      store.set(key, String(next));
      return next;
    }),
    publish: vi.fn(async () => 1),
    subscribe: vi.fn(async () => 'OK'),
    unsubscribe: vi.fn(async () => 'OK'),
    on: vi.fn((event: string, handler: (channel: string, message: string) => void) => {
      if (event === 'message') messageHandler = handler;
    }),
    emit: (channel: string, message: string) => messageHandler?.(channel, message),
  } as const;
};

const fakeLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

describe('participant cache (more)', () => {
  let redis: FakeRedis;
  let subscriberRedis: FakeRedis;

  beforeEach(() => {
    redis = createFakeRedis();
    subscriberRedis = createFakeRedis();
    vi.clearAllMocks();
  });

  const createCache = () =>
    createParticipantCache({
      redis: redis as any,
      subscriberRedis: subscriberRedis as any,
      logger: fakeLogger as any,
      ttlSeconds: 5,
      invalidationChannel: 'conv.participants.inval',
    });

  it('start subscribes and logs, stop unsubscribes and clears', async () => {
    const cache = createCache();
    await cache.start();
    expect(subscriberRedis.subscribe).toHaveBeenCalledWith('conv.participants.inval');
    await cache.stop();
    expect(subscriberRedis.unsubscribe).toHaveBeenCalledWith('conv.participants.inval');
    expect(fakeLogger.info).toHaveBeenCalled();
  });

  it('get uses memory when version unchanged', async () => {
    const cache = createCache();
    await cache.set('c1', ['u1']);
    const first = await cache.get('c1');
    expect(first).toEqual(['u1']);
    // second call should not hit redis again for participants key
    (redis.get as any).mockClear();
    const second = await cache.get('c1');
    expect(second).toEqual(['u1']);
    expect(redis.get).toHaveBeenCalledWith('conv:c1:part:ver');
  });

  it('get falls back to redis when memory is stale', async () => {
    const cache = createCache();
    await cache.set('c1', ['u1']);
    // bump version so memory becomes stale
    await redis.incr('conv:c1:part:ver');
    await redis.incr('conv:c1:part:ver');
    await redis.setex('conv:c1:participants:v2', 5, JSON.stringify(['u1', 'u2']));
    const users = await cache.get('c1');
    expect(users).toEqual(['u1', 'u2']);
  });

  it('set stores using current version key', async () => {
    const cache = createCache();
    await cache.set('c2', ['x']);
    expect(redis.setex).toHaveBeenCalledWith('conv:c2:participants:v1', 5, JSON.stringify(['x']));
  });

  it('invalidate increments version and publishes payload', async () => {
    const cache = createCache();
    await cache.invalidate('c3');
    expect(redis.publish).toHaveBeenCalledWith('conv.participants.inval', JSON.stringify({ conversationId: 'c3', version: 1 }));
    await cache.invalidate('c3');
    expect(redis.publish).toHaveBeenCalledWith('conv.participants.inval', JSON.stringify({ conversationId: 'c3', version: 2 }));
  });

  it('invalidation handler ignores lower or equal version', async () => {
    const cache = createCache();
    await cache.set('c4', ['a']);
    await cache.start();
    // same version -> ignore
    subscriberRedis.emit('conv.participants.inval', JSON.stringify({ conversationId: 'c4', version: 1 }));
    expect(cache.getStats().size).toBe(1);
  });

  it('logs parse error on invalid invalidation message JSON', async () => {
    const cache = createCache();
    await cache.start();
    subscriberRedis.emit('conv.participants.inval', '{not-json');
    expect(fakeLogger.warn).toHaveBeenCalled();
  });

  it('getStats returns ages and entries list', async () => {
    const cache = createCache();
    await cache.set('c5', ['z']);
    const stats = cache.getStats();
    expect(stats.entries.length).toBe(1);
    expect(stats.entries[0].conversationId).toBe('c5');
    expect(typeof stats.entries[0].age).toBe('number');
  });
});


