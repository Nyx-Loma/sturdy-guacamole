import { describe, expect, it, vi } from 'vitest';
import { WebSocketHub, createInMemoryResumeStore, createQueueConsumer } from '../src/index';
import type { Queue, QueueMessage } from '../src/queue';
import type { MessageEnvelope } from '../src/schemas';
import type { ResumeResult } from '../src/types';

type MockSend = ReturnType<typeof vi.fn>;

interface MockWebSocket {
  readyState: number;
  OPEN: number;
  bufferedAmount: number;
  send: MockSend;
  close: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  ping: ReturnType<typeof vi.fn>;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  trigger: (event: string, ...args: unknown[]) => void;
}

const createMockSocket = () => {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const sent: string[] = [];
  let bufferedAmount = 0;
  const sendMock: MockSend = vi.fn((data: string | Buffer, cb?: () => void) => {
    const payload = typeof data === 'string' ? data : data.toString();
    bufferedAmount += payload.length;
    sent.push(payload);
    cb?.();
    bufferedAmount = Math.max(0, bufferedAmount - payload.length);
  });

  const socket: MockWebSocket = {
    readyState: 1,
    OPEN: 1,
    get bufferedAmount() {
      return bufferedAmount;
    },
    send: sendMock,
    close: vi.fn(() => {
      socket.readyState = 3;
      socket.trigger('close');
    }),
    terminate: vi.fn(() => {
      socket.readyState = 3;
      socket.trigger('close');
    }),
    ping: vi.fn(),
    on(event, listener) {
      const arr = listeners.get(event) ?? [];
      arr.push(listener);
      listeners.set(event, arr);
    },
    trigger(event, ...args) {
      const arr = listeners.get(event) ?? [];
      for (const listener of arr) {
        listener(...args);
      }
    }
  } as MockWebSocket;

  return { socket, sent, sendMock, listeners };
};

const createInMemoryQueue = () => {
  let handler: ((message: QueueMessage) => Promise<void>) | null = null;
  const consumed: QueueMessage[] = [];

  const queue: Queue = {
    subscribe: async (h) => {
      handler = h;
      while (pending.length > 0) {
        const next = pending.shift()!;
        consumed.push(next);
        await handler(next);
      }
    },
    ack: async () => {},
    reject: async () => {},
    close: async () => {}
  };

  const pending: QueueMessage[] = [];

  const publish = async (payload: MessageEnvelope) => {
    const message: QueueMessage = { payload };
    if (handler) {
      await handler(message);
    } else {
      pending.push(message);
    }
  };

  return { queue, publish, consumed };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const flushAsync = () => sleep(0);
const waitForCondition = async (condition: () => boolean, timeoutMs = 5000, pollMs = 5) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('timeout waiting for condition');
    }
    await sleep(pollMs);
  }
};

describe('queue replay', () => {
  it('replays queued messages after resume', async () => {
    const resumeStore = createInMemoryResumeStore();
    const totalMessages = 100;

    const replayEvents: ResumeResult[] = [];
    const closeEvents: Array<{ clientId: string; closeCode?: number; reason?: string }> = [];

    const hub = new WebSocketHub({
      heartbeatDisabled: true,
      maxReplayBatchSize: 20,
      authenticate: async () => ({ accountId: 'acc', deviceId: 'device' }),
      loadResumeState: resumeStore.load,
      persistResumeState: resumeStore.persist,
      dropResumeState: resumeStore.drop,
      onMetrics: () => {},
      onReplayComplete: (ctx) => {
        replayEvents.push({ replayCount: ctx.replayCount, rotatedToken: ctx.resumeToken, batches: ctx.batches });
      },
      onClose: (event) => {
        closeEvents.push({ clientId: event.clientId, closeCode: event.closeCode, reason: event.reason });
      }
    });

    const { socket: socket1 } = createMockSocket();
    const registerInitial = await hub.register(socket1 as unknown as WebSocket, 'client-1', {});
    expect(registerInitial).not.toBeNull();
    const initialToken = registerInitial!.resumeToken;

    const { queue, publish } = createInMemoryQueue();
    await createQueueConsumer({
      hub,
      queue,
      onError: () => {}
    });

    for (let i = 1; i <= totalMessages; i++) {
      await publish({
        v: 1,
        id: `msg-${i}`,
        type: 'msg',
        payload: { seq: i },
        size: 10
      });
    }

    await flushAsync();
    const persistedBeforeResume = await resumeStore.load(initialToken);
    expect(persistedBeforeResume).toBeDefined();
    expect(persistedBeforeResume?.outboundFrames?.length).toBe(totalMessages);

    socket1.trigger('close');
    expect(hub.size()).toBe(0);
    await flushAsync();

    const { socket: socket2, sendMock } = createMockSocket();
    const registerResult = await hub.register(socket2 as unknown as WebSocket, 'client-1', {});
    expect(registerResult).not.toBeNull();
    expect(hub.size()).toBe(1);

    const resumeEnvelope: MessageEnvelope = {
      v: 1,
      id: '11111111-1111-4111-8111-111111111111',
      type: 'resume',
      payload: {
        resumeToken: initialToken,
        lastClientSeq: 0
      },
      size: 10
    };

    const maybeResumeResult = (await hub.handleMessage('client-1', Buffer.from(JSON.stringify(resumeEnvelope)))) as ResumeResult | void;
    if (!maybeResumeResult) {
      await waitForCondition(
        () =>
          replayEvents.length > 0 ||
          sendMock.mock.calls.some(([entry]) => {
            try {
              const payload = typeof entry === 'string' ? entry : entry.toString();
              return JSON.parse(payload).type === 'resume_ack';
            } catch {
              return false;
            }
          })
      );
    }
    const resumeResult = maybeResumeResult ?? replayEvents[replayEvents.length - 1];
    expect(resumeResult).toBeDefined();

    const parsed = sendMock.mock.calls
      .map(([entry]) => (typeof entry === 'string' ? entry : entry.toString()))
      .map((entry) => {
        try {
          return JSON.parse(entry);
        } catch {
          return null;
        }
      })
      .filter((entry): entry is Record<string, unknown> => entry !== null);
    const resumeAck = parsed[0] as | { resumeToken: string; type: string } | undefined;
    expect(resumeAck).toBeDefined();
    expect(resumeAck?.type).toBe('resume_ack');
    expect(resumeAck?.resumeToken).toBe(resumeResult.rotatedToken);

    const replayed = parsed.slice(1);
    expect(replayed).toHaveLength(totalMessages);
    const ids = replayed.map((msg: { id: string }) => msg.id);
    expect(ids).toEqual(Array.from({ length: totalMessages }, (_, i) => `msg-${i + 1}`));

    expect(resumeResult.replayCount).toBe(totalMessages);
    expect(resumeResult.batches).toBeGreaterThanOrEqual(5);
    expect(resumeResult.rotatedToken).toBeDefined();

    expect(closeEvents).toEqual([{ clientId: 'client-1', closeCode: undefined, reason: undefined }]);
  });
});
