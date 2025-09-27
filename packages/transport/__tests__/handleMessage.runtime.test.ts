import { describe, expect, it, vi } from 'vitest';
import { handleMessage } from '../src/websocketHub/handleMessage';

type MockConnection = {
  id: string;
  accountId: string;
  deviceId: string;
  inFlight: Set<string>;
  sequence: number;
  lastSeenAt: number;
  close: ReturnType<typeof vi.fn>;
};

const makeState = (
  overrides: Partial<ReturnType<typeof createHubState> & { metrics: { record: ReturnType<typeof vi.fn> } }> = {}
) => {
  const connection = {
    id: 'conn-1',
    accountId: 'account',
    deviceId: 'device',
    inFlight: new Set<string>(),
    sequence: 0,
    lastSeenAt: Date.now(),
    close: vi.fn()
  } satisfies MockConnection;
  const state = {
    connections: new Map<string, MockConnection>([['client', connection]]),
    options: { logger: undefined },
    metrics: { record: vi.fn() },
    messageLimiter: undefined as { consume: (token: string) => Promise<void> } | undefined,
    safeSend: vi.fn().mockResolvedValue(undefined),
    scheduleHeartbeat: vi.fn(),
    ...overrides
  };
  return { state, connection };
};

describe('handleMessage runtime guard rails', () => {
  it('closes connection when message limiter rejects', async () => {
    const limiter = { consume: vi.fn().mockRejectedValue(new Error('limit')) };
    const { state, connection } = makeState({ messageLimiter: limiter });
    await handleMessage('client', Buffer.from('{}'), state as any);
    expect(connection.close).toHaveBeenCalledWith(1008, 'message_rate_limited');
  });

  it('records invalid frame and closes with protocol error', async () => {
    const { state, connection } = makeState();
    await handleMessage('client', Buffer.from('invalid json'), state as any);
    expect(connection.close).toHaveBeenCalledWith(1002, 'protocol_error');
  });

  it('closes connection when payload exceeds max size', async () => {
    const { state, connection } = makeState();
    const oversized = Buffer.alloc(70 * 1024, 'a');
    await handleMessage('client', oversized, state as any);
    expect(connection.close).toHaveBeenCalledWith(1009, 'message_too_large');
  });

  it('rejects unknown frame types via schema guard', async () => {
    const { state, connection } = makeState();
    const payload = JSON.stringify({ v: 1, id: '00000000-0000-0000-0000-000000000123', type: 'unknown', payload: {}, size: 4 });
    await handleMessage('client', Buffer.from(payload), state as any);
    expect(connection.close).toHaveBeenCalledWith(1002, 'protocol_error');
  });
});
