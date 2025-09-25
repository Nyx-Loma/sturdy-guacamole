import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import type { MetricsEvent } from './types';

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
  }

  getRegistry() {
    return this.registry;
  }

  record(event: MetricsEvent) {
    this.fallbackEmitter?.(event);
    switch (event.type) {
      case 'ws_connected':
        this.connects.labels(event.accountId ?? 'unknown', event.deviceId ?? 'unknown').inc();
        break;
      case 'ws_closed':
        this.closes.labels(event.accountId ?? 'unknown', event.deviceId ?? 'unknown', String(event.closeCode ?? '0'), event.reason ?? 'unknown').inc();
        break;
      case 'ws_invalid_frame':
        this.invalidFrames.labels(event.accountId ?? 'unknown', event.deviceId ?? 'unknown').inc();
        break;
      case 'ws_invalid_size':
        this.invalidSize.labels(event.accountId ?? 'unknown', event.deviceId ?? 'unknown').inc();
        break;
      case 'ws_ack_sent':
      case 'ws_ack_rejected':
        this.ackStatus.labels(event.accountId ?? 'unknown', event.deviceId ?? 'unknown', event.ackStatus ?? 'unknown').inc();
        if (event.ackLatencyMs !== undefined) {
          this.ackLatency.labels(event.accountId ?? 'unknown', event.deviceId ?? 'unknown').observe(event.ackLatencyMs);
        }
        break;
      case 'ws_overloaded':
        this.overloads.labels(event.accountId ?? 'unknown', event.deviceId ?? 'unknown').inc();
        if (event.bufferedAmount !== undefined) {
          this.bufferedBytes.labels(event.accountId ?? 'unknown', event.deviceId ?? 'unknown').set(event.bufferedAmount);
        }
        break;
      case 'ws_heartbeat_terminate':
        this.heartbeatTerminations.labels(event.accountId ?? 'unknown', event.deviceId ?? 'unknown').inc();
        break;
      case 'ws_frame_sent':
        this.framesSent.labels(event.accountId ?? 'unknown', event.deviceId ?? 'unknown').inc();
        break;
    }
  }
}
