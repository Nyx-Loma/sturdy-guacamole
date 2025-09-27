import { describe, expect, it } from 'vitest';
import type { MetricsEvent, WebSocketHubOptions } from '../src/types';

const createOptions = (overrides: Partial<WebSocketHubOptions> = {}): WebSocketHubOptions => ({
  authenticate: async () => ({ accountId: 'acc', deviceId: 'dev' }),
  loadResumeState: async () => null,
  persistResumeState: async () => {},
  dropResumeState: async () => {},
  ...overrides
});

describe('transport types', () => {
  it('supports metrics event variants', () => {
    const events: MetricsEvent[] = [
      { type: 'ws_connected', clientId: 'c1' },
      { type: 'ws_closed', reason: 'done' },
      { type: 'ws_ack_sent', ackStatus: 'accepted' },
      { type: 'ws_replay_batch_sent', batchSize: 2 },
      { type: 'ws_ping_latency', pingLatencyMs: 12 }
    ];

    expect(events).toHaveLength(5);
    expect(events[2].ackStatus).toBe('accepted');
    expect(events[3].batchSize).toBe(2);
  });

  it('applies defaults when optional hub options omitted', async () => {
    const options = createOptions();
    const result = await options.authenticate({ clientId: 'client', requestHeaders: {} });
    expect(result.accountId).toBe('acc');
    expect(await options.loadResumeState('token')).toBeNull();
  });

  it('accepts rate limiter factories and logger', () => {
    const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any;
    const options = createOptions({
      logger,
      rateLimiterFactory: () => ({ consume: async () => {} } as any),
      messageRateLimiterFactory: () => ({ consume: async () => {} } as any)
    });

    expect(options.logger).toBe(logger);
    expect(options.rateLimiterFactory).toBeDefined();
    expect(options.messageRateLimiterFactory).toBeDefined();
  });
});
