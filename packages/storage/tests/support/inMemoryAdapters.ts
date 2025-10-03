import { createHash, randomUUID } from "node:crypto";
import type { StorageClient } from "../../src/client";
import { createStorageClient } from "../../src/client";
import type { CacheEnvelope, CacheProvider } from "../../src/cache/cacheManager";
import type { BlobAdapter, RecordAdapter, StreamAdapter } from "../../src/adapters/base";
import type {
  StorageContext,
  StorageMetadata,
  StorageObject,
  StorageObjectReference,
  StorageReadOptions,
  StorageWriteOptions,
  StorageStreamCursor,
  StorageStreamMessage,
} from "../../src/types";
import {
  NotFoundError,
  PreconditionFailedError,
} from "../../src/errors";
import { createTestMetrics } from "../../src/observability/metrics";
import { EventEmitter } from "node:events";
import type { StorageLogger } from "../../src/observability/logs";

export const DEFAULT_NAMESPACE = "default";

type BlobEntry = {
  object: StorageObject<Buffer>;
  versions: StorageObject<Buffer>[];
  deleted: boolean;
  stale?: StorageObject<Buffer>;
};

type RecordEntry<T> = {
  value: T;
  versionId: string;
};

type StreamEntry = {
  message: StorageStreamMessage;
  sequence: number;
};

function createMetadata(payload: Buffer, versionId: string, overrides?: Partial<StorageMetadata>): StorageMetadata {
  const checksum = createHash("sha256").update(payload).digest("hex");
  const base: StorageMetadata = {
    checksum,
    checksumAlgorithm: "sha256",
    contentType: overrides?.contentType ?? "application/octet-stream",
    size: payload.byteLength,
    createdAt: overrides?.createdAt ?? new Date(),
    updatedAt: overrides?.updatedAt ?? new Date(),
    versionId,
    custom: overrides?.custom,
  };
  return base;
}

let globalVersionCounter = 0;

function nextVersion(): string {
  globalVersionCounter += 1;
  return `v-${Date.now()}-${globalVersionCounter}`;
}

export class InMemoryBlobAdapter implements BlobAdapter {
  public readonly kind = "blob" as const;
  private readonly store = new Map<string, BlobEntry>();

  async init(): Promise<void> {}

  async write(
    ref: StorageObjectReference,
    payload: Buffer | Uint8Array,
    options: StorageWriteOptions
  ): Promise<StorageObject<Buffer>> {
    const key = this.key(ref);
    const bufferPayload = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    const versionId = nextVersion();
    const metadata = createMetadata(bufferPayload, versionId, {
      contentType: options.contentType,
      custom: options.metadata,
    });

    const object: StorageObject<Buffer> = {
      id: ref.id,
      namespace: ref.namespace,
      metadata,
      payload: bufferPayload,
    };

    const existing = this.store.get(key);
    if (existing) {
      existing.object = object;
      existing.versions.push(object);
      existing.deleted = false;
      existing.stale = existing.versions.length > 1 ? existing.versions[existing.versions.length - 2] : undefined;
    } else {
      this.store.set(key, { object, versions: [object], deleted: false });
    }

    return object;
  }

  async read(
    ref: StorageObjectReference,
    options: StorageReadOptions
  ): Promise<StorageObject<Buffer>> {
    const entry = this.store.get(this.key(ref));
    if (!entry || entry.deleted) {
      throw new NotFoundError("Blob not found", { ref });
    }

    const strongRead = options.consistency === "strong" || options.bypassCache;

    if (!strongRead && entry.stale) {
      return entry.stale;
    }

    return entry.object;
  }

  async delete(ref: StorageObjectReference): Promise<void> {
    const entry = this.store.get(this.key(ref));
    if (!entry) {
      throw new NotFoundError("Blob not found", { ref });
    }
    entry.deleted = true;
  }

  async list(query: StorageListQuery): Promise<StorageListResult> {
    const objects: StorageObjectReference[] = [];
    for (const [key, entry] of this.store.entries()) {
      if (entry.deleted && !query.includeDeleted) continue;
      const [namespace, id] = key.split(":");
      if (namespace !== query.namespace) continue;
      if (query.prefix && !id.startsWith(query.prefix)) continue;
      objects.push({ id, namespace, versionId: entry.object.metadata.versionId });
    }
    return { objects };
  }

