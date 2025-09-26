import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { WebSocketHub } from '../src/index';

const createSocket = () => {
  const socket: Partial<WebSocket> = {
    send: vi.fn((payload: string, callback?: (error?: Error | null) => void) => {
      callback?.();
    }),
    close: vi.fn(),
    ping: vi.fn(),
    terminate: vi.fn(),
    on: vi.fn(),
    readyState: 1
  };

  return socket as WebSocket;
};

describe('WebSocketHub', () => {
  it('acks valid messages and closes on invalid data', async () => {
    const socket = createSocket();
    const consume = vi.fn(async () => {});
    const limiter = { consume } as unknown as RateLimiterMemory;
    const hub = new WebSocketHub({
      heartbeatIntervalMs: 10_000,
      authenticate: async () => ({ accountId: 'acc', deviceId: 'device' }),
      loadResumeState: async () => null,
      persistResumeState: async () => {},
      dropResumeState: async () => {},
      rateLimiterFactory: () => limiter,
      messageRateLimiterFactory: () => limiter
    });

    vi.spyOn(socket, 'on').mockImplementation(() => socket);

    const result = await hub.register(socket, 'client-1', {});
    expect(result?.resumeToken).toBeDefined();

    await hub.handleMessage(
      'client-1',
      Buffer.from(
        JSON.stringify({ v: 1, id: '9d7b1b5c-5e15-4b92-a2e2-7f0d6ffd1fd1', type: 'msg', payload: { seq: 0 }, size: 42 })
      )
    );
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'ack', id: '9d7b1b5c-5e15-4b92-a2e2-7f0d6ffd1fd1', status: 'accepted', seq: 1 }),
      expect.any(Function)
    );

    await hub.handleMessage('client-1', Buffer.from('invalid-json'));
    expect(socket.close).toHaveBeenCalledWith(1002, 'protocol_error');
  });

  it('rejects oversized frames', async () => {
    const socket = createSocket();
    const hub = new WebSocketHub({
      heartbeatIntervalMs: 10_000,
      authenticate: async () => ({ accountId: 'acc', deviceId: 'device' }),
      loadResumeState: async () => null,
      persistResumeState: async () => {},
      dropResumeState: async () => {}
    });

    vi.spyOn(socket, 'on').mockImplementation(() => socket);
    await hub.register(socket, 'client-oversize', {});

    const largePayload = Buffer.alloc(65 * 1024, 'a');
    await hub.handleMessage('client-oversize', largePayload);
    expect(socket.close).toHaveBeenCalledWith(1009, 'message_too_large');
  });

  it('terminates connection on backpressure', async () => {
    const socket = createSocket();
    Object.defineProperty(socket, 'bufferedAmount', { value: 6 * 1024 * 1024 });

    const hub = new WebSocketHub({
      heartbeatIntervalMs: 10_000,
      maxBufferedBytes: 5 * 1024 * 1024,
      authenticate: async () => ({ accountId: 'acc', deviceId: 'device' }),
      loadResumeState: async () => null,
      persistResumeState: async () => {},
      dropResumeState: async () => {}
    });

    vi.spyOn(socket, 'on').mockImplementation(() => socket);
    await hub.register(socket, 'client-backpressure', {});

    await hub.handleMessage(
      'client-backpressure',
      Buffer.from(
        JSON.stringify({ v: 1, id: '4d39cc9d-9f19-4f36-9ff8-6fd3b7e09ab8', type: 'msg', payload: { seq: 0 }, size: 42 })
      )
    );
    expect(socket.close).toHaveBeenCalledWith(1013, 'overloaded');
  });

  it('rejects invalid resume token', async () => {
    const socket = createSocket();
    const hub = new WebSocketHub({
      heartbeatIntervalMs: 10_000,
      authenticate: async () => ({ accountId: 'acc', deviceId: 'device' }),
      loadResumeState: async () => null,
      persistResumeState: async () => {},
      dropResumeState: async () => {}
    });

    vi.spyOn(socket, 'on').mockImplementation(() => socket);
    await hub.register(socket, 'client-resume', {});

    const invalidResume = Buffer.from(
      JSON.stringify({ v: 1, id: 'd05cead6-9d91-4a58-988a-d65179c9c6b7', type: 'resume', payload: { resumeToken: 'bad', lastClientSeq: -1 }, size: 42 })
    );
    await hub.handleMessage('client-resume', invalidResume);
    expect(socket.close).toHaveBeenCalledWith(1002, 'protocol_error');
  });
});

