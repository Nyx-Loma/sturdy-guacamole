import {
  NotFoundError,
  StorageError,
  TimeoutError,
  ValidationFailedError,
} from "./errors";
import type {
  StorageContext,
  StorageDeleteOptions,
  StorageListQuery,
  StorageListResult,
  StorageObject,
  StorageObjectReference,
  StorageReadOptions,
  StorageWriteOptions,
  StorageStreamMessage,
  StorageStreamCursor,
  StorageQuota,
  StorageHealthStatus,
} from "./types";
import type { StorageConfig, StorageDependencies } from "./config";
import { parseConfig } from "./config/schema";
import type { BlobAdapter, RecordAdapter, StreamAdapter } from "./adapters/base";
import { createNoopMetrics } from "./observability/metrics";
import { createConsoleStorageLogger, isStorageLogger } from "./observability/logs";
import { retry } from "./utils/retry";
import { CircuitBreaker } from "./utils/circuitBreaker";
import type { CacheEnvelope, CacheManagerOptions, CacheProvider } from "./cache/cacheManager";
import { CacheManager } from "./cache/cacheManager";

export interface StorageDependencies {
  logger?: import("./observability/logs").StorageLogger;
  metrics?: import("./observability/metrics").StorageMetrics;
  tracer?: {
    startActiveSpan<T>(name: string, fn: (span: unknown) => Promise<T> | T): Promise<T> | T;
  };
  cache?: {
    provider: CacheProvider<CacheEnvelope<unknown>>;
    options?: CacheManagerOptions;
  };
  circuitBreaker?: CircuitBreaker;
}

export interface StorageClient {
  writeBlob(
    ref: StorageObjectReference,
    payload: Buffer | Uint8Array,
    options: StorageWriteOptions,
    context: StorageContext
  ): Promise<StorageObject<Buffer>>;
  readBlob(
    ref: StorageObjectReference,
    options: StorageReadOptions,
    context: StorageContext
  ): Promise<StorageObject<Buffer>>;
  deleteBlob(ref: StorageObjectReference, options: StorageDeleteOptions, context: StorageContext): Promise<void>;
  listBlobs(query: StorageListQuery, context: StorageContext): Promise<StorageListResult>;

  upsertRecord<T extends Record<string, unknown>>(
    namespace: string,
    record: T,
    options: StorageWriteOptions,
    context: StorageContext
  ): Promise<T>;
  getRecord<T extends Record<string, unknown>>(
    reference: StorageObjectReference,
    options: StorageReadOptions,
    context: StorageContext
  ): Promise<T>;
  deleteRecord(reference: StorageObjectReference, options: StorageDeleteOptions, context: StorageContext): Promise<void>;
  queryRecords<T extends Record<string, unknown>>(
    namespace: string,
    query: Record<string, unknown>,
    options: StorageReadOptions & { pagination?: { cursor?: string; limit?: number } },
    context: StorageContext
  ): Promise<{ items: T[]; nextCursor?: string }>;

  publishStream(message: StorageStreamMessage, options: StorageWriteOptions, context: StorageContext): Promise<void>;
  subscribeStream(
    stream: string,
    options: { cursor?: StorageStreamCursor; batchSize?: number; signal?: AbortSignal },
    context: StorageContext
  ): AsyncIterable<StorageStreamMessage>;
  commitStreamCursor(cursor: StorageStreamCursor, context: StorageContext): Promise<void>;

  getQuota(namespace: string, context: StorageContext): Promise<StorageQuota | undefined>;
  checkHealth(context?: StorageContext): Promise<StorageHealthStatus>;
}

interface InternalState {
  blobAdapters: Map<string, BlobAdapter>;
  recordAdapters: Map<string, RecordAdapter>;
  streamAdapters: Map<string, StreamAdapter>;
}

function now(): number {
  return Date.now();
}

function makeCacheKey(kind: "blob" | "record", namespace: string, id: string): string {
  return `${kind}:${namespace}:${id}`;
}

type SpanLike = {
  setAttribute?(key: string, value: unknown): void;
};

