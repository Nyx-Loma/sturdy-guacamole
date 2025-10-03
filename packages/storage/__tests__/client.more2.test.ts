import { describe, it, expect, vi } from "vitest";
import { createStorageClient } from "../src/client";
import type { BlobAdapter, RecordAdapter } from "../src/adapters/base";
import { createTestMetrics } from "../src/observability/metrics";
import type { StorageObject } from "../src/types";

const namespace = "ns";

function makeBlobAdapterWithStore(): { adapter: BlobAdapter; store: Map<string, StorageObject<Buffer>> } {
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
    async read(ref) { return store.get(`${ref.namespace}:${ref.id}`)!; },
    async delete() {},
    async list() { return { objects: [] }; },
    async dispose() {},
    async healthCheck() { return { healthy: true }; },
  } as BlobAdapter;
  return { adapter, store };
}

function makeRecordAdapterWithStore(): { adapter: RecordAdapter; store: Map<string, Record<string, unknown>> } {
  const store = new Map<string, Record<string, unknown>>();
  const adapter: RecordAdapter = {
    kind: "record",
    async init() {},
    async upsert(ns, record) { store.set(`${ns}:${(record as any).id}`, record); return record; },
    async get(ref) { return store.get(`${ref.namespace}:${ref.id}`)!; },
    async delete() {},
    async query() { return { items: [] }; },
    async dispose() {},
    async healthCheck() { return { healthy: true }; },
  } as RecordAdapter;
  return { adapter, store };
}

type CacheEntry = { value: { value: any; storedAt: number } };
function makeCacheKey(kind: "blob" | "record", ns: string, id: string) { return `${kind}:${ns}:${id}`; }

function makeInMemoryCache(store: Map<string, CacheEntry>) {
  return {
    async init() {},
    async dispose() { store.clear(); },
    async get(key: string) { return store.get(key)?.value; },
    async set(key: string, entry: CacheEntry) { store.set(key, entry); },
    async delete(key: string) { store.delete(key); },
  };
}

describe("client easy gains", () => {
  it("strong read falls back to backend when cache entry is stale", async () => {
    const { adapter, store } = makeBlobAdapterWithStore();
    const metrics = createTestMetrics();
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const client = createStorageClient({ schemaVersion: 1 as const, blobAdapters: [{ namespaces: namespace, adapter }] }, { logger, metrics: metrics.metrics, cache: { provider: makeInMemoryCache(new Map()), options: { metrics: metrics.metrics, namespace, stalenessBudgetMs: 1 } } });
    const ref = { namespace, id: "b1" };
    const fresh = await adapter.write(ref as any, Buffer.from("fresh"), {} as any, {} as any);
    const cacheStore = new Map<string, CacheEntry>();
    // Insert stale by setting storedAt far in the past
    cacheStore.set(makeCacheKey("blob", namespace, ref.id), { value: { value: { ...fresh, payload: Buffer.from("stale") }, storedAt: Date.now() - 10_000 } });
    // Swap provider to the pre-populated store
    const client2 = createStorageClient({ schemaVersion: 1 as const, blobAdapters: [{ namespaces: namespace, adapter }] }, { logger, metrics: metrics.metrics, cache: { provider: makeInMemoryCache(cacheStore), options: { metrics: metrics.metrics, namespace, stalenessBudgetMs: 1 } } });
    const out = await client2.readBlob(ref as any, { consistency: "strong" }, { namespace } as any);
    expect(out.payload.toString()).toBe("fresh");
  });

  it("strong record read falls back to backend when cache is stale", async () => {
    const { adapter, store } = makeRecordAdapterWithStore();
    const metrics = createTestMetrics();
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const client = createStorageClient({ schemaVersion: 1 as const, recordAdapters: [{ namespaces: namespace, adapter }] }, { logger, metrics: metrics.metrics, cache: { provider: makeInMemoryCache(new Map()), options: { metrics: metrics.metrics, namespace, stalenessBudgetMs: 1 } } });
    const ref = { namespace, id: "r1" };
    const fresh = await adapter.upsert(namespace, { id: ref.id, v: 1 }, {} as any, {} as any);
    const cacheStore = new Map<string, CacheEntry>();
    cacheStore.set(makeCacheKey("record", namespace, ref.id), { value: { value: { id: ref.id, v: 0 }, storedAt: Date.now() - 10_000 } });
    const client2 = createStorageClient({ schemaVersion: 1 as const, recordAdapters: [{ namespaces: namespace, adapter }] }, { logger, metrics: metrics.metrics, cache: { provider: makeInMemoryCache(cacheStore), options: { metrics: metrics.metrics, namespace, stalenessBudgetMs: 1 } } });
    const out = await client2.getRecord(ref as any, { consistency: "strong" }, { namespace } as any);
    expect(out).toEqual(fresh);
  });

  it("throws when circuit breaker is open before request", async () => {
    const { adapter } = makeBlobAdapterWithStore();
    const metrics = createTestMetrics();
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const breaker = { shouldAllow: () => false, recordSuccess: vi.fn(), recordFailure: vi.fn() } as any;
    const client = createStorageClient({ schemaVersion: 1 as const, blobAdapters: [{ namespaces: namespace, adapter }] }, { logger, metrics: metrics.metrics, circuitBreaker: breaker });
    await expect(client.readBlob({ namespace, id: "x" } as any, {}, { namespace } as any)).rejects.toThrow();
  });

  it("missing adapters throw resolution errors", async () => {
    const metrics = createTestMetrics();
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const client = createStorageClient({ schemaVersion: 1 as const }, { logger, metrics: metrics.metrics });
    await expect(client.readBlob({ namespace, id: "x" } as any, {}, { namespace } as any)).rejects.toThrow();
    await expect(client.getRecord({ namespace, id: "x" } as any, {}, { namespace } as any)).rejects.toThrow();
    await expect(() => client.subscribeStream("s", { cursor: { namespace, stream: "s", id: "g", position: "0-0" } } as any, { namespace } as any)).toThrow();
  });
});



