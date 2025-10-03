import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStorageClient } from "../src/client";
import type { BlobAdapter, StreamAdapter } from "../src/adapters/base";
import { createTestMetrics } from "../src/observability/metrics";

const namespace = "ns";

function makeBlobAdapter(listObjects: Array<{ id: string }>): BlobAdapter {
  return {
    kind: "blob",
    async init() {},
    async write() { throw new Error("noop"); },
    async read() { throw new Error("noop"); },
    async delete() {},
    async list() { return { objects: listObjects.map((o) => ({ id: o.id, namespace, payload: Buffer.alloc(0), metadata: { checksum: "sha", checksumAlgorithm: "sha256", contentType: "application/octet-stream", createdAt: new Date(), updatedAt: new Date(), size: 0, versionId: "v1" } })) }; },
    async dispose() {},
    async healthCheck() { return { healthy: true }; },
  } as BlobAdapter;
}

function makeStreamAdapter(): StreamAdapter {
  return {
    kind: "stream",
    async init() {},
    async publish() {},
    subscribe: vi.fn().mockReturnValue((async function* () {})()),
    async commitCursor() {},
    async healthCheck() { return { healthy: true }; },
    async dispose() {},
  } as StreamAdapter;
}

describe("client additional paths", () => {
  let logger: { debug: any; info: any; warn: any; error: any };
  let metrics: ReturnType<typeof createTestMetrics>;

  beforeEach(() => {
    logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    metrics = createTestMetrics();
  });

  it("listBlobs returns adapter listing and emits metrics", async () => {
    const client = createStorageClient({ schemaVersion: 1 as const, blobAdapters: [{ namespaces: namespace, adapter: makeBlobAdapter([{ id: "a" }]) }] }, { logger, metrics: metrics.metrics });
    const out = await client.listBlobs({ namespace }, { namespace, tenantId: "t", requestId: "r", traceId: "z" } as any);
    expect(out.objects.length).toBe(1);
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ op: "list_blob", namespace }));
  });

  it("commitStreamCursor emits trace attributes and metrics", async () => {
    const stream = makeStreamAdapter();
    const client = createStorageClient({ schemaVersion: 1 as const, streamAdapters: [{ namespaces: namespace, adapter: stream }] }, { logger, metrics: metrics.metrics });
    await client.commitStreamCursor({ namespace, stream: "events", id: "g1", position: "0-1" }, { namespace } as any);
    expect(logger.debug).toHaveBeenCalledWith(expect.objectContaining({ op: "commit_cursor", namespace }));
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ op: "commit_cursor", namespace }));
  });

  it("checkHealth aggregates adapters", async () => {
    const client = createStorageClient({ schemaVersion: 1 as const, blobAdapters: [{ namespaces: namespace, adapter: makeBlobAdapter([]) }] }, { logger, metrics: metrics.metrics });
    const health = await client.checkHealth({ namespace } as any);
    expect(health.healthy).toBe(true);
  });

  it("getQuota returns undefined placeholder", async () => {
    const client = createStorageClient({ schemaVersion: 1 as const }, { logger, metrics: metrics.metrics });
    const q = await client.getQuota(namespace, { namespace } as any);
    expect(q).toBeUndefined();
  });
});



