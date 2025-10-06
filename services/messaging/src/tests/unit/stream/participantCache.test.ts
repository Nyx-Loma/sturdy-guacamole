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
      if (event === 'message') {
        messageHandler = handler;
      }
    }),
    emit: (channel: string, message: string) => {
      messageHandler?.(channel, message);
    },
  } satisfies Partial<FakeRedisType> & { emit: (channel: string, message: string) => void };
};

type FakeRedisType = {
  get: (key: string) => Promise<string | null>;
  setex: (key: string, ttl: number, value: string) => Promise<string>;
  incr: (key: string) => Promise<number>;
  publish: (channel: string, message: string) => Promise<number>;
  subscribe: (channel: string) => Promise<string>;
  unsubscribe: (channel: string) => Promise<string>;
  on: (event: string, handler: (channel: string, message: string) => void) => void;
};

const fakeLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('participant cache', () => {
  let redis: ReturnType<typeof createFakeRedis>;
  let subscriberRedis: ReturnType<typeof createFakeRedis>;

  beforeEach(() => {
    redis = createFakeRedis();
    subscriberRedis = createFakeRedis();
    vi.clearAllMocks();
  });

  const createCache = () =>
    createParticipantCache({
      redis: redis as unknown as FakeRedisType as never,
      subscriberRedis: subscriberRedis as unknown as FakeRedisType as never,
      logger: fakeLogger,
      ttlSeconds: 60,
      invalidationChannel: 'conv.participants.inval',
    });

  it('returns empty array when cache miss', async () => {
    const cache = createCache();

    const result = await cache.get('conv-1');

    expect(result).toEqual([]);
    expect(redis.get).toHaveBeenCalledWith('conv:conv-1:part:ver');
  });

  it('stores entries in redis and memory via set/get', async () => {
    const cache = createCache();

    await cache.set('conv-1', ['user-1', 'user-2']);

    // After set, expect redis.setex called with version 1 key
    expect(redis.setex).toHaveBeenCalledWith('conv:conv-1:participants:v1', 60, JSON.stringify(['user-1', 'user-2']));

    const result = await cache.get('conv-1');
    expect(result).toEqual(['user-1', 'user-2']);
  });

  it('invalidates cache and publishes notification', async () => {
    const cache = createCache();

    await cache.set('conv-1', ['user-1']);
    await cache.invalidate('conv-1');

    expect(redis.publish).toHaveBeenCalledWith(
      'conv.participants.inval',
      JSON.stringify({ conversationId: 'conv-1', version: 1 })
    );
  });

  it('removes stale memory entry when receiving invalidation message', async () => {
    const cache = createCache();
    await cache.set('conv-1', ['user-1']);
    await cache.start();

    // Emulate higher version invalidation
    subscriberRedis.emit('conv.participants.inval', JSON.stringify({ conversationId: 'conv-1', version: 2 }));

    const stats = cache.getStats();
    expect(stats.size).toBe(0);
  });

  it('getStats returns memory cache metadata', async () => {
    const cache = createCache();
    await cache.set('conv-1', ['user-1']);

    const stats = cache.getStats();

    expect(stats.size).toBe(1);
    expect(stats.entries[0].conversationId).toBe('conv-1');
  });
});

