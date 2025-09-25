import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { WebSocketHub } from '../src/index';

const createSocket = () => {
  const socket: Partial<WebSocket> = {
    send: vi.fn(),
    close: vi.fn(),
    ping: vi.fn(),
    terminate: vi.fn(),
    on: vi.fn()
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
        JSON.stringify({ v: 1, id: '9d7b1b5c-5e15-4b92-a2e2-7f0d6ffd1fd1', type: 'msg', payload: {}, size: 42 })
      )
    );
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'ack', id: '9d7b1b5c-5e15-4b92-a2e2-7f0d6ffd1fd1', status: 'accepted', seq: 1 })
    );

    await hub.handleMessage('client-1', Buffer.from('invalid-json'));
    expect(socket.close).toHaveBeenCalledWith(1002, 'protocol_error');
  });
});