function setSpanAttributes(span: unknown, attributes: Record<string, unknown>): void {
  if (!span) {
    return;
  }
  const candidate = span as SpanLike;
  if (typeof candidate.setAttribute !== "function") {
    return;
  }
  for (const [key, value] of Object.entries(attributes)) {
    candidate.setAttribute?.(key, value ?? null);
  }
}

export function createStorageClient(rawConfig: StorageConfig | unknown, dependencies: StorageDependencies = {}): StorageClient {
  const config = parseConfig(rawConfig as StorageConfig);
  const logger = dependencies.logger && isStorageLogger(dependencies.logger)
    ? dependencies.logger
    : createConsoleStorageLogger();
  const metrics = dependencies.metrics ?? createNoopMetrics();
  const tracer = dependencies.tracer;
  const stalenessBudgetMs = config.consistency?.stalenessBudgetMs ?? 100;
  const cacheManager = dependencies.cache
    ? new CacheManager<unknown>(dependencies.cache.provider, {
        ...dependencies.cache.options,
        metrics,
        stalenessBudgetMs,
        logger,
        circuitBreaker: dependencies.cache.options?.circuitBreaker ?? dependencies.circuitBreaker,
        retry: dependencies.cache.options?.retry ?? dependencies.retry,
      })
    : undefined;
  if (cacheManager) {
    void cacheManager.init();
  }
  const circuitBreaker = dependencies.circuitBreaker ?? new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 5_000 });

  const state: InternalState = {
    blobAdapters: new Map(),
    recordAdapters: new Map(),
    streamAdapters: new Map(),
  };

  const registerAdapter = <TAdapter extends BlobAdapter | RecordAdapter | StreamAdapter>(
    map: Map<string, TAdapter>,
    definition: { namespaces: string | string[]; adapter?: TAdapter; factory?: (ctx: { namespace: string }) => TAdapter }
  ) => {
    const namespaces = Array.isArray(definition.namespaces) ? definition.namespaces : [definition.namespaces];
    for (const namespace of namespaces) {
      if (definition.adapter) {
        map.set(namespace, definition.adapter);
      } else if (definition.factory) {
        const adapter = definition.factory({ namespace });
        map.set(namespace, adapter);
      }
    }
  };

  config.blobAdapters?.forEach((definition) => registerAdapter(state.blobAdapters, definition));
  config.recordAdapters?.forEach((definition) => registerAdapter(state.recordAdapters, definition));
  config.streamAdapters?.forEach((definition) => registerAdapter(state.streamAdapters, definition));

  const resolveBlobAdapter = (namespace: string): BlobAdapter => {
    const adapter = state.blobAdapters.get(namespace);
    if (!adapter) {
      throw new StorageError(`No blob adapter registered for namespace ${namespace}`, {
        code: "UNKNOWN",
        metadata: { namespace },
      });
    }
    return adapter;
  };

  const resolveRecordAdapter = (namespace: string): RecordAdapter => {
    const adapter = state.recordAdapters.get(namespace);
    if (!adapter) {
      throw new StorageError(`No record adapter registered for namespace ${namespace}`, {
        code: "UNKNOWN",
        metadata: { namespace },
      });
    }
    return adapter;
  };

  const resolveStreamAdapter = (namespace: string): StreamAdapter => {
    const adapter = state.streamAdapters.get(namespace);
    if (!adapter) {
      throw new StorageError(`No stream adapter registered for namespace ${namespace}`, {
        code: "UNKNOWN",
        metadata: { namespace },
      });
    }
    return adapter;
  };

  const withTimeout = async <T>(promise: Promise<T>, ms?: number): Promise<T> => {
    if (!ms) return promise;
    let timeoutId: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new TimeoutError("Storage operation timeout", { timeoutMs: ms }));
          }, ms);
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  const recordRequest = async <T>(
    op: string,
    namespace: string,
    adapterKind: string,
    fn: () => Promise<T>,
    options?: {
      consistency?: string;
      payloadBytes?: number;
      retryCount?: number;
      retryReason?: string;
      cacheState?: "hit" | "miss" | "bypass";
      tenantId?: string;
      requestId?: string;
      traceAttributes?: Record<string, unknown>;
      idempotencyKey?: string;
    }
  ): Promise<T> => {
    const start = now();
    metrics.requestsTotal.inc({ op, adapter: adapterKind, namespace, consistency: options?.consistency });
    const baseLog = {
      op,
      namespace,
      adapter: adapterKind,
      cacheState: options?.cacheState,
      requestId: options?.requestId,
      tenantId: options?.tenantId,
      idempotencyKey: options?.idempotencyKey,
      retryCount: options?.retryCount,
      retryReason: options?.retryReason,
    };
    logger.debug({ ...baseLog, durationMs: 0 });

    const recordCacheRatio = () => {
      if (!metrics.cacheHitRatio || !options?.cacheState) return;
      metrics.cacheHitRatio.observe({ namespace, adapter: adapterKind }, options.cacheState === "hit" ? 1 : 0);
    };

    const recordRetries = () => {
      if (options?.retryCount && options.retryCount > 0) {
        metrics.retriesTotal.inc(
          { op, adapter: adapterKind, namespace, code: options.retryReason ?? "RETRY" },
          options.retryCount
        );
      }
    };

    const spanAttributes: Record<string, unknown> = {
      "storage.namespace": namespace,
      "storage.adapter": adapterKind,
      "storage.consistency": options?.consistency,
      "storage.cache_state": options?.cacheState,
      "storage.retry_count": options?.retryCount,
      "storage.retry_reason": options?.retryReason,
      ...options?.traceAttributes,
    };

    const execute = async () => {
      const result = tracer
        ? await tracer.startActiveSpan(op, async (span) => {
            setSpanAttributes(span, spanAttributes);
            return fn();
          })
        : await fn();
      const durationMs = now() - start;
      metrics.latencyMs.observe({ op, adapter: adapterKind, namespace }, durationMs);
      if (options?.payloadBytes !== undefined) {
        metrics.payloadBytes.observe({ op, adapter: adapterKind, namespace }, options.payloadBytes);
      }
      recordRetries();
      recordCacheRatio();
      logger.info({ ...baseLog, durationMs });
      return result;
    };

    if (!circuitBreaker.shouldAllow()) {
      throw new StorageError("Circuit breaker open", {
        code: "TRANSIENT_ADAPTER_ERROR",
        metadata: { op, namespace },
      });
    }

    try {
      const result = await retry(execute, {
        attempts: options?.retryCount ?? 3,
        shouldRetry: (error) => error instanceof TimeoutError,
      });
      circuitBreaker.recordSuccess();
      return result;
    } catch (error) {
      circuitBreaker.recordFailure();
      const durationMs = now() - start;
      metrics.latencyMs.observe({ op, adapter: adapterKind, namespace }, durationMs);
      metrics.errorsTotal.inc({
        op,
        adapter: adapterKind,
        namespace,
        code: error instanceof StorageError ? error.code : "UNKNOWN",
      });
      recordRetries();
      recordCacheRatio();
      logger.error({ ...baseLog, durationMs, code: error instanceof StorageError ? error.code : "UNKNOWN" });
      throw error;
    }
  };

  const client: StorageClient = {
    async writeBlob(ref, payload, options, context) {
      const adapter = resolveBlobAdapter(ref.namespace);
      const op = "put_blob";
      logger.debug({ op, namespace: ref.namespace, adapter: adapter.kind, ref, options, durationMs: 0 });
      const cacheKey = cacheManager ? makeCacheKey("blob", ref.namespace, ref.id) : undefined;
      return recordRequest(
        op,
        ref.namespace,
        adapter.kind,
        async () => {
          const result = await withTimeout(adapter.write(ref, Buffer.from(payload), options, context), options?.timeoutMs);
          if (cacheKey && cacheManager) {
            await cacheManager.delete(cacheKey);
          }
          return result;
        },
        {
          payloadBytes: payload.byteLength,
          consistency: options?.consistency,
          tenantId: context.tenantId,
          requestId: context.requestId,
          idempotencyKey: options?.idempotencyKey,
          traceAttributes: {
            "storage.idempotency_key": options?.idempotencyKey,
          },
        }
      );
    },
    async readBlob(ref, options, context) {
      const adapter = resolveBlobAdapter(ref.namespace);
      const op = "get_blob";
      logger.debug({ op, namespace: ref.namespace, adapter: adapter.kind, ref, options, durationMs: 0 });
      const consistency = options?.consistency ?? "strong";
      const bypassCache = options?.bypassCache ?? false;
      const cacheKey = cacheManager ? makeCacheKey("blob", ref.namespace, ref.id) : undefined;

      if (consistency === "cache_only" && cacheKey) {
        const cached = await cacheManager.get(cacheKey);
        if (!cached.value) {
          throw new NotFoundError("Cache miss", { ref, source: "cache" });
        }
        return recordRequest(
          op,
          ref.namespace,
          adapter.kind,
          async () => cached.value as StorageObject<Buffer>,
          {
            consistency,
            tenantId: context.tenantId,
            requestId: context.requestId,
            cacheState: cached.stale ? "stale" : "hit",
            traceAttributes: {
              "storage.consistency": consistency,
              "storage.cache_state": cached.stale ? "stale" : "hit",
              "storage.staleness_budget_ms": options?.stalenessBudgetMs ?? stalenessBudgetMs,
            },
          }
        );
      }

      if (cacheKey && cacheManager && !bypassCache) {
        const cached = await cacheManager.get(cacheKey);
        if (cached.value) {
          const cacheState = cached.stale && consistency === "strong" ? "stale" : "hit";
          if (consistency === "eventual" || (consistency === "strong" && !cached.stale)) {
            return recordRequest(
              op,
              ref.namespace,
              adapter.kind,
              async () => cached.value as StorageObject<Buffer>,
              {
                consistency,
                tenantId: context.tenantId,
                requestId: context.requestId,
                cacheState,
                traceAttributes: {
                  "storage.consistency": consistency,
                  "storage.cache_state": cacheState,
                  "storage.staleness_budget_ms": options?.stalenessBudgetMs ?? stalenessBudgetMs,
                },
              }
            );
          }
        }
      }

      const cacheState = cacheManager ? (bypassCache ? "bypass" : "miss") : undefined;

      return recordRequest(
        op,
        ref.namespace,
        adapter.kind,
        async () => {
          const result = await withTimeout(adapter.read(ref, options, context), options?.timeoutMs);
          if (cacheKey && cacheManager) {
            await cacheManager.set(cacheKey, result, options?.ttlSeconds);
          }
          return result;
        },
        {
          consistency,
          tenantId: context.tenantId,
          requestId: context.requestId,
          cacheState,
          traceAttributes: {
            "storage.consistency": consistency,
            "storage.cache_state": cacheState,
            "storage.staleness_budget_ms": options?.stalenessBudgetMs ?? stalenessBudgetMs,
          },
        }
      );
    },
    async deleteBlob(ref, options, context) {
      const adapter = resolveBlobAdapter(ref.namespace);
      const op = "delete_blob";
      logger.debug({ op, namespace: ref.namespace, adapter: adapter.kind, ref, options, durationMs: 0 });
      const cacheKey = cacheManager ? makeCacheKey("blob", ref.namespace, ref.id) : undefined;
      await recordRequest(op, ref.namespace, adapter.kind, async () => {
        await adapter.delete(ref, options, context);
        if (cacheKey && cacheManager) {
          await cacheManager.delete(cacheKey);
        }
      }, {
        tenantId: context.tenantId,
        requestId: context.requestId,
        consistency: options?.consistency,
        traceAttributes: {
          "storage.consistency": options?.consistency ?? "strong",
          "storage.idempotency_key": options?.idempotencyKey,
        },
      });
    },
    async listBlobs(query, context) {
      const adapter = resolveBlobAdapter(query.namespace);
      const op = "list_blob";
      logger.debug({ op, namespace: query.namespace, adapter: adapter.kind, query, durationMs: 0 });
      return recordRequest(op, query.namespace, adapter.kind, () => adapter.list(query, context), {
        tenantId: context.tenantId,
        requestId: context.requestId,
      });
    },
    async upsertRecord(namespace, record, options, context) {
      const adapter = resolveRecordAdapter(namespace);
      const op = "upsert_record";
      logger.debug({ op, namespace, adapter: adapter.kind, options, durationMs: 0 });
      return recordRequest(
        op,
        namespace,
        adapter.kind,
        async () => {
          const result = await withTimeout(adapter.upsert(namespace, record, options, context), options?.timeoutMs);
          return result;
        },
        {
          tenantId: context.tenantId,
          requestId: context.requestId,
          idempotencyKey: options?.idempotencyKey,
          traceAttributes: {
            "storage.concurrency_token": options?.concurrencyToken,
            "storage.idempotency_key": options?.idempotencyKey,
          },
        }
      );
    },
    async getRecord(reference, options, context) {
      const adapter = resolveRecordAdapter(reference.namespace);
      const op = "get_record";
      logger.debug({ op, namespace: reference.namespace, adapter: adapter.kind, reference, options, durationMs: 0 });
      const consistency = options?.consistency ?? "strong";
      const bypassCache = options?.bypassCache ?? false;
      const cacheKey = cacheManager ? makeCacheKey("record", reference.namespace, reference.id) : undefined;

      if (consistency === "cache_only" && cacheKey) {
        const cached = await cacheManager.get(cacheKey);
        if (!cached.value) {
          throw new NotFoundError("Cache miss", { reference, source: "cache" });
        }
        return recordRequest(
          op,
          reference.namespace,
          adapter.kind,
          async () => cached.value as Record<string, unknown>,
          {
            consistency,
            tenantId: context.tenantId,
            requestId: context.requestId,
            cacheState: cached.stale ? "stale" : "hit",
            traceAttributes: {
              "storage.consistency": consistency,
              "storage.cache_state": cached.stale ? "stale" : "hit",
              "storage.staleness_budget_ms": options?.stalenessBudgetMs ?? stalenessBudgetMs,
            },
          }
        );
      }

      if (cacheKey && cacheManager && !bypassCache) {
        const cached = await cacheManager.get(cacheKey);
        if (cached.value) {
          const cacheState = cached.stale && consistency === "strong" ? "stale" : "hit";
          if (consistency === "eventual" || (consistency === "strong" && !cached.stale)) {
            return recordRequest(
              op,
              reference.namespace,
              adapter.kind,
              async () => cached.value as Record<string, unknown>,
              {
                consistency,
                tenantId: context.tenantId,
                requestId: context.requestId,
                cacheState,
                traceAttributes: {
                  "storage.consistency": consistency,
                  "storage.cache_state": cacheState,
                  "storage.staleness_budget_ms": options?.stalenessBudgetMs ?? stalenessBudgetMs,
                },
              }
            );
          }
        }
      }

      const cacheState = cacheManager ? (bypassCache ? "bypass" : "miss") : undefined;

      return recordRequest(
        op,
        reference.namespace,
        adapter.kind,
        async () => {
          const result = await withTimeout(adapter.get(reference, options, context), options?.timeoutMs);
          if (cacheKey && cacheManager) {
            await cacheManager.set(cacheKey, result, options?.ttlSeconds);
          }
          return result;
        },
        {
          consistency,
          tenantId: context.tenantId,
          requestId: context.requestId,
          cacheState,
          traceAttributes: {
            "storage.consistency": consistency,
            "storage.cache_state": cacheState,
            "storage.staleness_budget_ms": options?.stalenessBudgetMs ?? stalenessBudgetMs,
          },
        }
      );
    },
    async deleteRecord(reference, options, context) {
      const adapter = resolveRecordAdapter(reference.namespace);
      const op = "delete_record";
      logger.debug({ op, namespace: reference.namespace, adapter: adapter.kind, reference, options, durationMs: 0 });
      await recordRequest(
        op,
        reference.namespace,
        adapter.kind,
        () => withTimeout(adapter.delete(reference, options, context), options?.timeoutMs),
        {
          tenantId: context.tenantId,
          requestId: context.requestId,
          traceAttributes: {
            "storage.concurrency_token": options?.concurrencyToken,
            "storage.idempotency_key": options?.idempotencyKey,
          },
        }
      );
    },
    async queryRecords(namespace, query, options, context) {
      const adapter = resolveRecordAdapter(namespace);
      const op = "query_record";
      logger.debug({ op, namespace, adapter: adapter.kind, query, options, durationMs: 0 });
      return recordRequest(
        op,
        namespace,
        adapter.kind,
        () => withTimeout(adapter.query(namespace, query, options, context), options?.timeoutMs),
        {
          tenantId: context.tenantId,
          requestId: context.requestId,
          traceAttributes: {
            "storage.consistency": options?.consistency ?? "strong",
            "storage.cache_state": options?.bypassCache ? "bypass" : undefined,
            "storage.pagination.cursor": options?.pagination?.cursor,
            "storage.pagination.limit": options?.pagination?.limit,
          },
        }
      );
    },
    async publishStream(message, options, context) {
      const adapter = resolveStreamAdapter(message.namespace);
      const op = "publish_stream";
      logger.debug({ op, namespace: message.namespace, adapter: adapter.kind, message, options, durationMs: 0 });
      await recordRequest(
        op,
        message.namespace,
        adapter.kind,
        () => withTimeout(adapter.publish(message, options, context), options?.timeoutMs),
        {
          tenantId: context.tenantId,
          requestId: context.requestId,
          idempotencyKey: options?.idempotencyKey,
          traceAttributes: {
            "storage.stream": message.stream,
            "storage.delivery_guarantee": message.acknowledgment?.deliveryGuarantee ?? "at_least_once",
            "storage.idempotency_key": options?.idempotencyKey,
          },
        }
      );
    },
    subscribeStream(stream, options, context) {
      if (!options?.cursor) {
        throw new ValidationFailedError("Stream subscription requires cursor", {
          stream,
        });
      }
      const adapter = resolveStreamAdapter(options.cursor.namespace);
      const op = "subscribe_stream";
      logger.debug({ op, namespace: options.cursor.namespace, adapter: adapter.kind, stream, cursor: options.cursor, durationMs: 0 });
      return adapter.subscribe(stream, options, context);
    },
    async commitStreamCursor(cursor, context) {
      const adapter = resolveStreamAdapter(cursor.namespace);
      const op = "commit_cursor";
      logger.debug({ op, namespace: cursor.namespace, adapter: adapter.kind, cursor, durationMs: 0 });
      await recordRequest(op, cursor.namespace, adapter.kind, () => adapter.commitCursor(cursor, context), {
        tenantId: context.tenantId,
        requestId: context.requestId,
        traceAttributes: {
          "storage.stream": cursor.stream,
          "storage.cursor.position": cursor.position,
          "storage.consumer_group": cursor.id,
        },
      });
    },
    async getQuota(namespace) {
      logger.debug({ op: "get_quota", namespace, adapter: "none", durationMs: 0 });
      // Placeholder until quota subsystem is implemented.
      return undefined;
    },
    async checkHealth() {
      logger.debug({ op: "check_health", namespace: "*", adapter: "multi", durationMs: 0 });
      const results: StorageHealthStatus[] = [];
      for (const adapter of state.blobAdapters.values()) {
        if (adapter.healthCheck) {
          results.push(await adapter.healthCheck());
        }
      }
      for (const adapter of state.recordAdapters.values()) {
        if (adapter.healthCheck) {
          results.push(await adapter.healthCheck());
        }
      }
      for (const adapter of state.streamAdapters.values()) {
        if (adapter.healthCheck) {
          results.push(await adapter.healthCheck());
        }
      }
      return {
        healthy: results.every((result) => result.healthy),
        details: { adapters: results },
      };
    },
  };

  return client;
}

