import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import type { MetricsEvent } from './types';

const SAFE_ACCOUNT = 'acct';
const SAFE_DEVICE = 'device';
const toSafe = (value: string | undefined, placeholder: string) => (value && value !== '' ? value : placeholder);

export class Metrics {
  private readonly registry: Registry;
  private readonly connects: Counter<string>;
  private readonly closes: Counter<string>;
  private readonly invalidFrames: Counter<string>;
  private readonly invalidSize: Counter<string>;
  private readonly ackStatus: Counter<string>;
  private readonly overloads: Counter<string>;
  private readonly heartbeatTerminations: Counter<string>;
  private readonly framesSent: Counter<string>;
  private readonly bufferedBytes: Gauge<string>;
  private readonly ackLatency: Histogram<string>;
  private readonly replayStart: Counter<string>;
  private readonly replayComplete: Counter<string>;
  private readonly replayBatches: Counter<string>;
  private readonly replayBackpressure: Counter<string>;
  private readonly pingLatency: Histogram<string>;
  private readonly fallbackEmitter?: (event: MetricsEvent) => void;

  constructor(registry?: Registry, fallback?: (event: MetricsEvent) => void) {
    this.registry = registry ?? new Registry();
    this.fallbackEmitter = fallback;

    this.connects = new Counter({
      name: 'ws_connect_total',
      help: 'Total websocket connections',
      registers: [this.registry],
      labelNames: ['accountId', 'deviceId']
    });

    this.closes = new Counter({
      name: 'ws_close_total',
      help: 'Total websocket closures',
      registers: [this.registry],
      labelNames: ['accountId', 'deviceId', 'code', 'reason']
    });

    this.invalidFrames = new Counter({
      name: 'ws_invalid_frame_total',
      help: 'Invalid frames received',
      registers: [this.registry],
      labelNames: ['accountId', 'deviceId']
    });

    this.invalidSize = new Counter({
      name: 'ws_invalid_size_total',
      help: 'Messages rejected due to size',
      registers: [this.registry],
      labelNames: ['accountId', 'deviceId']
    });

    this.ackStatus = new Counter({
      name: 'ws_ack_total',
      help: 'ACK statuses',
      registers: [this.registry],
      labelNames: ['accountId', 'deviceId', 'status']
    });

    this.overloads = new Counter({
      name: 'ws_overload_total',
      help: 'Connections closed due to overload',
      registers: [this.registry],
      labelNames: ['accountId', 'deviceId']
    });

    this.heartbeatTerminations = new Counter({
      name: 'ws_heartbeat_terminate_total',
      help: 'Connections terminated due to heartbeat timeout',
      registers: [this.registry],
      labelNames: ['accountId', 'deviceId']
    });

    this.framesSent = new Counter({
      name: 'ws_frame_sent_total',
      help: 'Total frames sent to clients',
      registers: [this.registry],
      labelNames: ['accountId', 'deviceId']
    });

    this.bufferedBytes = new Gauge({
      name: 'ws_buffered_bytes',
      help: 'Buffered bytes per connection',
      registers: [this.registry],
      labelNames: ['accountId', 'deviceId']
    });

    this.ackLatency = new Histogram({
      name: 'ws_ack_latency_ms',
      help: 'Latency of ACK processing',
      registers: [this.registry],
      labelNames: ['accountId', 'deviceId'],
      buckets: [1, 2, 5, 10, 20, 50, 100, 250, 500]
    });

    this.replayStart = new Counter({
      name: 'ws_replay_start_total',
      help: 'Replay sessions initiated',
      registers: [this.registry],
      labelNames: ['accountId', 'deviceId']
    });

    this.replayComplete = new Counter({
      name: 'ws_replay_complete_total',
      help: 'Replay sessions completed',
      registers: [this.registry],
      labelNames: ['accountId', 'deviceId']
    });

    this.replayBatches = new Counter({
      name: 'ws_replay_batches_total',
      help: 'Replay batches sent',
      registers: [this.registry],
      labelNames: ['accountId', 'deviceId']
    });

    this.replayBackpressure = new Counter({
      name: 'ws_replay_backpressure_total',
      help: 'Replay batches hitting backpressure',
      registers: [this.registry],
      labelNames: ['accountId', 'deviceId']
    });

    this.pingLatency = new Histogram({
      name: 'ws_ping_latency_ms',
      help: 'Measured ping round-trip latency',
      registers: [this.registry],
      labelNames: ['accountId', 'deviceId'],
      buckets: [10, 25, 50, 100, 250, 500, 1000]
    });
  }

  getRegistry() {
    return this.registry;
  }

  record(event: MetricsEvent) {
    this.fallbackEmitter?.(event);
    const accountId = toSafe(event.accountId, SAFE_ACCOUNT);
    const deviceId = toSafe(event.deviceId, SAFE_DEVICE);
    switch (event.type) {
      case 'ws_connected':
        this.connects.labels(accountId, deviceId).inc();
        break;
      case 'ws_closed':
        this.closes
          .labels(accountId, deviceId, String(event.closeCode ?? '0'), event.reason ?? 'unknown')
          .inc();
        break;
      case 'ws_invalid_frame':
        this.invalidFrames.labels(accountId, deviceId).inc();
        break;
      case 'ws_invalid_size':
        this.invalidSize.labels(accountId, deviceId).inc();
        break;
      case 'ws_ack_sent':
      case 'ws_ack_rejected':
        this.ackStatus.labels(accountId, deviceId, event.ackStatus ?? 'unknown').inc();
        if (event.ackLatencyMs !== undefined) {
          this.ackLatency.labels(accountId, deviceId).observe(event.ackLatencyMs);
        }
        break;
      case 'ws_overloaded':
        this.overloads.labels(accountId, deviceId).inc();
        if (event.bufferedAmount !== undefined) {
          this.bufferedBytes.labels(accountId, deviceId).set(event.bufferedAmount);
        }
        break;
      case 'ws_heartbeat_terminate':
        this.heartbeatTerminations.labels(accountId, deviceId).inc();
        break;
      case 'ws_frame_sent':
        this.framesSent.labels(accountId, deviceId).inc();
        break;
      case 'ws_send_error':
        this.closes
          .labels(accountId, deviceId, String(event.closeCode ?? '1011'), event.reason ?? 'send_failure')
          .inc();
        break;
      case 'ws_replay_start':
        this.replayStart.labels(accountId, deviceId).inc();
        break;
      case 'ws_replay_batch_sent':
        this.replayBatches.labels(accountId, deviceId).inc(event.batchSize ?? 0);
        break;
      case 'ws_replay_backpressure_hits':
        this.replayBackpressure.labels(accountId, deviceId).inc(event.batchSize ?? 1);
        break;
      case 'ws_replay_complete':
        this.replayComplete.labels(accountId, deviceId).inc();
        break;
      case 'ws_ping_latency':
        if (event.pingLatencyMs !== undefined) {
          this.pingLatency.labels(accountId, deviceId).observe(event.pingLatencyMs);
        }
        break;
    }
  }
}
