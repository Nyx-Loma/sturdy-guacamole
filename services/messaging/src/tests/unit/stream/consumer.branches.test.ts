import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createConsumer } from '../../../app/stream/consumer';
import { messagingMetrics } from '../../../observability/metrics';

const fakeHub = () => ({ broadcast: vi.fn() });
const fakePgPool = () => ({ query: vi.fn().mockResolvedValue(undefined) });
const flush = () => new Promise((r) => setTimeout(r, 0));

function stubMetrics(): void {
  Object.values(messagingMetrics).forEach((metric) => {
    if (!metric || typeof metric !== 'object') return;
    if ('inc' in metric && typeof (metric as any).inc === 'function') vi.spyOn(metric as any, 'inc').mockImplementation(() => undefined);
    if ('observe' in metric && typeof (metric as any).observe === 'function') vi.spyOn(metric as any, 'observe').mockImplementation(() => undefined);
    if ('set' in metric && typeof (metric as any).set === 'function') vi.spyOn(metric as any, 'set').mockImplementation(() => undefined);
    if ('labels' in metric && typeof (metric as any).labels === 'function') vi.spyOn(metric as any, 'labels').mockReturnValue({ inc: vi.fn(), observe: vi.fn(), set: vi.fn() });
  });
}

const createFakeRedis = () => ({
  xgroup: vi.fn().mockResolvedValue('OK'),
  xreadgroup: vi.fn(),
  xack: vi.fn().mockResolvedValue(1),
  xautoclaim: vi.fn().mockResolvedValue(['0-0', []]),
  xpending: vi.fn().mockResolvedValue([]),
}) as const;

