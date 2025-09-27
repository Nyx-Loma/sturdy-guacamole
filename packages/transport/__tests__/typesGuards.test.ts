import { describe, expect, it } from 'vitest';
import type { AckMessage, MetricsEvent } from '../src/types';

describe('transport types (runtime sanity)', () => {
  it('supports ack message variants', () => {
    const accepted: AckMessage = { type: 'ack', id: '1', status: 'accepted', seq: 10 };
    const rejected: AckMessage = { type: 'ack', id: '2', status: 'rejected', reason: 'duplicate' };
    expect(accepted.status).toBe('accepted');
    expect(rejected.reason).toBe('duplicate');
  });

  it('allows metrics events without optional fields', () => {
    const event: MetricsEvent = { type: 'ws_connected', clientId: 'c1' };
    expect(event.type).toBe('ws_connected');
  });

  it('captures latency event details', () => {
    const event: MetricsEvent = {
      type: 'ws_ping_latency',
      clientId: 'c2',
      accountId: 'a1',
      deviceId: 'd1',
      pingLatencyMs: 42
    };
    expect(event.pingLatencyMs).toBe(42);
  });
});
