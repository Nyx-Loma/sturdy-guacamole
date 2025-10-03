import { randomUUID } from "node:crypto";
import IORedis, { type Redis } from "ioredis";
import type {
  StreamAdapter,
  StorageContext,
  StorageStreamCursor,
  StorageStreamMessage,
  StorageWriteOptions,
  AdapterHealthCheckOptions,
} from "./base";
import type { StorageHealthStatus } from "../types";
import {
  ConsistencyError,
  StorageError,
  TimeoutError,
  TransientAdapterError,
} from "../errors";
import { retry } from "../utils/retry";
import { CircuitBreaker } from "../utils/circuitBreaker";

export interface RedisStreamAdapterOptions {
  redisUrl: string;
  streamPrefix?: string;
  groupPrefix?: string;
  consumerName?: string;
  maxLen?: number;
  blockTimeoutMs?: number;
  readCount?: number;
}

export class RedisStreamAdapter implements StreamAdapter {
  public readonly kind = "stream" as const;

  private readonly options: Required<RedisStreamAdapterOptions>;
  private readonly redis: Redis;
  private readonly subscriber: Redis;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(options: RedisStreamAdapterOptions) {
    this.options = {
      streamPrefix: "storage-stream",
      groupPrefix: "storage-group",
      consumerName: `storage-consumer-${randomUUID()}`,
      maxLen: 10_000,
      blockTimeoutMs: 2_000,
      readCount: 10,
      ...options,
    } as Required<RedisStreamAdapterOptions>;

    this.redis = new IORedis(this.options.redisUrl, {
      lazyConnect: true,
    });
    this.subscriber = new IORedis(this.options.redisUrl, {
      lazyConnect: true,
    });
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      successThreshold: 2,
      resetTimeoutMs: 5_000,
    });
  }

  async init(): Promise<void> {
    await this.redis.connect();
    await this.subscriber.connect();
  }

  async publish(
    message: StorageStreamMessage,
    options: StorageWriteOptions,
    context: StorageContext
  ): Promise<StorageStreamMessage> {
    void options;
    const streamKey = this.streamKey(context.namespace, message.stream);
    const payload = JSON.stringify({ ...message.payload, headers: message.headers });
    const attempts = options.retryCount ?? 3;
    const id = await this.execute(
      "xadd",
      async () =>
        this.redis.xadd(
          streamKey,
          "MAXLEN",
          "~",
          String(this.options.maxLen),
          "*",
          "data",
          payload
        ),
      attempts
    );

    return {
      ...message,
      id,
      publishedAt: message.publishedAt ?? new Date(),
    };
  }

  async *subscribe(
    stream: string,
    options?: { cursor?: StorageStreamCursor; batchSize?: number; signal?: AbortSignal },
    context: StorageContext
  ): AsyncIterable<StorageStreamMessage> {
    const namespace = context.namespace;
    const streamKey = this.streamKey(namespace, stream);
    const consumerGroup = this.groupKey(namespace, stream);
    const consumerName = options?.cursor?.id ?? this.options.consumerName;
    const startingId = options?.cursor?.position ?? ">";
    const batchSize = options?.batchSize ?? this.options.readCount;

    await this.ensureGroup(streamKey, consumerGroup);

    let active = true;
    options?.signal?.addEventListener("abort", () => {
      active = false;
    });

    while (active) {
      const response = await this.execute(
        "xreadgroup",
        async () =>
          this.redis.xreadgroup(
            "GROUP",
            consumerGroup,
            consumerName,
            "COUNT",
            batchSize,
            "BLOCK",
            this.options.blockTimeoutMs,
            "STREAMS",
            streamKey,
            startingId
          ),
        3
      );

      if (!response) {
        continue;
      }

      for (const [, entries] of response) {
        for (const [id, fields] of entries) {
          const payloadRaw = fields[1];
          let payload: unknown = undefined;
          try {
            payload = JSON.parse(payloadRaw);
          } catch (error) {
            throw new StorageError("Failed to parse stream payload", {
              code: "UNKNOWN",
              metadata: { streamKey, id },
              cause: error as Error,
            });
          }

          yield {
            id,
            namespace,
            stream,
            payload,
            headers: typeof payload === "object" && payload && "headers" in payload ? (payload as Record<string, string>).headers : undefined,
            publishedAt: new Date(),
          };
        }
      }
    }
  }

  async commitCursor(cursor: StorageStreamCursor, context: StorageContext): Promise<void> {
    const streamKey = this.streamKey(context.namespace, cursor.stream);
    const group = this.groupKey(context.namespace, cursor.stream);

    await this.execute(
      "xack",
      async () => this.redis.xack(streamKey, group, cursor.position),
      3
    );
  }

  async healthCheck(options?: AdapterHealthCheckOptions): Promise<StorageHealthStatus> {
    void options;
    try {
      await this.redis.ping();
      return { healthy: true };
    } catch (error) {
      return { healthy: false, details: { error } };
    }
  }

  async dispose(): Promise<void> {
    await this.subscriber.quit();
    await this.redis.quit();
  }

  private async ensureGroup(streamKey: string, group: string): Promise<void> {
    try {
      await this.redis.xgroup("CREATE", streamKey, group, "$", "MKSTREAM");
    } catch (error) {
      const code = (error as { message?: string }).message;
      if (code && code.includes("BUSYGROUP")) {
        return;
      }
      throw error;
    }
  }

  private streamKey(namespace: string, stream: string): string {
    return `${this.options.streamPrefix}:${namespace}:${stream}`;
  }

  private groupKey(namespace: string, stream: string): string {
    return `${this.options.groupPrefix}:${namespace}:${stream}`;
  }

  private async execute<T>(operation: string, fn: () => Promise<T>, attempts: number): Promise<T> {
    const run = async (): Promise<T> => {
      if (!this.circuitBreaker.shouldAllow()) {
        throw new TransientAdapterError(`Redis stream circuit open for ${operation}`);
      }

      try {
        const result = await fn();
        this.circuitBreaker.recordSuccess();
        return result;
      } catch (error) {
        this.circuitBreaker.recordFailure();
        throw this.mapRedisError(error, operation);
      }
    };

    return retry(run, {
      attempts,
      baseDelayMs: 100,
      maxDelayMs: 1_000,
      jitter: true,
      shouldRetry: (error) => this.isRetryable(error),
    });
  }

  private mapRedisError(error: unknown, operation: string): Error {
    if (error instanceof StorageError || error instanceof TimeoutError || error instanceof TransientAdapterError) {
      return error;
    }
    const err = error as { message?: string; name?: string; code?: string };
    if (err?.code === "ETIMEDOUT") {
      return new TimeoutError("Redis stream timeout", { metadata: { operation } });
    }
    if (err?.message?.includes("NOGROUP")) {
      return new ConsistencyError("Redis consumer group missing", { metadata: { operation } });
    }
    if (error instanceof Error) {
      return error;
    }
    return new StorageError("Unknown Redis stream error", {
      code: "UNKNOWN",
      metadata: { operation },
    });
  }

  private isRetryable(error: unknown): boolean {
    return error instanceof TimeoutError || error instanceof TransientAdapterError;
  }
}

