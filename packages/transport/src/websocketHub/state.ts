import type { MessageEnvelope } from '../schemas.js';
import { createRateLimiters } from '../rateLimiter.js';
import { Metrics } from '../metrics.js';
import { Connection } from '../connection.js';
import { persistConnectionSnapshot } from './snapshot.js';
import type { WebSocketHubOptions } from '../types.js';
import { randomUUID } from 'node:crypto';
import { logWithContext } from '../logging.js';

const DEFAULT_MAX_BUFFERED_BYTES = 5 * 1024 * 1024;
const DEFAULT_RESUME_TTL_MS = 15 * 60_000;
const DEFAULT_OUTBOUND_LOG_LIMIT = 500;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 60_000;
const DEFAULT_MAX_REPLAY_BATCH_SIZE = 100;

export interface HubState {
  readonly options: WebSocketHubOptions;
  readonly connections: Map<string, Connection>;
  readonly metrics: Metrics;
  readonly heartbeatIntervalMs: number;
  readonly heartbeatDisabled: boolean;
  readonly maxBufferedBytes: number;
  readonly resumeTokenTtlMs: number;
  readonly outboundLogLimit: number;
  readonly maxReplayBatchSize: number;
  readonly connectionLimiter?: ReturnType<typeof createRateLimiters>['connectionLimiter'];
  readonly messageLimiter?: ReturnType<typeof createRateLimiters>['messageLimiter'];
  readonly authenticate: WebSocketHubOptions['authenticate'];
  loadResumeState: WebSocketHubOptions['loadResumeState'];
  persistResumeState: WebSocketHubOptions['persistResumeState'];
  dropResumeState: WebSocketHubOptions['dropResumeState'];
  readonly onClose?: WebSocketHubOptions['onClose'];
  readonly broadcast: (message: MessageEnvelope) => void;
  readonly size: () => number;
  readonly persistSnapshot: (connection: Connection) => Promise<void>;
  readonly scheduleHeartbeat: (connection: Connection) => void;
  readonly safeSend: (connection: Connection, payload: string | Buffer) => Promise<void>;
  readonly safeSendWithBackpressure: (connection: Connection, payload: string) => Promise<boolean>;
  readonly nextResumeToken: () => { token: string; expiresAt: number };
}

