import type { MessageEnvelope } from './schemas.js';
import type { WebSocketHub } from './websocketHub';
import Redis from 'ioredis';

export interface QueueMessage {
  id?: string;
  payload: MessageEnvelope;
  raw?: Record<string, string>;
}

export interface Queue {
  subscribe: (handler: (message: QueueMessage) => Promise<void>) => Promise<void>;
  ack: (message: QueueMessage) => Promise<void>;
  reject: (message: QueueMessage, retryable?: boolean) => Promise<void>;
  close?: () => Promise<void>;
}

export interface QueueConsumerOptions {
  hub: WebSocketHub;
  queue: Queue;
  onError?: (err: unknown) => void;
}

export const createQueueConsumer = ({ hub, queue, onError }: QueueConsumerOptions) => {
  const handler = async (message: QueueMessage) => {
    try {
      hub.broadcast(message.payload);
      await queue.ack(message);
    } catch (err) {
      onError?.(err);
      await queue.reject(message, true);
    }
  };

  return queue.subscribe(handler);
};

export interface RedisQueueOptions {
  redis: Redis;
  streamKey: string;
  consumerGroup: string;
  consumerName: string;
  blockMs?: number;
  readCount?: number;
}

export const createRedisStreamQueue = ({
  redis,
  streamKey,
  consumerGroup,
  consumerName,
  blockMs = 5000,
  readCount = 10
}: RedisQueueOptions): Queue => {
  let closed = false;

  const ensureGroup = async () => {
    try {
      await redis.xgroup('CREATE', streamKey, consumerGroup, '$', 'MKSTREAM');
    } catch (error) {
      if ((error as { message?: string }).message?.includes('BUSYGROUP')) {
        return;
      }
      throw error;
    }
  };

  const subscribe = async (handler: (message: QueueMessage) => Promise<void>) => {
    await ensureGroup();
    while (!closed) {
      try {
        const streams = await redis.xreadgroup(
          'GROUP',
          consumerGroup,
          consumerName,
          'COUNT',
          readCount,
          'BLOCK',
          blockMs,
          'STREAMS',
          streamKey,
          '>'
        ) as Array<[string, Array<[string, Record<string, string>]>]> | null;

        if (!streams) {
          continue;
        }

        for (const [, messages] of streams) {
          for (const [id, fields] of messages) {
            const rawPayload = fields.payload;
            if (!rawPayload) {
              await redis.xack(streamKey, consumerGroup, id);
              continue;
            }

            try {
              const payload = JSON.parse(rawPayload) as MessageEnvelope;
              await handler({ id, payload, raw: fields });
            } catch {
              await redis.xack(streamKey, consumerGroup, id);
            }
          }
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  };

  const ack = async (message: QueueMessage) => {
    if (!message.id) return;
    await redis.xack(streamKey, consumerGroup, message.id);
    await redis.xdel(streamKey, message.id);
  };

  const reject = async (message: QueueMessage, retryable = true) => {
    if (!message.id) return;
    if (!retryable) {
      await redis.xack(streamKey, consumerGroup, message.id);
      await redis.xdel(streamKey, message.id);
    } else {
      await redis.xclaim(streamKey, consumerGroup, consumerName, 0, message.id, 'JUSTID');
      await redis.xpending(streamKey, consumerGroup, '-', '+', 1, consumerName);
    }
  };

  const close = async () => {
    closed = true;
  };

  return { subscribe, ack, reject, close };
};
