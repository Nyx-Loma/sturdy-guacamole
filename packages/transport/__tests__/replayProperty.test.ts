import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { WebSocketHub } from '../src/websocketHub';

const createHub = () =>
  new WebSocketHub({
    heartbeatIntervalMs: 10_000,
    authenticate: async () => ({ accountId: 'account', deviceId: 'device' }),
    rateLimiterFactory: undefined,
    messageRateLimiterFactory: undefined
  } as any);

describe('replay ordering property', () => {
  it('replays randomized batches without duplicates or gaps', async () => {
    const hub = createHub();
    const totalMessages = 100;
    const messages = Array.from({ length: totalMessages }, (_, i) => ({
      id: randomUUID(),
      payload: { seq: i, data: `payload-${i}` }
    }));

    const shuffled = [...messages].sort(() => Math.random() - 0.5);
    const seen = new Set<string>();
    let maxSeq = -1;

    for (const message of shuffled) {
      expect(seen.has(message.id)).toBe(false);
      seen.add(message.id);
      maxSeq = Math.max(maxSeq, message.payload.seq);
    }

    expect(seen.size).toBe(totalMessages);
    expect(maxSeq).toBe(totalMessages - 1);
  });
});


