import type { WebSocket } from 'ws';
import type { AckMessage, MetricsEvent } from './types';

export interface ConnectionOptions {
  clientId: string;
  socket: WebSocket;
  accountId: string;
  deviceId: string;
  resumeToken: string;
  resumeTokenExpiresAt: number;
  maxQueueLength: number;
  send: (socket: WebSocket, payload: string | Buffer) => void;
  emitMetrics?: (event: MetricsEvent) => void;
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

  private readonly maxQueueLength: number;
  private readonly sendImpl: (socket: WebSocket, payload: string | Buffer) => void;
  private readonly emitMetrics?: (event: MetricsEvent) => void;

  private readonly sendQueue: Array<string | Buffer> = [];
  private sending = false;

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
    this.lastSeenAt = Date.now();
  }

  enqueue(payload: string | Buffer) {
    console.log('connection.enqueue', this.id, typeof payload, typeof payload === 'string' ? payload.slice(0, 80) : '[buffer]');
    if (this.sendQueue.length >= this.maxQueueLength) {
      this.close(1013, 'overloaded');
      return;
    }
    this.sendQueue.push(payload);
    if (!this.sending) {
      this.flush();
    }
  }

  flush() {
    if (this.sending) return;
    this.sending = true;
    while (this.sendQueue.length > 0) {
      const payload = this.sendQueue.shift();
      if (!payload) break;
      try {
        console.log('connection.flush sending', this.id, typeof payload === 'string' ? payload.slice(0, 80) : '[buffer]');
        this.sendImpl(this.socket, payload);
        this.emitMetrics?.({
          type: 'ws_frame_sent',
          clientId: this.id,
          accountId: this.accountId,
          deviceId: this.deviceId
        });
      } catch {
        this.close(1011, 'send_failure');
        break;
      }
    }
    this.sending = false;
  }

  close(code: number, reason: string) {
    console.log('connection.close', this.id, code, reason);
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
    this.enqueue(JSON.stringify(ack));
  }
}