  async healthCheck(): Promise<StorageHealthStatus> {
    return { healthy: true };
  }

  poisonCache(ref: StorageObjectReference): void {
    const entry = this.store.get(this.key(ref));
    if (!entry || entry.versions.length < 1) return;
    entry.stale = entry.versions[0];
  }

  private key(ref: StorageObjectReference): string {
    return `${ref.namespace}:${ref.id}`;
  }
}

export class InMemoryRecordAdapter<TValue extends Record<string, unknown> = Record<string, unknown>>
  implements RecordAdapter
{
  public readonly kind = "record" as const;
  private readonly store = new Map<string, RecordEntry<TValue>>();

  async init(): Promise<void> {}

  async upsert<T extends Record<string, unknown>>(
    namespace: string,
    record: T,
    options?: StorageWriteOptions
  ): Promise<T> {
    const id = (record as { id?: string }).id ?? "default";
    const key = this.key(namespace, id);
    const nextVersionId = nextVersion();
    const existing = this.store.get(key);

    if (options?.concurrencyToken && existing && existing.versionId !== options.concurrencyToken) {
      throw new PreconditionFailedError("Concurrency token mismatch", { namespace, key });
    }

    this.store.set(key, { value: record as TValue, versionId: nextVersionId });
    return record;
  }

  async get<T extends Record<string, unknown>>(
    reference: StorageObjectReference
  ): Promise<T> {
    const entry = this.store.get(this.key(reference.namespace, reference.id));
    if (!entry) {
      throw new NotFoundError("Record not found", { reference });
    }
    return entry.value as T;
  }

  async delete(reference: StorageObjectReference): Promise<void> {
    this.store.delete(this.key(reference.namespace, reference.id));
  }

  async query<T extends Record<string, unknown>>(
    namespace: string,
    options?: StorageReadOptions & { pagination?: { cursor?: string; limit?: number } }
  ): Promise<import("../../src/types").StorageQueryResponse<T>> {
    const limit = options?.pagination?.limit ?? 50;
    const cursor = options?.pagination?.cursor
      ? JSON.parse(Buffer.from(options.pagination.cursor, "base64").toString("utf8"))
      : undefined;

    const keys = [...this.store.keys()].filter((key) => key.startsWith(`${namespace}:`)).sort();
    const startIndex = cursor?.lastKey ? keys.indexOf(cursor.lastKey) + 1 : 0;
    const slice = keys.slice(startIndex, startIndex + limit);
    const items = slice.map((key) => this.store.get(key)!.value as T);
    const nextKey = startIndex + limit < keys.length ? keys[startIndex + limit - 1] : undefined;
    const nextCursor = nextKey ? Buffer.from(JSON.stringify({ lastKey: nextKey }), "utf8").toString("base64") : undefined;

    return {
      items,
      nextCursor,
    };
  }

  async healthCheck(): Promise<StorageHealthStatus> {
    return { healthy: true };
  }

  getVersion(namespace: string, id: string): string | undefined {
    return this.store.get(this.key(namespace, id))?.versionId;
  }

  private key(namespace: string, id: string): string {
    return `${namespace}:${id}`;
  }
}

export class InMemoryStreamAdapter implements StreamAdapter {
  public readonly kind = "stream" as const;
  private readonly store = new Map<string, StreamEntry[]>();
  private duplicateOnNextSubscribe = false;

  async init(): Promise<void> {}

  async publish(
    message: StorageStreamMessage,
    options?: StorageWriteOptions
  ): Promise<StorageStreamMessage> {
    void options;
    const sequence = this.getEntries(DEFAULT_NAMESPACE, message.stream).length;
    const normalised: StorageStreamMessage = {
      ...message,
      id: message.id ?? randomUUID(),
      publishedAt: message.publishedAt ?? new Date(),
    };
    this.getEntries(DEFAULT_NAMESPACE, message.stream).push({ message: normalised, sequence });
    return normalised;
  }

