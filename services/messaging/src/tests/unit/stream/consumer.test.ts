import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createConsumer } from '../../../app/stream/consumer';
// TODO: Update test to use createMockMetrics() when refactoring

type FakeRedis = ReturnType<typeof createFakeRedis>;

function createFakeRedis() {
  return {
    xgroup: vi.fn().mockResolvedValue('OK'),
    xreadgroup: vi.fn(),
    xack: vi.fn().mockResolvedValue(1),
    xautoclaim: vi.fn().mockResolvedValue(['0-0', []]),
    xpending: vi.fn().mockResolvedValue([]),
    quit: vi.fn().mockResolvedValue('OK'),
  } as const;
}

const fakeHub = () => ({
  broadcast: vi.fn(),
  getMetricsRegistry: vi.fn().mockReturnValue({ metrics: vi.fn().mockResolvedValue('') })
});

const fakePgPool = () => ({ query: vi.fn().mockResolvedValue(undefined) });

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function stubMetrics(): void {
  Object.values(messagingMetrics).forEach((metric) => {
    if (!metric || typeof metric !== 'object') return;
    if ('inc' in metric && typeof metric.inc === 'function') {
      vi.spyOn(metric, 'inc').mockImplementation(() => undefined);
    }
    if ('observe' in metric && typeof metric.observe === 'function') {
      vi.spyOn(metric, 'observe').mockImplementation(() => undefined);
    }
    if ('set' in metric && typeof metric.set === 'function') {
      vi.spyOn(metric, 'set').mockImplementation(() => undefined);
    }
    if ('labels' in metric && typeof metric.labels === 'function') {
      vi.spyOn(metric, 'labels').mockReturnValue({
        inc: vi.fn(),
        observe: vi.fn(),
        set: vi.fn(),
      });
    }
  });
}

describe('consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubMetrics();
  });

  it('broadcasts messages and acknowledges them', async () => {
    const redis = createFakeRedis();
    const hub = fakeHub();
    const pgPool = fakePgPool();

    const payload = JSON.stringify({
      messageId: 'm1',
      conversationId: 'c1',
      ciphertext: 'cipher',
      occurredAt: new Date().toISOString(),
    });

    redis.xreadgroup
      .mockResolvedValueOnce([
        ['stream', [
          ['161-0', ['message_id', 'm1', 'conversation_id', 'c1', 'payload', payload]],
        ]],
      ])
      .mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return null;
      });

    const consumer = createConsumer({
      redis: redis as unknown as FakeRedis,
      pgPool,
      hub,
      stream: 'stream',
      group: 'group',
      consumerName: 'consumer-1',
      batchSize: 10,
      blockMs: 1,
      pelHygieneIntervalMs: 100,
      logger: console,
    });

    await consumer.start();
    await flush();
    await consumer.stop();

    expect(hub.broadcast).toHaveBeenCalledTimes(1);
    expect(redis.xack).toHaveBeenCalledWith('stream', 'group', '161-0');
    expect(pgPool.query).not.toHaveBeenCalled();
  });

  it('writes to DLQ and acknowledges on parse error', async () => {
    const redis = createFakeRedis();
    const hub = fakeHub();
    const pgPool = fakePgPool();

    redis.xreadgroup
      .mockResolvedValueOnce([
        ['stream', [
          ['162-0', ['message_id', 'bad', 'conversation_id', 'bad', 'payload', '{']],
        ]],
      ])
      .mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return null;
      });

    const consumer = createConsumer({
      redis: redis as unknown as FakeRedis,
      pgPool,
      hub,
      stream: 'stream',
      group: 'group',
      consumerName: 'consumer-1',
      batchSize: 10,
      blockMs: 1,
      pelHygieneIntervalMs: 100,
      logger: console,
    });

    await consumer.start();
    await flush();
    await consumer.stop();

    expect(pgPool.query).toHaveBeenCalled();
    expect(redis.xack).toHaveBeenCalledWith('stream', 'group', '162-0');
    expect(hub.broadcast).not.toHaveBeenCalled();
  });

  it('skips duplicate messages by messageId', async () => {
    const redis = createFakeRedis();
    const hub = fakeHub();
    const pgPool = fakePgPool();

    const event = {
      messageId: 'm1',
      conversationId: 'c1',
      ciphertext: 'cipher',
      occurredAt: new Date().toISOString(),
    };

    redis.xreadgroup
      .mockResolvedValueOnce([
        ['stream', [
          ['200-0', ['message_id', 'm1', 'conversation_id', 'c1', 'payload', JSON.stringify(event)]],
        ]],
      ])
      .mockResolvedValueOnce([
        ['stream', [
          ['200-1', ['message_id', 'm1', 'conversation_id', 'c1', 'payload', JSON.stringify(event)]],
        ]],
      ])
      .mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return null;
      });

    const consumer = createConsumer({
      redis: redis as unknown as FakeRedis,
      pgPool,
      hub,
      stream: 'stream',
      group: 'group',
      consumerName: 'consumer-1',
      batchSize: 10,
      blockMs: 1,
      pelHygieneIntervalMs: 100,
      logger: console,
    });

    await consumer.start();
    await flush();
    await consumer.stop();

    expect(hub.broadcast).toHaveBeenCalledTimes(1);
    expect(redis.xack).toHaveBeenCalledWith('stream', 'group', '200-0');
    expect(redis.xack).toHaveBeenCalledWith('stream', 'group', '200-1');
    expect(pgPool.query).not.toHaveBeenCalled();
  });
});

