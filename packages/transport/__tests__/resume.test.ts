import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { handleResume } from '../src/websocketHub/resume';
import type { HubState } from '../src/websocketHub/state';
import type { MessageEnvelope } from '../src/schemas';

const RESUME_TOKEN = '22222222-2222-4222-8222-222222222222';
const ALT_RESUME_TOKEN = '33333333-3333-4333-8333-333333333333';

const baseEnvelope = (overrides: Partial<MessageEnvelope['payload']> = {}): MessageEnvelope => ({
  v: 1,
  id: '11111111-1111-4111-8111-111111111111',
  type: 'resume',
  size: 10,
  payload: {
    resumeToken: RESUME_TOKEN,
    lastClientSeq: 0,
    ...overrides
  }
});

const makeConnection = () => ({
  id: 'client-1',
  accountId: 'acc',
  deviceId: 'dev',
  resumeToken: RESUME_TOKEN,
  resumeTokenExpiresAt: Date.now() + 10_000,
  sequence: 0,
  serverSequence: 0,
  outboundLog: [
    { seq: 1, payload: JSON.stringify({ id: 'msg-1', type: 'msg', payload: {} }) },
    { seq: 2, payload: JSON.stringify({ id: 'msg-2', type: 'msg', payload: {} }) }
  ],
  close: vi.fn(),
  inFlight: new Set<string>(),
  emitMetrics: vi.fn()
});

const makeState = (overrides: Partial<HubState> = {}) => {
  const metrics = { record: vi.fn() };
  const state: Partial<HubState> = {
    options: { logger: undefined, onReplayComplete: undefined },
    loadResumeState: vi.fn(),
    dropResumeState: vi.fn(),
    nextResumeToken: vi.fn().mockReturnValue({ token: ALT_RESUME_TOKEN, expiresAt: Date.now() + 20_000 }),
    safeSend: vi.fn().mockResolvedValue(undefined),
    safeSendWithBackpressure: vi.fn().mockResolvedValue(true),
    persistSnapshot: vi.fn().mockResolvedValue(undefined),
    maxReplayBatchSize: 100,
    metrics,
    outboundLogLimit: 100,
    resumeTokenTtlMs: 10_000,
    maxBufferedBytes: 1_000_000,
    heartbeatIntervalMs: 60_000,
    connections: new Map(),
    broadcast: vi.fn(),
    size: () => 1,
    scheduleHeartbeat: vi.fn(),
    connectionLimiter: undefined,
    messageLimiter: undefined,
    onClose: undefined,
    ...overrides
  };

  return state as HubState;
};

describe('handleResume', () => {
  let nowSpy: vi.SpyInstance<number, []>;

  beforeEach(() => {
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('rejects when envelope validation fails', async () => {
    const connection = makeConnection();
    const state = makeState();
    const badEnvelope = { ...(baseEnvelope() as MessageEnvelope), payload: null } as unknown as MessageEnvelope;

    const result = await handleResume(connection, badEnvelope, state);
    expect(connection.close).toHaveBeenCalledWith(1002, 'invalid_resume');
    expect(result).toEqual({ replayCount: 0, batches: 0 });
  });

  it('rejects when resume token missing', async () => {
    const connection = makeConnection();
    const state = makeState({ loadResumeState: vi.fn().mockResolvedValue(null) } as Partial<HubState>);
    const envelope = baseEnvelope({ resumeToken: '44444444-4444-4444-8444-444444444444' });

    const result = await handleResume(connection, envelope, state);
    expect(connection.close).toHaveBeenCalledWith(1008, 'invalid_token');
    expect(result.replayCount).toBe(0);
  });

  it('rejects and drops expired persisted token', async () => {
    const connection = makeConnection();
    const persisted = { accountId: 'acc', deviceId: 'dev', lastServerSeq: 5, expiresAt: 999_000, outboundFrames: [] };
    const dropResumeState = vi.fn().mockResolvedValue(undefined);
    const state = makeState({ loadResumeState: vi.fn().mockResolvedValue(persisted), dropResumeState } as Partial<HubState>);
    const envelope = baseEnvelope({ resumeToken: '55555555-5555-4555-8555-555555555555' });

    const result = await handleResume(connection, envelope, state);
    expect(dropResumeState).toHaveBeenCalledWith('55555555-5555-4555-8555-555555555555');
    expect(connection.close).toHaveBeenCalledWith(1008, 'expired_token');
    expect(result.replayCount).toBe(0);
  });

  it('rejects when token belongs to different account/device', async () => {
    const connection = makeConnection();
    const persisted = { accountId: 'other', deviceId: 'dev', lastServerSeq: 5, expiresAt: 1_100_000, outboundFrames: [] };
    const state = makeState({ loadResumeState: vi.fn().mockResolvedValue(persisted) } as Partial<HubState>);
    const envelope = baseEnvelope({ resumeToken: '66666666-6666-4666-8666-666666666666' });

    const result = await handleResume(connection, envelope, state);
    expect(connection.close).toHaveBeenCalledWith(1008, 'token_conflict');
    expect(result.replayCount).toBe(0);
  });

  it('replays frames and rotates token on success', async () => {
    const connection = makeConnection();
    const state = makeState();
    const envelope = baseEnvelope();

    const result = await handleResume(connection, envelope, state);
    expect(state.safeSend).toHaveBeenCalledWith(connection, expect.any(String));
    expect(state.safeSendWithBackpressure).toHaveBeenCalledTimes(connection.outboundLog.length);
    expect(state.persistSnapshot).toHaveBeenCalledWith(connection);
    expect(result.replayCount).toBe(connection.outboundLog.length);
    expect(result.rotatedToken).toBe(ALT_RESUME_TOKEN);
  });

  it('halts replay when backpressure prevents send', async () => {
    const connection = makeConnection();
    const safeSendWithBackpressure = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const state = makeState({ safeSendWithBackpressure } as Partial<HubState>);

    const result = await handleResume(connection, baseEnvelope(), state);
    expect(result.replayCount).toBe(1);
    expect(safeSendWithBackpressure).toHaveBeenCalledTimes(2);
  });
});