  subscribe(
    stream: string,
    options: { cursor?: StorageStreamCursor; batchSize?: number; signal?: AbortSignal }
  ): AsyncIterable<StorageStreamMessage> {
    const namespace = options.cursor?.namespace ?? DEFAULT_NAMESPACE;
    const entries = [...this.getEntries(namespace, stream)];
    const startPosition = options.cursor ? Number(options.cursor.position ?? 0) : 0;
    const duplicate = this.duplicateOnNextSubscribe;
    this.duplicateOnNextSubscribe = false;

    async function* iterator() {
      for (const entry of entries) {
        if (entry.sequence < startPosition) continue;
        yield entry.message;
        if (duplicate && entry.sequence === startPosition) {
          yield entry.message;
        }
      }
    }

    return iterator();
  }

  async commitCursor(cursor: StorageStreamCursor): Promise<void> {
    void cursor;
  }

  async healthCheck(): Promise<StorageHealthStatus> {
    return { healthy: true };
  }

  triggerDuplicatesOnNextSubscribe(): void {
    this.duplicateOnNextSubscribe = true;
  }

  createCursor(namespace: string, stream: string, position = 0): StorageStreamCursor {
    return { id: randomUUID(), namespace, stream, position: String(position) };
  }

  private getEntries(namespace: string, stream: string): StreamEntry[] {
    const key = `${namespace}:${stream}`;
    if (!this.store.has(key)) {
      this.store.set(key, []);
    }
    return this.store.get(key)!;
  }
}

export interface TestClientOptions {
  blobAdapter?: BlobAdapter;
  recordAdapter?: RecordAdapter;
  streamAdapter?: StreamAdapter;
  namespace?: string;
  metrics?: ReturnType<typeof createTestMetrics>;
  withCache?: boolean;
  logger?: StorageLogger;
}

const noopLogger = Object.freeze({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
});

export function createTestStorageClient(options: TestClientOptions = {}): {
  client: StorageClient;
  metrics: ReturnType<typeof createTestMetrics>;
  context: StorageContext;
  cacheEvents?: EventEmitter;
} {
  const metrics = options.metrics ?? createTestMetrics();
  const namespace = options.namespace ?? DEFAULT_NAMESPACE;
  const logger = options.logger ?? noopLogger;
  const config = {
    schemaVersion: 1 as const,
    blobAdapters: options.blobAdapter ? [{ namespaces: namespace, adapter: options.blobAdapter }] : undefined,
    recordAdapters: options.recordAdapter ? [{ namespaces: namespace, adapter: options.recordAdapter }] : undefined,
    streamAdapters: options.streamAdapter ? [{ namespaces: namespace, adapter: options.streamAdapter }] : undefined,
    consistency: { stalenessBudgetMs: 100 },
  } satisfies StorageConfig;

  const dependencies: Parameters<typeof createStorageClient>[1] = {
    logger,
    metrics: metrics.metrics,
  };

  let cacheEvents: EventEmitter | undefined;

  if (options.withCache) {
    const store = new Map<string, CacheEnvelope<unknown>>();
    const emitter = new EventEmitter();
    const provider: CacheProvider<CacheEnvelope<unknown>> = {
      async init() {},
      async dispose() {
        store.clear();
        emitter.removeAllListeners();
      },
      async get(key) {
        return store.get(key);
      },
      async set(key, entry) {
        store.set(key, entry.value);
        emitter.emit("invalidate", key);
      },
      async delete(key) {
        store.delete(key);
        emitter.emit("invalidate", key);
      },
      on(event, listener) {
        if (event === "invalidate") {
          emitter.on(event, listener);
          return emitter;
        }
        return undefined;
      },
      off(event, listener) {
        if (event === "invalidate") {
          emitter.off(event, listener);
          return emitter;
        }
        return undefined;
      },
    };

    cacheEvents = emitter;

    dependencies.cache = {
      provider,
      options: {
        metrics: metrics.metrics,
        namespace,
        stalenessBudgetMs: config.consistency?.stalenessBudgetMs,
        logger,
      },
    };
  }

  const client = createStorageClient(config, dependencies);

  const context: StorageContext = {
    tenantId: "tenant",
    namespace,
    requestId: randomUUID(),
    traceId: randomUUID(),
  };

  return { client, metrics, context, cacheEvents };
}

