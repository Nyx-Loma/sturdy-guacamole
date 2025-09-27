import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createHubState } from '../src/websocketHub/state';

const baseOptions = () => ({
  authenticate: vi.fn(async () => ({ accountId: 'acc', deviceId: 'dev' })),
  loadResumeState: vi.fn(async () => null),
  persistResumeState: vi.fn(async () => {}),
  dropResumeState: vi.fn(async () => {}),
  onMetrics: vi.fn(),
  rateLimiterFactory: undefined,
  messageRateLimiterFactory: undefined
});

describe('hub state utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const makeConnection = (bufferedAmount = 0, overrides: Partial<any> = {}) => {
    const socket = {
      bufferedAmount,
      ping: vi.fn(),
      terminate: vi.fn()
    } as any;
    return {
      id: 'conn',
      accountId: 'acc',
      deviceId: 'dev',
      socket,
      close: vi.fn(),
      enqueue: vi.fn().mockResolvedValue(undefined),
      outboundLog: [] as Array<{ seq: number; payload: string }> & { length: number },
      serverSequence: 0,
      lastSeenAt: 0,
      inFlight: new Set<string>(),
      sendQueue: [] as any[],
      sending: false,
      ...overrides
    } as any;
  };

  it('safeSend closes overloaded connection and notifies onClose', async () => {
    const onClose = vi.fn();
    const state = createHubState({ ...baseOptions(), maxBufferedBytes: 10, onClose });
    const connection = makeConnection(50);

    await state.safeSend(connection, 'payload');

    expect(connection.close).toHaveBeenCalledWith(1013, 'overloaded');
    expect(onClose).toHaveBeenCalledWith({ clientId: 'conn', accountId: 'acc', deviceId: 'dev', closeCode: 1013, reason: 'overloaded' });
  });

  it('safeSendWithBackpressure returns false when buffered amount exceeds limit', async () => {
    const state = createHubState({ ...baseOptions(), maxBufferedBytes: 5 });
    const connection = makeConnection(20);

    const result = await state.safeSendWithBackpressure(connection, 'payload');

    expect(result).toBe(false);
    expect(connection.close).toHaveBeenCalledWith(1013, 'overloaded');
  });

  it('scheduleHeartbeat sends ping and reschedules when connection inactive', () => {
    const state = createHubState({ ...baseOptions(), heartbeatIntervalMs: 50, heartbeatDisabled: false });
    const connection = makeConnection(0);
    state.connections.set(connection.id, connection);

    state.scheduleHeartbeat(connection);
    vi.advanceTimersByTime(50);

    expect(connection.socket.ping).toHaveBeenCalled();
  });

  it('scheduleHeartbeat terminates connection when ping fails', () => {
    const state = createHubState({ ...baseOptions(), heartbeatIntervalMs: 30, heartbeatDisabled: false });
    const connection = makeConnection(0);
    connection.socket.ping.mockImplementation(() => {
      throw new Error('ping failed');
    });
    state.connections.set(connection.id, connection);

    state.scheduleHeartbeat(connection);
    vi.advanceTimersByTime(30);

    expect(connection.socket.terminate).toHaveBeenCalled();
    expect(state.connections.has(connection.id)).toBe(false);
  });

  it('broadcast enqueues payload and limits outbound log', async () => {
    const state = createHubState({ ...baseOptions(), outboundLogLimit: 2 });
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const connection = makeConnection(0, {
      enqueue,
      outboundLog: []
    });
    state.connections.set(connection.id, connection);

    state.broadcast({ type: 'msg', v: 1, id: 'm1', size: 1, payload: { seq: 1 } } as any);
    state.broadcast({ type: 'msg', v: 1, id: 'm2', size: 1, payload: { seq: 2 } } as any);
    state.broadcast({ type: 'msg', v: 1, id: 'm3', size: 1, payload: { seq: 3 } } as any);

    expect(enqueue).toHaveBeenCalledTimes(3);
    expect(connection.outboundLog).toHaveLength(2);
    expect(connection.outboundLog[0].payload).toContain('m2');
    expect(connection.outboundLog[1].payload).toContain('m3');
  });

  it('safeSend enqueues payload when under buffer limit', async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const connection = makeConnection(0, { enqueue });
    const state = createHubState({ ...baseOptions(), maxBufferedBytes: 10 });

    await state.safeSend(connection, 'payload');

    expect(enqueue).toHaveBeenCalledWith('payload');
  });

  it('safeSendWithBackpressure enqueues and returns true below limit', async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const connection = makeConnection(0, { enqueue });
    const state = createHubState({ ...baseOptions(), maxBufferedBytes: 10 });

    const result = await state.safeSendWithBackpressure(connection, 'payload');

    expect(result).toBe(true);
    expect(enqueue).toHaveBeenCalledWith('payload');
  });

  it('persistSnapshot logs and invokes persistence helper', async () => {
    const persistResumeState = vi.fn().mockResolvedValue(undefined);
    const logger = { debug: vi.fn() } as any;
    const state = createHubState({ ...baseOptions(), logger, persistResumeState });
    const connection = makeConnection(0, { outboundLog: [{ seq: 1, payload: '{}' }] });

    await state.persistSnapshot(connection as any);

    expect(persistResumeState).toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'conn', outboundSize: 1 }),
      'persist_snapshot'
    );
  });
});
