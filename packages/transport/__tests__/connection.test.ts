import { describe, expect, it, vi } from 'vitest';
import { Connection } from '../src/connection';

const createSocket = () => ({
  send: vi.fn((_: unknown, __: unknown, cb?: (err?: Error | null) => void) => {
    cb?.();
  }),
  close: vi.fn(),
  bufferedAmount: 0
});

describe('Connection', () => {
  it('closes with overload when queue exceeds max length', async () => {
    const socket = createSocket();
    socket.bufferedAmount = 10;
    const connection = new Connection({
      clientId: 'client',
      socket: socket as any,
      accountId: 'acc',
      deviceId: 'dev',
      resumeToken: 'token',
      resumeTokenExpiresAt: Date.now() + 1000,
      maxQueueLength: 0,
      send: vi.fn(),
      emitMetrics: vi.fn()
    });

    await connection.enqueue('first');
    socket.bufferedAmount = 20;
    await connection.enqueue('second');

    expect(socket.close).toHaveBeenCalledWith(1013, 'overloaded');
  });

  it('closes when send implementation throws', async () => {
    const socket = {
      send: vi.fn(() => {
        throw new Error('boom');
      }),
      close: vi.fn(),
      bufferedAmount: 0
    };
    const onError = vi.fn();
    const connection = new Connection({
      clientId: 'client',
      socket: socket as any,
      accountId: 'acc',
      deviceId: 'dev',
      resumeToken: 'token',
      resumeTokenExpiresAt: Date.now() + 1000,
      maxQueueLength: 10,
      send: socket.send,
      emitMetrics: vi.fn(),
      onError
    });

    await connection.enqueue('payload');

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(socket.close).toHaveBeenCalledWith(1011, 'send_failure');
  });

  it('invokes onError and closes when callback reports failure after queue', async () => {
    const error = new Error('cb-failure');
    const socket = {
      send: vi.fn((_: unknown, __: unknown, cb?: (err?: Error | null) => void) => {
        cb?.(error);
      }),
      close: vi.fn(),
      bufferedAmount: 0
    };
    const onError = vi.fn();
    const emitMetrics = vi.fn();
    const connection = new Connection({
      clientId: 'client',
      socket: socket as any,
      accountId: 'acc',
      deviceId: 'dev',
      resumeToken: 'token',
      resumeTokenExpiresAt: Date.now() + 1000,
      maxQueueLength: 10,
      send: socket.send,
      emitMetrics,
      onError
    });

    await connection.enqueue('payload');

    expect(onError).toHaveBeenCalledWith(error);
    expect(socket.close).toHaveBeenCalledWith(1011, 'send_failure');
    expect(connection['sendQueue']).toHaveLength(0);
    expect(emitMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ws_send_error', errorName: 'Error', errorMessage: 'cb-failure' })
    );
  });

  it('stops flushing additional payloads after a failure', async () => {
    const error = new Error('second payload fails');
    const sendSpy = vi
      .fn()
      .mockImplementationOnce((_socket: unknown, _payload: unknown, cb?: (err?: Error | null) => void) => {
        cb?.();
      })
      .mockImplementationOnce((_socket: unknown, _payload: unknown, cb?: (err?: Error | null) => void) => {
        cb?.(error);
      })
      .mockImplementationOnce((_socket: unknown, _payload: unknown, cb?: (err?: Error | null) => void) => {
        cb?.();
      });

    const socket = {
      send: sendSpy,
      close: vi.fn(),
      bufferedAmount: 0
    };

    const onError = vi.fn();
    const emitMetrics = vi.fn();
    const connection = new Connection({
      clientId: 'client',
      socket: socket as any,
      accountId: 'acc',
      deviceId: 'dev',
      resumeToken: 'token',
      resumeTokenExpiresAt: Date.now() + 1000,
      maxQueueLength: 10,
      send: socket.send,
      emitMetrics,
      onError
    });

    await connection.enqueue('first');
    await connection.enqueue('second');
    await connection.enqueue('third');

    expect(sendSpy).toHaveBeenCalledTimes(2); // third payload never attempted
    expect(onError).toHaveBeenCalledWith(error);
    expect(socket.close).toHaveBeenCalledWith(1011, 'send_failure');
    expect(emitMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ws_send_error', errorName: 'Error', errorMessage: 'second payload fails' })
    );
  });
});
