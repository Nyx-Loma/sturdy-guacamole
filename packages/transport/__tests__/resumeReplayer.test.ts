import type { WebSocket } from 'ws';
import { describe, expect, it, vi } from 'vitest';
import { handleResume } from '../src/websocketHub/resume';
import { createHubState } from '../src/websocketHub/state';
import type { WebSocketHubOptions, PersistResumeStateParams } from '../src/types';
import { Connection } from '../src/connection';

const createState = (frames: PersistResumeStateParams['outboundFrames'] = []) => {
  const options: WebSocketHubOptions = {
    authenticate: vi.fn(async () => ({ accountId: 'acc', deviceId: 'device' })),
    loadResumeState: vi.fn(async () => ({
      accountId: 'acc',
      deviceId: 'device',
      lastServerSeq: frames.length,
      expiresAt: Date.now() + 1_000,
      outboundFrames: frames
    })),
    persistResumeState: vi.fn(async () => undefined),
    dropResumeState: vi.fn(async () => undefined)
  } as unknown as WebSocketHubOptions;

  return createHubState(options);
};

describe('handleResume', () => {
  it('replays outbound frames and rotates token', async () => {
    const frames = Array.from({ length: 3 }, (_, i) => ({ seq: i + 1, payload: `frame-${i + 1}` }));
    const state = createState(frames);
    const send = vi.fn((payload: string, callback?: (error?: Error | null) => void) => {
      callback?.();
    });
    const socket = {
      send,
      close: vi.fn(),
      ping: vi.fn(),
      terminate: vi.fn(),
      bufferedAmount: 0
    } as unknown as WebSocket;

    const connection = new Connection({
      clientId: 'client-1',
      socket,
      accountId: 'acc',
      deviceId: 'device',
      resumeToken: '11111111-1111-4111-8111-111111111111',
      resumeTokenExpiresAt: Date.now() - 1,
      maxQueueLength: 10,
      send: (ws, payload, callback) => {
        ws.send(payload, callback);
      },
      emitMetrics: vi.fn()
    });
    connection.outboundLog = frames;

    const envelope = {
      v: 1,
      id: '22222222-2222-4222-8222-222222222222',
      type: 'resume',
      payload: { resumeToken: '11111111-1111-4111-8111-111111111111', lastClientSeq: 0 },
      size: 10
    } as const;

    const result = await handleResume(connection, envelope, state);

    expect(result.replayCount).toBe(3);
    expect(result.rotatedToken).toBeDefined();
    expect(send).toHaveBeenNthCalledWith(1, expect.stringContaining('"resume_ack"'), expect.any(Function));
    expect(send).toHaveBeenNthCalledWith(2, 'frame-1', expect.any(Function));
    expect(send).toHaveBeenNthCalledWith(3, 'frame-2', expect.any(Function));
    expect(send).toHaveBeenNthCalledWith(4, 'frame-3', expect.any(Function));
  });
});
