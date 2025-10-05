import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDispatcher } from '../../../app/stream/dispatcher';
import { messagingMetrics } from '../../../observability/metrics';

describe('dispatcher', () => {
  const fetchBatch = vi.fn();
  const markSent = vi.fn();
  const markFailed = vi.fn();
  const bury = vi.fn();
  const redisXadd = vi.fn();

  const outbox = { fetchBatch, markSent, markFailed, bury };
  const redis = { xadd: redisXadd };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(messagingMetrics).forEach((metric) => {
      if (metric && typeof metric === 'object') {
        if ('inc' in metric && typeof metric.inc === 'function') {
          vi.spyOn(metric, 'inc').mockImplementation(() => undefined);
        }
        if ('labels' in metric && typeof metric.labels === 'function') {
          vi.spyOn(metric, 'labels').mockReturnValue({ inc: vi.fn() });
        }
      }
    });
  });

  it('marks empty batch with empty metric', async () => {
    fetchBatch.mockResolvedValueOnce([]);
    const dispatcher = createDispatcher({ outbox, redis, stream: 'stream' });

    await dispatcher.tick();

    expect(fetchBatch).toHaveBeenCalledWith(256);
    expect(redisXadd).not.toHaveBeenCalled();
    expect(markSent).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('publishes successful batch and marks sent', async () => {
    fetchBatch.mockResolvedValueOnce([
      { id: 1, message_id: 'm1', conversation_id: 'c1', payload: { foo: 'bar' }, attempts: 0 },
    ]);
    redisXadd.mockResolvedValueOnce('1-0');
    const dispatcher = createDispatcher({ outbox, redis, stream: 'stream' });

    await dispatcher.tick();

    expect(redisXadd).toHaveBeenCalled();
    expect(markSent).toHaveBeenCalledWith(['1']);
    expect(markFailed).not.toHaveBeenCalled();
    expect(bury).not.toHaveBeenCalled();
  });

  it('retries soft failures and buries after exceeding attempts', async () => {
    fetchBatch.mockResolvedValueOnce([
      { id: 1, message_id: 'm1', conversation_id: 'c1', payload: {}, attempts: 3 },
      { id: 2, message_id: 'm2', conversation_id: 'c2', payload: {}, attempts: 11 },
    ]);
    redisXadd.mockRejectedValue(new Error('redis down'));

    const dispatcher = createDispatcher({ outbox, redis, stream: 'stream', maxAttempts: 10 });

    await dispatcher.tick();

    expect(markSent).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith(['1'], 'redis_publish_failed');
    expect(bury).toHaveBeenCalledWith(['2'], 'max_attempts_exceeded');
  });
});

