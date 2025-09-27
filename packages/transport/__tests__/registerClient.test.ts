import { describe, expect, it, vi, beforeEach } from 'vitest';
import { registerClient } from '../src/websocketHub/registerClient';
import type { HubState } from '../src/websocketHub/state';

const makeSocket = () => {
  const socket = {
    close: vi.fn(),
    send: vi.fn(),
    ping: vi.fn(),
    terminate: vi.fn(),
    on: vi.fn(),
    bufferedAmount: 0
  } as any;
  return socket;
};

const makeState = (overrides: Partial<HubState> = {}) => {
  const metrics = overrides.metrics ?? { record: vi.fn() };
  const connections = overrides.connections ?? new Map<string, any>();
  const scheduleHeartbeat = (overrides as any).scheduleHeartbeat ?? vi.fn();
  const safeSend = (overrides as any).safeSend ?? vi.fn().mockResolvedValue(undefined);
  const state = {
    options: overrides.options ?? {},
    metrics,
    connections,
    scheduleHeartbeat,
    persistSnapshot: overrides.persistSnapshot ?? vi.fn().mockResolvedValue(undefined),
    nextResumeToken: (overrides as any).nextResumeToken ?? vi.fn().mockReturnValue({ token: 'resume', expiresAt: Date.now() + 1000 }),
    safeSend,
    authenticate: overrides.authenticate ?? vi.fn().mockResolvedValue({ accountId: 'acc', deviceId: 'dev' }),
    connectionLimiter: overrides.connectionLimiter,
    ...overrides
  } as HubState;
  return { state, scheduleHeartbeat, metrics, safeSend };
};

describe('registerClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closes socket when authentication fails', async () => {
    const socket = makeSocket();
    const { state, metrics } = makeState({ authenticate: vi.fn().mockResolvedValue(null) });
    const result = await registerClient(socket as any, 'client', {}, state);
    expect(result).toBeNull();
    expect(socket.close).toHaveBeenCalledWith(1008, 'unauthorized');
    expect(metrics.record).toHaveBeenCalledWith(expect.objectContaining({ reason: 'unauthorized', type: 'ws_closed' }));
  });

  it('applies connection limiter and closes when limited', async () => {
    const socket = makeSocket();
    const limiter = { consume: vi.fn().mockRejectedValue(new Error('limited')) };
    const { state } = makeState({ connectionLimiter: limiter as any });
    const result = await registerClient(socket as any, 'client', {}, state);
    expect(result).toBeNull();
    expect(socket.close).toHaveBeenCalledWith(1013, 'connection_rate_limited');
  });

  it('registers connection and schedules heartbeat on success', async () => {
    const socket = makeSocket();
    const { state, scheduleHeartbeat } = makeState();
    const result = await registerClient(socket as any, 'client', {}, state);
    expect(result).toEqual({ resumeToken: 'resume' });
    expect(state.connections.size).toBe(1);
    expect(scheduleHeartbeat).toHaveBeenCalled();
  });

  it('returns resume token and persists snapshot', async () => {
    const socket = makeSocket();
    const persistSnapshot = vi.fn().mockResolvedValue(undefined);
    const { state } = makeState({ persistSnapshot });
    await registerClient(socket as any, 'client', {}, state);
    expect(persistSnapshot).toHaveBeenCalled();
  });

  it('emits metrics and logs when connection registered', async () => {
    const socket = makeSocket();
    const metrics = { record: vi.fn() };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
    const state = makeState({ metrics, options: { logger } as any }).state;

    const result = await registerClient(socket as any, 'client', {}, state);

    expect(result).toEqual({ resumeToken: 'resume' });
    expect(metrics.record).toHaveBeenCalledWith(expect.objectContaining({ type: 'ws_connected' }));
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ resumeToken: expect.any(String) }), 'connection_registered');
  });

  it('binds socket event handlers for close and pong', async () => {
    const socket = makeSocket();
    const callbacks: Record<string, (...args: any[]) => void> = {};
    socket.on.mockImplementation((event: string, handler: any) => {
      callbacks[event] = handler;
    });
    const onClose = vi.fn();
    const metrics = { record: vi.fn() };
    const { state } = makeState({ onClose, metrics });

    await registerClient(socket as any, 'client', {}, state);

    expect(callbacks.close).toBeTypeOf('function');
    expect(callbacks.pong).toBeTypeOf('function');

    const connection = state.connections.get('client');
    expect(connection).toBeDefined();
    if (connection) {
      connection.lastPingSentAt = Date.now() - 5;
    }

    callbacks.close();
    expect(state.connections.size).toBe(0);
    expect(metrics.record).toHaveBeenCalledWith(expect.objectContaining({ type: 'ws_closed' }));
    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'client' }));

    callbacks.pong();
    expect(metrics.record).toHaveBeenCalledWith(expect.objectContaining({ type: 'ws_ping_latency' }));
  });

  it('allows connection when limiter present but resolves', async () => {
    const socket = makeSocket();
    const limiter = { consume: vi.fn().mockResolvedValue(undefined) };
    const { state } = makeState({ connectionLimiter: limiter as any });
    const result = await registerClient(socket as any, 'client', {}, state);
    expect(result).toEqual({ resumeToken: 'resume' });
    expect(limiter.consume).toHaveBeenCalled();
  });
});
