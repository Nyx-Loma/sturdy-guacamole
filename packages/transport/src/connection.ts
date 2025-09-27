import type { WebSocket } from 'ws';
import type { AckMessage, MetricsEvent } from './types';
import type { SafeLogger } from './logging';
import { logWithContext, sanitizeError } from './logging';

export interface ConnectionOptions {
  clientId: string;
  socket: WebSocket;
  accountId: string;
  deviceId: string;
  resumeToken: string;
  resumeTokenExpiresAt: number;
  maxQueueLength: number;
  send: (socket: WebSocket, payload: string | Buffer, callback?: (error?: Error | null) => void) => void | Promise<void>;
  emitMetrics?: (event: MetricsEvent) => void;
  onError?: (error: unknown) => void;
  logger?: SafeLogger;
}

export class Connection {
  readonly id: string;
  readonly socket: WebSocket;
  readonly accountId: string;
  readonly deviceId: string;

  resumeToken: string;
  resumeTokenExpiresAt: number;

  lastSeenAt: number;
  pingTimeout?: NodeJS.Timeout;
  lastPingSentAt?: number;

  private readonly maxQueueLength: number;
  private readonly sendImpl: (socket: WebSocket, payload: string | Buffer, callback?: (error?: Error | null) => void) => void | Promise<void>;
  private readonly emitMetrics?: (event: MetricsEvent) => void;
  private readonly onError?: (error: unknown) => void;
  private readonly logger?: SafeLogger;

  private readonly sendQueue: Array<string | Buffer> = [];
  private sending = false;
  private hadFatalSendError = false;

  sequence = 0;
  serverSequence = 0;
  readonly inFlight = new Set<string>();
  outboundLog: Array<{ seq: number; payload: string }> = [];

  constructor(options: ConnectionOptions) {
    this.id = options.clientId;
    this.socket = options.socket;
    this.accountId = options.accountId;
    this.deviceId = options.deviceId;
    this.resumeToken = options.resumeToken;
    this.resumeTokenExpiresAt = options.resumeTokenExpiresAt;
    this.maxQueueLength = options.maxQueueLength;
    this.sendImpl = options.send;
    this.emitMetrics = options.emitMetrics;
    this.onError = options.onError;
    this.logger = options.logger;
    this.lastSeenAt = Date.now();
  }

  async enqueue(payload: string | Buffer) {
    if (this.sendQueue.length >= this.maxQueueLength) {
      this.close(1013, 'overloaded');
      return;
    }
    // if a fatal send error already occurred, drop follow-up enqueues
    if (this.hadFatalSendError) {
      return;
    }
    this.sendQueue.push(payload);
    if (!this.sending) {
      await this.flush();
    }
  }

  async flush() {
    if (this.sending || this.hadFatalSendError) return;
    this.sending = true;
    while (this.sendQueue.length > 0) {
      const payload = this.sendQueue.shift();
      if (!payload) break;
      try {
        const maybePromise = this.sendImpl(this.socket, payload, (error) => {
          if (error) {
            this.handleSendFailure(error);
          }
        });
        if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
          await maybePromise;
        }
        this.emitMetrics?.({
          type: 'ws_frame_sent',
          clientId: this.id,
          accountId: this.accountId,
          deviceId: this.deviceId
        });
      } catch (error) {
        this.handleSendFailure(error);
        break;
      }
      if (this.hadFatalSendError) {
        break;
      }
    }
    this.sending = false;
  }

  close(code: number, reason: string) {
    this.socket.close(code, reason);
    this.emitMetrics?.({
      type: 'ws_closed',
      clientId: this.id,
      accountId: this.accountId,
      deviceId: this.deviceId,
      closeCode: code,
      reason
    });
  }

  ack(id: string, ack: AckMessage) {
    void this.enqueue(JSON.stringify(ack));
  }

  private handleSendFailure(error: unknown) {
    if (this.hadFatalSendError) {
      return;
    }
    this.hadFatalSendError = true;
    this.sendQueue.length = 0;
    const failure = error instanceof Error ? error : new Error(error ? String(error) : 'send_failure');
    const sanitized = sanitizeError(failure);
    this.emitMetrics?.({
      type: 'ws_send_error',
      clientId: this.id,
      accountId: this.accountId,
      deviceId: this.deviceId,
      errorName: sanitized.name,
      errorMessage: sanitized.message
    });
    logWithContext(this.logger, 'error', 'connection_send_failure', {
      clientId: this.id,
      accountId: this.accountId,
      deviceId: this.deviceId,
      error: sanitized
    });
    this.onError?.(failure);
    this.close(1011, 'send_failure');
  }
}
