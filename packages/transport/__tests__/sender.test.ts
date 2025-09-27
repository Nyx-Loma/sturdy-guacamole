import { describe, expect, it, vi } from 'vitest';
import type { Connection } from '../src/connection';
import { SendGuard } from '../src/sender';

const READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
} as const;

class MockSocket {
  OPEN = READY_STATE.OPEN;
  readyState = READY_STATE.OPEN;
  bufferedAmount = 0;
  close = vi.fn();
}

const OPEN_STATE = READY_STATE.OPEN;

const createConnection = (bufferedAmount = 0, readyState = OPEN_STATE) => {
  const socket = new MockSocket();
  socket.readyState = readyState;
  socket.bufferedAmount = bufferedAmount;

  return {
    socket,
    close: vi.fn(),
    enqueue: vi.fn().mockResolvedValue(undefined)
  } as unknown as Connection;
};

describe('SendGuard', () => {
  it('allows sends when socket open and buffer below threshold', async () => {
    const guard = new SendGuard({ maxBufferedBytes: 1024 });
    const connection = createConnection(512, OPEN_STATE);
    await guard.send(connection, 'payload');
    expect(connection.enqueue).toHaveBeenCalledWith('payload');
  });

  it('rejects when socket is not open', async () => {
    const guard = new SendGuard({ maxBufferedBytes: 1024 });
    const connection = createConnection(0, READY_STATE.CLOSED);
    await guard.send(connection, 'payload');
    expect(connection.enqueue).not.toHaveBeenCalled();
  });

  it('closes when buffered amount exceeds limit', async () => {
    const guard = new SendGuard({ maxBufferedBytes: 1024 });
    const connection = createConnection(2048, OPEN_STATE);
    await guard.send(connection, 'payload');
    expect(connection.close).toHaveBeenCalledWith(1013, 'overloaded');
    expect(connection.enqueue).not.toHaveBeenCalled();
  });

  it('canSend returns false when socket state not open', () => {
    const guard = new SendGuard({ maxBufferedBytes: 10 });
    const connection = createConnection(0, READY_STATE.CLOSING);
    expect(guard.canSend(connection)).toBe(false);
  });

  it('canSend returns true when socket open and within limit', () => {
    const guard = new SendGuard({ maxBufferedBytes: 10 });
    const connection = createConnection(5, OPEN_STATE);
    expect(guard.canSend(connection)).toBe(true);
  });
});

