import { describe, expect, it, vi } from 'vitest';
import type { RateLimiterMemory } from 'rate-limiter-flexible';
import { createRateLimiters } from '../src/rateLimiter';
import { createQueueConsumer } from '../src/queue';

describe('createRateLimiters', () => {
  const makeLimiter = () => ({ consume: vi.fn() }) as unknown as RateLimiterMemory;

  it('creates both limiters when factories succeed', () => {
    const { connectionLimiter, messageLimiter } = createRateLimiters({
      connectionFactory: makeLimiter,
      messageFactory: makeLimiter
    });
    expect(connectionLimiter).toBeDefined();
    expect(messageLimiter).toBeDefined();
  });

  it('handles connection factory throwing', () => {
    const { connectionLimiter, messageLimiter } = createRateLimiters({
      connectionFactory: () => {
        throw new Error('fail');
      },
      messageFactory: makeLimiter
    });
    expect(connectionLimiter).toBeUndefined();
    expect(messageLimiter).toBeDefined();
  });

  it('handles message factory returning null', () => {
    const { connectionLimiter, messageLimiter } = createRateLimiters({
      connectionFactory: makeLimiter,
      messageFactory: () => null
    });
    expect(connectionLimiter).toBeDefined();
    expect(messageLimiter).toBeUndefined();
  });
});

describe('queue consumer', () => {
  it('acks and rejects messages based on handler outcome', async () => {
    const hub = { broadcast: vi.fn() } as any;
    const ack = vi.fn().mockResolvedValue(undefined);
    const reject = vi.fn().mockResolvedValue(undefined);
    const subscribe = vi.fn().mockImplementation(async (handler: (message: any) => Promise<void>) => {
      await handler({ id: '1', payload: { type: 'msg' } });
      await handler({ id: '2', payload: { type: 'msg' } });
    });
    const onError = vi.fn();
    const queue = { subscribe, ack, reject } as any;

    hub.broadcast.mockImplementationOnce(() => {
      throw new Error('fail');
    });

    await createQueueConsumer({ hub, queue, onError });

    expect(hub.broadcast).toHaveBeenCalledTimes(2);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(reject).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }), true);
    expect(onError).toHaveBeenCalled();
  });
});