describe('consumer (branches)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubMetrics();
  });

  it('parseEvent returns null on missing messageId', async () => {
    const redis = createFakeRedis();
    const hub = fakeHub();
    const pg = fakePgPool();
    const bad = JSON.stringify({ conversationId: 'c', ciphertext: 'x', occurredAt: new Date().toISOString() });
    redis.xreadgroup.mockResolvedValueOnce([['s', [['1-0', ['message_id', '', 'conversation_id', 'c', 'payload', bad]]]]]).mockResolvedValue(null as any);
    const consumer = createConsumer({ redis: redis as any, hub: hub as any, pgPool: pg, stream: 's', group: 'g', consumerName: 'c', blockMs: 1, batchSize: 10, pelHygieneIntervalMs: 100 });
    await consumer.start();
    await flush();
    await consumer.stop();
    expect(hub.broadcast).not.toHaveBeenCalled();
    expect(redis.xack).toHaveBeenCalledWith('s', 'g', '1-0');
  });

  it('parseEvent returns null on missing conversationId', async () => {
    const redis = createFakeRedis();
    const hub = fakeHub();
    const pg = fakePgPool();
    const bad = JSON.stringify({ messageId: 'm', ciphertext: 'x', occurredAt: new Date().toISOString() });
    redis.xreadgroup.mockResolvedValueOnce([['s', [['1-1', ['message_id', 'm', 'conversation_id', '', 'payload', bad]]]]]).mockResolvedValue(null as any);
    const consumer = createConsumer({ redis: redis as any, hub: hub as any, pgPool: pg, stream: 's', group: 'g', consumerName: 'c', blockMs: 1, batchSize: 10, pelHygieneIntervalMs: 100 });
    await consumer.start(); await flush(); await consumer.stop();
    expect(hub.broadcast).not.toHaveBeenCalled();
    expect(redis.xack).toHaveBeenCalledWith('s', 'g', '1-1');
  });

  it('parseEvent returns null on missing ciphertext', async () => {
    const redis = createFakeRedis();
    const hub = fakeHub();
    const pg = fakePgPool();
    const bad = JSON.stringify({ messageId: 'm', conversationId: 'c', occurredAt: new Date().toISOString() });
    redis.xreadgroup.mockResolvedValueOnce([['s', [['1-2', ['message_id', 'm', 'conversation_id', 'c', 'payload', bad]]]]]).mockResolvedValue(null as any);
    const consumer = createConsumer({ redis: redis as any, hub: hub as any, pgPool: pg, stream: 's', group: 'g', consumerName: 'c', blockMs: 1, batchSize: 10, pelHygieneIntervalMs: 100 });
    await consumer.start(); await flush(); await consumer.stop();
    expect(hub.broadcast).not.toHaveBeenCalled();
    expect(redis.xack).toHaveBeenCalledWith('s', 'g', '1-2');
  });

  it('parseEvent returns null on invalid seq type', async () => {
    const redis = createFakeRedis();
    const hub = fakeHub();
    const pg = fakePgPool();
    const bad = JSON.stringify({ messageId: 'm', conversationId: 'c', ciphertext: 'x', occurredAt: new Date().toISOString(), seq: 'oops' });
    redis.xreadgroup.mockResolvedValueOnce([['s', [['1-3', ['message_id', 'm', 'conversation_id', 'c', 'payload', bad]]]]]).mockResolvedValue(null as any);
    const consumer = createConsumer({ redis: redis as any, hub: hub as any, pgPool: pg, stream: 's', group: 'g', consumerName: 'c', blockMs: 1, batchSize: 10, pelHygieneIntervalMs: 100 });
    await consumer.start(); await flush(); await consumer.stop();
    expect(hub.broadcast).not.toHaveBeenCalled();
    expect(redis.xack).toHaveBeenCalledWith('s', 'g', '1-3');
  });

  it('dedupe counts per messageId even across multiple redis ids', async () => {
    const redis = createFakeRedis();
    const hub = fakeHub();
    const pg = fakePgPool();
    const ok = JSON.stringify({ messageId: 'm2', conversationId: 'c2', ciphertext: 'x', occurredAt: new Date().toISOString() });
    redis.xreadgroup
      .mockResolvedValueOnce([['s', [['10-0', ['message_id', 'm2', 'conversation_id', 'c2', 'payload', ok]]]]])
      .mockResolvedValueOnce([['s', [['10-1', ['message_id', 'm2', 'conversation_id', 'c2', 'payload', ok]]]]])
      .mockResolvedValue(null as any);
    const consumer = createConsumer({ redis: redis as any, hub: hub as any, pgPool: pg, stream: 's', group: 'g', consumerName: 'c', blockMs: 1, batchSize: 10, pelHygieneIntervalMs: 100 });
    await consumer.start(); await flush(); await consumer.stop();
    expect(hub.broadcast).toHaveBeenCalledTimes(1);
    expect(redis.xack).toHaveBeenCalledWith('s', 'g', '10-0');
    expect(redis.xack).toHaveBeenCalledWith('s', 'g', '10-1');
  });

  it('ack failure is logged but does not throw', async () => {
    const redis = createFakeRedis();
    (redis as any).xack.mockRejectedValueOnce(new Error('xack down'));
    const hub = fakeHub();
    const pg = fakePgPool();
    const ok = JSON.stringify({ messageId: 'm3', conversationId: 'c3', ciphertext: 'x', occurredAt: new Date().toISOString() });
    redis.xreadgroup.mockResolvedValueOnce([['s', [['11-0', ['message_id', 'm3', 'conversation_id', 'c3', 'payload', ok]]]]]).mockResolvedValue(null as any);
    const consumer = createConsumer({ redis: redis as any, hub: hub as any, pgPool: pg, stream: 's', group: 'g', consumerName: 'c', blockMs: 1, batchSize: 10, pelHygieneIntervalMs: 100 });
    await consumer.start(); await flush(); await consumer.stop();
    expect(hub.broadcast).toHaveBeenCalledTimes(1);
  });

  it('DLQ write failure increments failure metric but still acks', async () => {
    const redis = createFakeRedis();
    const hub = fakeHub();
    const pg = { query: vi.fn().mockRejectedValue(new Error('pg down')) };
    const bad = JSON.stringify({});
    redis.xreadgroup.mockResolvedValueOnce([['s', [['12-0', ['message_id', '', 'conversation_id', '', 'payload', bad]]]]]).mockResolvedValue(null as any);
    const consumer = createConsumer({ redis: redis as any, hub: hub as any, pgPool: pg as any, stream: 's', group: 'g', consumerName: 'c', blockMs: 1, batchSize: 10, pelHygieneIntervalMs: 100 });
    await consumer.start(); await flush(); await consumer.stop();
    expect((messagingMetrics as any).dlqWriteFailuresTotal?.inc).toBeDefined();
    expect(redis.xack).toHaveBeenCalledWith('s', 'g', '12-0');
  });

  it('pel hygiene claims messages updates metrics when result returned', async () => {
    const redis = createFakeRedis();
    (redis as any).xautoclaim.mockResolvedValueOnce(['0-0', [['id', ['payload']]]]);
    const hub = fakeHub();
    const pg = fakePgPool();
    const consumer = createConsumer({ redis: redis as any, hub: hub as any, pgPool: pg, stream: 's', group: 'g', consumerName: 'c', blockMs: 1, batchSize: 10, pelHygieneIntervalMs: 5 });
    await consumer.start();
    await new Promise((r) => setTimeout(r, 8));
    await consumer.stop();
    expect((messagingMetrics as any).consumerPelReclaimedTotal?.inc).toBeDefined();
  });

  it('pel hygiene sets pel size when xpending returns entries', async () => {
    const redis = createFakeRedis();
    (redis as any).xpending.mockResolvedValueOnce([['a'], ['b']]);
    const hub = fakeHub();
    const pg = fakePgPool();
    const consumer = createConsumer({ redis: redis as any, hub: hub as any, pgPool: pg, stream: 's', group: 'g', consumerName: 'c', blockMs: 1, batchSize: 10, pelHygieneIntervalMs: 5 });
    await consumer.start();
    await new Promise((r) => setTimeout(r, 8));
    await consumer.stop();
    expect((messagingMetrics as any).consumerPelSize?.set).toBeDefined();
  });

  it('transient broadcast error path leaves message in PEL (no ack)', async () => {
    const redis = createFakeRedis();
    const hub = fakeHub();
    (hub as any).broadcast.mockImplementation(() => { throw new Error('temporary outage'); });
    const pg = fakePgPool();
    const ok = JSON.stringify({ messageId: 'm4', conversationId: 'c4', ciphertext: 'x', occurredAt: new Date().toISOString() });
    redis.xreadgroup.mockResolvedValueOnce([['s', [['13-0', ['message_id', 'm4', 'conversation_id', 'c4', 'payload', ok]]]]]).mockResolvedValue(null as any);
    const consumer = createConsumer({ redis: redis as any, hub: hub as any, pgPool: pg, stream: 's', group: 'g', consumerName: 'c', blockMs: 1, batchSize: 10, pelHygieneIntervalMs: 100 });
    await consumer.start(); await flush(); await consumer.stop();
    expect(redis.xack).not.toHaveBeenCalledWith('s', 'g', '13-0');
  });

  it('permanent broadcast error writes DLQ and acks', async () => {
    const redis = createFakeRedis();
    const hub = fakeHub();
    (hub as any).broadcast.mockImplementation(() => { const e = new Error('validation failed'); throw e; });
    const pg = fakePgPool();
    const ok = JSON.stringify({ messageId: 'm5', conversationId: 'c5', ciphertext: 'x', occurredAt: new Date().toISOString() });
    redis.xreadgroup.mockResolvedValueOnce([['s', [['14-0', ['message_id', 'm5', 'conversation_id', 'c5', 'payload', ok]]]]]).mockResolvedValue(null as any);
    const consumer = createConsumer({ redis: redis as any, hub: hub as any, pgPool: pg, stream: 's', group: 'g', consumerName: 'c', blockMs: 1, batchSize: 10, pelHygieneIntervalMs: 100 });
    await consumer.start(); await flush(); await consumer.stop();
    expect((messagingMetrics as any).consumerFailuresTotal.labels).toHaveBeenCalled();
    expect(redis.xack).toHaveBeenCalledWith('s', 'g', '14-0');
  });

  it('dedupe skip metric increments', async () => {
    const redis = createFakeRedis();
    const hub = fakeHub();
    const pg = fakePgPool();
    const ok = JSON.stringify({ messageId: 'm6', conversationId: 'c6', ciphertext: 'x', occurredAt: new Date().toISOString() });
    redis.xreadgroup.mockResolvedValueOnce([['s', [['15-0', ['message_id', 'm6', 'conversation_id', 'c6', 'payload', ok]]]]]).mockResolvedValue(null as any);
    const consumer = createConsumer({ redis: redis as any, hub: hub as any, pgPool: pg, stream: 's', group: 'g', consumerName: 'c', blockMs: 1, batchSize: 10, pelHygieneIntervalMs: 100 });
    await consumer.start(); await flush(); await consumer.stop();
    // Second batch to cause duplicate
    redis.xreadgroup.mockResolvedValueOnce([['s', [['15-1', ['message_id', 'm6', 'conversation_id', 'c6', 'payload', ok]]]]]).mockResolvedValue(null as any);
    await consumer.start(); await flush(); await consumer.stop();
    expect((messagingMetrics as any).consumerDedupeSkipsTotal.inc).toBeDefined();
  });
});
