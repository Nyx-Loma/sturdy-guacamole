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

  it('normalizes identifiers and records error and ack metrics', async () => {
    const metrics = new Metrics();

    metrics.record({
      type: 'ws_ack_sent',
      accountId: '',
      deviceId: '',
      ackStatus: 'ok',
      ackLatencyMs: 12
    });

    metrics.record({
      type: 'ws_send_error',
      reason: 'failure'
    });

    metrics.record({
      type: 'ws_replay_batch_sent'
    });

    metrics.record({
      type: 'ws_replay_backpressure_hits'
    });

    const output = await metrics.getRegistry().metrics();

    expect(output).toContain('ws_ack_total{accountId="acct",deviceId="device",status="ok"} 1');
    expect(output).toContain('ws_ack_latency_ms_sum');
    expect(output).toContain('ws_close_total{accountId="acct",deviceId="device",code="1011",reason="failure"} 1');
    expect(output).toContain('ws_replay_batches_total{accountId="acct",deviceId="device"} 0');
    expect(output).toContain('ws_replay_backpressure_total{accountId="acct",deviceId="device"} 1');
  });
});

