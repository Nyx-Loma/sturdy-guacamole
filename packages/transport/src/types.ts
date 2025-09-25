import type { RateLimiterMemory } from 'rate-limiter-flexible';
import type { WebSocket } from 'ws';

export type ClientId = string;

export interface AckMessage {
  type: 'ack';
  id: string;
  status: 'accepted' | 'rejected';
  seq?: number;
  reason?: string;
}

export interface MetricsEvent {
  type:
    | 'ws_connected'
    | 'ws_closed'
    | 'ws_invalid_frame'
    | 'ws_invalid_size'
    | 'ws_ack_sent'
    | 'ws_ack_rejected'
    | 'ws_heartbeat_terminate'
    | 'ws_overloaded'
    | 'ws_frame_sent'
    | 'ws_replay_start'
    | 'ws_replay_batch_sent'
    | 'ws_replay_backpressure_hits'
    | 'ws_replay_complete'
    | 'ws_resume_token_rotated';
  clientId?: string;
  accountId?: string;
  deviceId?: string;
  closeCode?: number;
  reason?: string;
  bufferedAmount?: number;
  ackStatus?: AckMessage['status'];
  ackLatencyMs?: number;
  replayCount?: number;
  batchSize?: number;
  batches?: number;
  resumeTokenRedacted?: string;
}

export interface AuthenticateParams {
  requestHeaders: Record<string, string | string[] | undefined>;
  clientId: string;
}

export interface AuthenticationResult {
  accountId: string;
  deviceId: string;
}

export interface ResumeState {
  accountId: string;
  deviceId: string;
  lastServerSeq: number;
  expiresAt: number;
  outboundFrames?: Array<{ seq: number; payload: string }>;
}

export interface PersistResumeStateParams {
  resumeToken: string;
  accountId: string;
  deviceId: string;
  lastServerSeq: number;
  expiresAt: number;
  outboundFrames: Array<{ seq: number; payload: string }>;
}

export interface RegisterResult {
  resumeToken: string;
}

export type ConnectionSnapshot = PersistResumeStateParams;

export type SendFunction = (socket: WebSocket, payload: string | Buffer) => void;

export interface WebSocketHubOptions {
  heartbeatIntervalMs?: number;
  heartbeatDisabled?: boolean;
  maxBufferedBytes?: number;
  resumeTokenTtlMs?: number;
  maxQueueLength?: number;
  outboundLogLimit?: number;
  maxReplayBatchSize?: number;
  send?: SendFunction;
  onMetrics?: (event: MetricsEvent) => void;
  onReplayComplete?: (ctx: { accountId: string; deviceId: string; resumeToken: string; replayCount: number; batches: number }) => void;
  onClose?: (ctx: { clientId: string; accountId?: string; deviceId?: string; closeCode?: number; reason?: string }) => void;
  authenticate: (params: AuthenticateParams) => Promise<AuthenticationResult>;
  loadResumeState: (token: string) => Promise<ResumeState | null>;
  persistResumeState: (state: PersistResumeStateParams) => Promise<void>;
  dropResumeState: (token: string) => Promise<void>;
  rateLimiterFactory?: () => RateLimiterMemory;
  messageRateLimiterFactory?: () => RateLimiterMemory;
  metricsRegistry?: import('prom-client').Registry;
}

export interface ResumeResult {
  replayCount: number;
  rotatedToken?: string;
  batches: number;
}

export interface ResumeStore {
  load: (token: string) => Promise<ResumeState | null>;
  persist: (state: PersistResumeStateParams) => Promise<void>;
  drop: (token: string) => Promise<void>;
}
