import { describe, expect, it, vi, beforeEach } from "vitest";
import type { BlobAdapter, RecordAdapter, StreamAdapter } from "../src/adapters/base";
import { createStorageClient } from "../src/client";
import { NotFoundError, StorageError, TimeoutError } from "../src/errors";
import type {
  StorageObject,
  StorageObjectReference,
  StorageContext,
} from "../src/types";
import { createTestMetrics } from "../src/observability/metrics";

function makeRecordAdapter(overrides?: Partial<RecordAdapter>): RecordAdapter {
  const store = new Map<string, Record<string, unknown>>();
  const adapter: RecordAdapter = {
    kind: "record",
    async init() {},
    async upsert(namespace, record) {
      const key = `${namespace}:${(record as { id?: string }).id ?? "id"}`;
      store.set(key, record);
      return record;
    },
    async get(ref) {
      const key = `${ref.namespace}:${ref.id}`;
      const record = store.get(key);
      if (!record) throw new NotFoundError("Record not found", { ref });
      return record;
    },
    async delete(ref) {
      store.delete(`${ref.namespace}:${ref.id}`);
    },
    async query() {
      return { items: [...store.values()] };
    },
    async healthCheck() {
      return { healthy: true };
    },
    async dispose() {},
    ...overrides,
  };
  return adapter;
}

const namespace = "test-ns";

function createContext(): StorageContext {
  return {
    namespace,
    tenantId: "tenant",
    requestId: "req-1",
    traceId: "trace-1",
  };
}

function makeBlobAdapter(overrides?: Partial<BlobAdapter>): BlobAdapter {
  const store = new Map<string, StorageObject<Buffer>>();
  const adapter: BlobAdapter = {
    kind: "blob",
    async init() {},
    async write(ref, payload) {
      const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
      const object: StorageObject<Buffer> = {
        id: ref.id,
        namespace: ref.namespace,
        payload: buffer,
        metadata: {
          checksum: "sha",
          checksumAlgorithm: "sha256",
          contentType: "application/octet-stream",
          createdAt: new Date(),
          updatedAt: new Date(),
          size: buffer.byteLength,
          versionId: `v-${Date.now()}`,
        },
      };
      store.set(`${ref.namespace}:${ref.id}`, object);
      return object;
    },
    async read(ref) {
      const obj = store.get(`${ref.namespace}:${ref.id}`);
      if (!obj) throw new NotFoundError("Blob not found", { ref });
      return obj;
    },
    async delete(ref) {
      store.delete(`${ref.namespace}:${ref.id}`);
    },
    async list() {
      return { objects: [] };
    },
    async dispose() {},
    async healthCheck() {
      return { healthy: true };
    },
    ...overrides,
  };
  return adapter;
}

function makeStreamAdapter(overrides?: Partial<StreamAdapter>): StreamAdapter {
  return {
    kind: "stream",
    async init() {},
    async publish(_message) {},
    subscribe: vi.fn().mockReturnValue((async function* () {})()),
    async commitCursor() {},
    async healthCheck() {
      return { healthy: true };
    },
    async dispose() {},
    ...overrides,
  } as StreamAdapter;
}

