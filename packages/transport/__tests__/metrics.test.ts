import { describe, expect, it } from 'vitest';
import { Metrics } from '../src/metrics';

describe('Metrics', () => {
  it('records replay and ping events', async () => {
    const metrics = new Metrics();

    metrics.record({
      type: 'ws_replay_start',
      accountId: 'acc',
      deviceId: 'dev'
    });

    metrics.record({
      type: 'ws_replay_batch_sent',
      accountId: 'acc',
      deviceId: 'dev',
      batchSize: 5
    });

    metrics.record({
      type: 'ws_replay_backpressure_hits',
      accountId: 'acc',
      deviceId: 'dev',
      batchSize: 2
    });

    metrics.record({
      type: 'ws_replay_complete',
      accountId: 'acc',
      deviceId: 'dev'
    });

    metrics.record({
      type: 'ws_ping_latency',
      accountId: 'acc',
      deviceId: 'dev',
      pingLatencyMs: 42
    });

    const registry = metrics.getRegistry();
    const metricsOutput = await registry.metrics();

    expect(metricsOutput).toContain('ws_replay_start_total');
    expect(metricsOutput).toContain('ws_replay_batches_total');
    expect(metricsOutput).toContain('ws_replay_backpressure_total');
    expect(metricsOutput).toContain('ws_replay_complete_total');
    expect(metricsOutput).toContain('ws_ping_latency_ms');
  });
});

