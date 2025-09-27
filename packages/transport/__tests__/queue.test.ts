import { describe, expect, it, vi } from 'vitest';
import { createQueueConsumer, createRedisStreamQueue } from '../src/queue';

const makeRedis = () => ({
  xgroup: vi.fn().mockResolvedValue(undefined),
  xreadgroup: vi.fn(),
  xack: vi.fn().mockResolvedValue(undefined),
  xdel: vi.fn().mockResolvedValue(undefined),
  xclaim: vi.fn().mockResolvedValue(undefined),
  xpending: vi.fn().mockResolvedValue(undefined)
});

// consumer tests

describe('queue consumer', () => {
  it('acks on successful broadcast', async () => {
    const hub = { broadcast: vi.fn() } as any;
    const ack = vi.fn().mockResolvedValue(undefined);
    const reject = vi.fn().mockResolvedValue(undefined);
    const subscribe = vi.fn().mockImplementation(async (handler) => {
      await handler({ id: '1', payload: { type: 'msg' } as any });
    });
    await createQueueConsumer({ hub, queue: { subscribe, ack, reject } });
    expect(hub.broadcast).toHaveBeenCalled();
    expect(ack).toHaveBeenCalled();
  });

  it('rejects on broadcast failure', async () => {
    const error = new Error('boom');
    const hub = { broadcast: vi.fn().mockImplementation(() => { throw error; }) } as any;
    const ack = vi.fn().mockResolvedValue(undefined);
    const reject = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const subscribe = vi.fn().mockImplementation(async (handler) => {
      await handler({ id: '1', payload: { type: 'msg' } as any });
    });
    await createQueueConsumer({ hub, queue: { subscribe, ack, reject }, onError });
    expect(onError).toHaveBeenCalledWith(error);
    expect(reject).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }), true);
  });
});

describe('createRedisStreamQueue', () => {
  it('invokes handler for stream payloads', async () => {
    const redis = makeRedis();
    const queue = createRedisStreamQueue({
      redis: redis as any,
      streamKey: 'stream',
      consumerGroup: 'group',
      consumerName: 'consumer',
      blockMs: 1,
      readCount: 1
    });

    redis.xreadgroup
      .mockResolvedValueOnce([[
        'stream',
        [
          [
            '1',
            {
              payload: JSON.stringify({ type: 'msg', id: 'abc' })
            }
          ]
        ]
      ]])
      .mockImplementationOnce(async () => {
        await queue.close?.();
        return undefined;
      });

    const handler = vi.fn().mockResolvedValue(undefined);
    await queue.subscribe(handler);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
  });

  it('ignores malformed payloads', async () => {
    const redis = makeRedis();
    const queue = createRedisStreamQueue({
      redis: redis as any,
      streamKey: 'stream',
      consumerGroup: 'group',
      consumerName: 'consumer',
      blockMs: 1,
      readCount: 1
    });

    redis.xreadgroup
      .mockResolvedValueOnce([[ 'stream', [['1', { payload: 'invalid-json' }]] ]])
      .mockImplementationOnce(async () => {
        await queue.close?.();
        return undefined;
      });

    const handler = vi.fn();
    await queue.subscribe(handler);
    expect(handler).not.toHaveBeenCalled();
    expect(redis.xack).toHaveBeenCalledWith('stream', 'group', '1');
  });

  it('acknowledges and deletes on ack', async () => {
    const redis = makeRedis();
    const queue = createRedisStreamQueue({
      redis: redis as any,
      streamKey: 'stream',
      consumerGroup: 'group',
      consumerName: 'consumer'
    });
    await queue.ack({ id: '1', payload: {} as any });
    expect(redis.xack).toHaveBeenCalledWith('stream', 'group', '1');
    expect(redis.xdel).toHaveBeenCalledWith('stream', '1');
  });

  it('no-ops ack when message has no id', async () => {
    const redis = makeRedis();
    const queue = createRedisStreamQueue({
      redis: redis as any,
      streamKey: 'stream',
      consumerGroup: 'group',
      consumerName: 'consumer'
    });
    await queue.ack({ payload: {} as any });
    expect(redis.xack).not.toHaveBeenCalled();
    expect(redis.xdel).not.toHaveBeenCalled();
  });

  it('replays retryable rejects', async () => {
    const redis = makeRedis();
    const queue = createRedisStreamQueue({
      redis: redis as any,
      streamKey: 'stream',
      consumerGroup: 'group',
      consumerName: 'consumer'
    });
    await queue.reject({ id: '1', payload: {} as any }, true);
    expect(redis.xclaim).toHaveBeenCalled();
    expect(redis.xpending).toHaveBeenCalled();
  });

  it('acks non-retryable rejects', async () => {
    const redis = makeRedis();
    const queue = createRedisStreamQueue({
      redis: redis as any,
      streamKey: 'stream',
      consumerGroup: 'group',
      consumerName: 'consumer'
    });
    await queue.reject({ id: '1', payload: {} as any }, false);
    expect(redis.xack).toHaveBeenCalledWith('stream', 'group', '1');
    expect(redis.xdel).toHaveBeenCalledWith('stream', '1');
  });

  it('no-ops reject without id', async () => {
    const redis = makeRedis();
    const queue = createRedisStreamQueue({
      redis: redis as any,
      streamKey: 'stream',
      consumerGroup: 'group',
      consumerName: 'consumer'
    });
    await queue.reject({ payload: {} as any }, true);
    expect(redis.xclaim).not.toHaveBeenCalled();
    expect(redis.xack).not.toHaveBeenCalled();
  });
});