export function createHubState(options: WebSocketHubOptions): HubState {
  const connections = new Map<string, Connection>();
  const metrics = new Metrics(options.metricsRegistry, options.onMetrics);
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const heartbeatDisabled = options.heartbeatDisabled ?? false;
  const maxBufferedBytes = options.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES;
  const resumeTokenTtlMs = options.resumeTokenTtlMs ?? DEFAULT_RESUME_TTL_MS;
  const outboundLogLimit = options.outboundLogLimit ?? DEFAULT_OUTBOUND_LOG_LIMIT;
  const maxReplayBatchSize = options.maxReplayBatchSize ?? DEFAULT_MAX_REPLAY_BATCH_SIZE;

  const { connectionLimiter, messageLimiter } = createRateLimiters({
    connectionFactory: options.rateLimiterFactory,
    messageFactory: options.messageRateLimiterFactory
  });

  const broadcast = (message: MessageEnvelope) => {
    const raw = JSON.stringify(message);
    for (const connection of connections.values()) {
      void broadcastTo(connection, raw);
    }
  };

  const size = () => connections.size;

  const persistSnapshot = async (connection: Connection) => {
    logWithContext(options.logger, 'debug', 'persist_snapshot', {
      clientId: connection.id,
      outboundSize: connection.outboundLog.length
    });
    await persistConnectionSnapshot(connection, {
      persistResumeState: options.persistResumeState
    });
  };

  const safeSend = async (connection: Connection, payload: string | Buffer) => {
    if (connection.socket.bufferedAmount > maxBufferedBytes) {
      metrics.record({
        type: 'ws_overloaded',
        clientId: connection.id,
        accountId: connection.accountId,
        deviceId: connection.deviceId,
        bufferedAmount: connection.socket.bufferedAmount
      });
      options.onClose?.({ clientId: connection.id, accountId: connection.accountId, deviceId: connection.deviceId, closeCode: 1013, reason: 'overloaded' });
      connection.close(1013, 'overloaded');
      return;
    }

    await connection.enqueue(payload);
  };

  const safeSendWithBackpressure = async (connection: Connection, payload: string) => {
    logWithContext(options.logger, 'debug', 'safe_send_backpressure', {
      clientId: connection.id,
      payloadPreview: payload.slice(0, 80),
      bufferedAmount: connection.socket.bufferedAmount
    });
    if (connection.socket.bufferedAmount > maxBufferedBytes) {
      metrics.record({
        type: 'ws_overloaded',
        clientId: connection.id,
        accountId: connection.accountId,
        deviceId: connection.deviceId,
        bufferedAmount: connection.socket.bufferedAmount
      });
      options.onClose?.({ clientId: connection.id, accountId: connection.accountId, deviceId: connection.deviceId, closeCode: 1013, reason: 'overloaded' });
      connection.close(1013, 'overloaded');
      return false;
    }

    await connection.enqueue(payload);
    return true;
  };

  const scheduleHeartbeat = (connection: Connection) => {
    if (heartbeatDisabled) {
      return;
    }

    if (connection.pingTimeout) {
      clearTimeout(connection.pingTimeout);
    }

    connection.pingTimeout = setTimeout(() => {
      const now = Date.now();
      if (now - connection.lastSeenAt >= heartbeatIntervalMs) {
        try {
          connection.lastPingSentAt = Date.now();
          connection.socket.ping();
        } catch {
          connection.socket.terminate();
          connections.delete(connection.id);
          metrics.record({ type: 'ws_heartbeat_terminate', clientId: connection.id, accountId: connection.accountId, deviceId: connection.deviceId });
          options.onClose?.({ clientId: connection.id, accountId: connection.accountId, deviceId: connection.deviceId, closeCode: 1006, reason: 'heartbeat_terminate' });
          return;
        }

        connection.pingTimeout = setTimeout(() => {
          connection.socket.terminate();
          connections.delete(connection.id);
          metrics.record({ type: 'ws_heartbeat_terminate', clientId: connection.id, accountId: connection.accountId, deviceId: connection.deviceId });
          options.onClose?.({ clientId: connection.id, accountId: connection.accountId, deviceId: connection.deviceId, closeCode: 1006, reason: 'heartbeat_terminate' });
        }, heartbeatIntervalMs / 2);
      } else {
        scheduleHeartbeat(connection);
      }
    }, heartbeatIntervalMs);
  };

  const nextResumeToken = () => {
    const token = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : randomUUID();
    return { token, expiresAt: Date.now() + resumeTokenTtlMs };
  };

  const broadcastTo = async (connection: Connection, raw: string) => {
    logWithContext(options.logger, 'debug', 'broadcast_frame', {
      clientId: connection.id,
      payloadPreview: raw.slice(0, 80)
    });
    connection.serverSequence += 1;
    connection.outboundLog.push({ seq: connection.serverSequence, payload: raw });
    if (connection.outboundLog.length > outboundLogLimit) {
      connection.outboundLog.shift();
    }

    await safeSend(connection, raw);
    await persistSnapshot(connection);
  };

  return {
    options,
    connections,
    metrics,
    heartbeatIntervalMs,
    heartbeatDisabled,
    maxBufferedBytes,
    resumeTokenTtlMs,
    outboundLogLimit,
    maxReplayBatchSize,
    connectionLimiter,
    messageLimiter,
    authenticate: options.authenticate,
    loadResumeState: options.loadResumeState,
    persistResumeState: options.persistResumeState,
    dropResumeState: options.dropResumeState,
    onClose: options.onClose,
    broadcast,
    size,
    persistSnapshot,
    scheduleHeartbeat,
    safeSend,
    safeSendWithBackpressure,
    nextResumeToken
  };
}

export function configureResumeStore(state: HubState, store: {
  loadResumeState: WebSocketHubOptions['loadResumeState'];
  persistResumeState: WebSocketHubOptions['persistResumeState'];
  dropResumeState: WebSocketHubOptions['dropResumeState'];
}) {
  state.loadResumeState = store.loadResumeState;
  state.persistResumeState = store.persistResumeState;
  state.dropResumeState = store.dropResumeState;
}