describe("createStorageClient cache behavior", () => {
  const blobRef: StorageObjectReference = { namespace, id: "blob-1" };
  let metrics: ReturnType<typeof createTestMetrics>;
  let logger: { debug: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    metrics = createTestMetrics();
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  });

  it("returns cache hit for eventual consistency", async () => {
    const blobAdapter = makeBlobAdapter();
    const config = {
      schemaVersion: 1 as const,
      blobAdapters: [{ namespaces: namespace, adapter: blobAdapter }],
      consistency: { stalenessBudgetMs: 100 },
    };
    const cacheStore = new Map<string, CacheEntry>();
    const client = createStorageClient(config, {
      logger,
      metrics: metrics.metrics,
      cache: {
        provider: makeInMemoryCache(cacheStore),
        options: { metrics: metrics.metrics, namespace },
      },
    });

    const context = createContext();
    await client.writeBlob(blobRef, Buffer.from("value"), {}, context);

    const first = await client.readBlob(blobRef, { consistency: "eventual" }, context);
    expect(first.payload.toString()).toBe("value");

    cacheStore.clear();
    cacheStore.set(makeCacheKey("blob", namespace, blobRef.id), makeCacheEnvelope(first));

    const second = await client.readBlob(blobRef, { consistency: "eventual" }, context);
    expect(second.payload.toString()).toBe("value");
    const cacheHits = metrics.counters.requestsTotal.filter((entry) => entry.labels?.op === "cache_get");
    expect(cacheHits.length).toBeGreaterThan(0);
  });

  it("throws cache miss error for cache_only reads", async () => {
    const blobAdapter = makeBlobAdapter();
    const config = {
      schemaVersion: 1 as const,
      blobAdapters: [{ namespaces: namespace, adapter: blobAdapter }],
    };
    const metricsSpy = createTestMetrics();
    const client = createStorageClient(config, {
      logger,
      metrics: metricsSpy.metrics,
      cache: {
        provider: makeInMemoryCache(new Map()),
        options: { metrics: metricsSpy.metrics, namespace },
      },
    });

    await expect(client.readBlob(blobRef, { consistency: "cache_only" }, createContext())).rejects.toThrowError(
      new NotFoundError("Cache miss", { ref: blobRef, source: "cache" })
    );
    expect(logger.debug).toHaveBeenCalledWith(expect.objectContaining({ op: "cache.miss" }));
    const cacheRequests = metricsSpy.counters.cacheRequestsTotal ?? [];
    expect(cacheRequests.some((entry) => entry.labels?.op === "cache_get")).toBe(true);
  });

  it("bypasses cache for strong reads", async () => {
    const blobAdapter = makeBlobAdapter();
    const config = {
      schemaVersion: 1 as const,
      blobAdapters: [{ namespaces: namespace, adapter: blobAdapter }],
    };
    const cacheStore = new Map<string, CacheEntry>();
    const client = createStorageClient(config, {
      logger,
      metrics: metrics.metrics,
      cache: {
        provider: makeInMemoryCache(cacheStore),
        options: { metrics: metrics.metrics, namespace },
      },
    });

    const context = createContext();
    await client.writeBlob(blobRef, Buffer.from("fresh"), {}, context);

    cacheStore.set(makeCacheKey("blob", namespace, blobRef.id), makeCacheEnvelope({
      id: blobRef.id,
      namespace,
      metadata: {
        checksum: "sha",
        checksumAlgorithm: "sha256",
        contentType: "text/plain",
        createdAt: new Date(),
        updatedAt: new Date(),
        size: 5,
        versionId: "stale",
      },
      payload: Buffer.from("stale"),
    }));

    const strong = await client.readBlob(blobRef, { consistency: "strong", bypassCache: true }, context);
    expect(strong.payload.toString()).toBe("fresh");
    expect(logger.debug).toHaveBeenCalledWith(expect.objectContaining({ cacheState: "bypass" }));
  });

  it("records retries and metrics when adapter times out", async () => {
    const timeoutAdapter = makeBlobAdapter({
      async read() {
        throw new TimeoutError("timeout", { timeoutMs: 5 });
      },
    });
    const metricsSpy = createTestMetrics();
    const client = createStorageClient(
      {
        schemaVersion: 1 as const,
        blobAdapters: [{ namespaces: namespace, adapter: timeoutAdapter }],
      },
      {
        logger,
        metrics: metricsSpy.metrics,
      }
    );

    await expect(client.readBlob(blobRef, { timeoutMs: 5 }, createContext())).rejects.toThrow(TimeoutError);
    const errorEntries = metricsSpy.counters.errorsTotal ?? [];
    expect(errorEntries.some((entry) => entry.labels?.code === "TIMEOUT" || entry.labels?.code === "UNKNOWN")).toBe(true);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ op: "get_blob" }));
  });

  it("applies cache invalidation after write and delete", async () => {
    const blobAdapter = makeBlobAdapter();
    const cacheStore = new Map<string, CacheEntry>();
    const cacheProvider = makeInMemoryCache(cacheStore);
    const client = createStorageClient(
      {
        schemaVersion: 1 as const,
        blobAdapters: [{ namespaces: namespace, adapter: blobAdapter }],
      },
      {
        logger,
        metrics: metrics.metrics,
        cache: {
          provider: cacheProvider,
          options: { metrics: metrics.metrics, namespace },
        },
      }
    );

    const context = createContext();
    await client.writeBlob(blobRef, Buffer.from("payload"), {}, context);
    expect(cacheStore.size).toBe(0);
    await client.readBlob(blobRef, {}, context);
    expect(cacheStore.size).toBe(1);
    await client.deleteBlob(blobRef, {}, context);
    expect(cacheStore.size).toBe(0);
  });

  it("surfaces adapter failures with StorageError metadata", async () => {
    const failingAdapter = makeBlobAdapter({
      async read() {
        throw new StorageError("boom", { code: "TRANSIENT_ADAPTER_ERROR" });
      },
    });
    const client = createStorageClient(
      {
        schemaVersion: 1 as const,
        blobAdapters: [{ namespaces: namespace, adapter: failingAdapter }],
      },
      {
        logger,
        metrics: metrics.metrics,
      }
    );

    await expect(client.readBlob(blobRef, {}, createContext())).rejects.toThrow(StorageError);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ code: "TRANSIENT_ADAPTER_ERROR" }));
  });

  it("caches record reads and invalidates on delete", async () => {
    const recordAdapter = makeRecordAdapter();
    const metricsSpy = createTestMetrics();
    const cacheStore = new Map<string, CacheEntry>();
    const client = createStorageClient(
      {
        schemaVersion: 1 as const,
        recordAdapters: [{ namespaces: namespace, adapter: recordAdapter }],
      },
      {
        logger,
        metrics: metricsSpy.metrics,
        cache: {
          provider: makeInMemoryCache(cacheStore),
          options: { metrics: metricsSpy.metrics, namespace },
        },
      }
    );

    const context = createContext();
    const record = { id: "record-1", value: "hello" };
    await client.upsertRecord(namespace, record, {}, context);
    await client.getRecord({ namespace, id: record.id }, { consistency: "eventual" }, context);
    expect(cacheStore.size).toBe(1);

    const second = await client.getRecord({ namespace, id: record.id }, { consistency: "eventual" }, context);
    expect(second).toEqual(record);
    expect(metricsSpy.counters.requestsTotal.some((entry) => entry.labels?.op === "cache_get")).toBe(true);

    await client.deleteRecord({ namespace, id: record.id }, {}, context);
    expect(cacheStore.size).toBe(1);
  });

  it("applies pagination trace attributes on queryRecords", async () => {
    const recordAdapter = makeRecordAdapter();
    const client = createStorageClient(
      {
        schemaVersion: 1 as const,
        recordAdapters: [{ namespaces: namespace, adapter: recordAdapter }],
      },
      {
        logger,
        metrics: metrics.metrics,
      }
    );

    const context = createContext();
    await client.upsertRecord(namespace, { id: "r1" }, {}, context);
    await client.queryRecords(namespace, {}, { pagination: { cursor: "c1", limit: 10 } }, context);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        op: "query_record",
        namespace,
      })
    );
  });

  it("throws ValidationFailedError when subscribing without cursor", async () => {
    const streamAdapter = makeStreamAdapter();
    const client = createStorageClient(
      {
        schemaVersion: 1 as const,
        streamAdapters: [{ namespaces: namespace, adapter: streamAdapter }],
      },
      { logger, metrics: metrics.metrics }
    );

    expect(() => client.subscribeStream("events", {}, createContext())).toThrowError(/requires cursor/);
  });

  it("records stream publish metrics and propagates errors", async () => {
    const failingAdapter = makeStreamAdapter({
      async publish() {
        throw new StorageError("stream failure", { code: "TRANSIENT_STREAM_ERROR" });
      },
    });
    const metricsSpy = createTestMetrics();
    const client = createStorageClient(
      {
        schemaVersion: 1 as const,
        streamAdapters: [{ namespaces: namespace, adapter: failingAdapter }],
      },
      {
        logger,
        metrics: metricsSpy.metrics,
      }
    );

    await expect(
      client.publishStream(
        { namespace, stream: "events", payload: { foo: "bar" } },
        {},
        createContext()
      )
    ).rejects.toBeInstanceOf(StorageError);
    expect(metricsSpy.counters.errorsTotal?.some((entry) => entry.labels?.op === "publish_stream")).toBe(true);
  });
});

type CacheEntry = { value: CacheEnvelope; ttlSeconds?: number };
interface CacheEnvelope {
  value: StorageObject<Buffer>;
  storedAt: number;
}

function makeCacheEnvelope(object: StorageObject<Buffer>): CacheEntry {
  return { value: { value: object, storedAt: Date.now() } };
}

function makeCacheKey(kind: "blob" | "record", namespace: string, id: string): string {
  return `${kind}:${namespace}:${id}`;
}

function makeInMemoryCache(store: Map<string, CacheEntry>): CacheProvider<CacheEnvelope> {
  return {
    async init() {},
    async dispose() {
      store.clear();
    },
    async get(key) {
      const entry = store.get(key);
      return entry?.value;
    },
    async set(key, entry) {
      store.set(key, entry);
    },
    async delete(key) {
      store.delete(key);
    },
  };
}


