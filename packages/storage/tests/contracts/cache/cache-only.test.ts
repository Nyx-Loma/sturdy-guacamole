import { describe, expect, test, vi } from "vitest";
import { createTestStorageClient, DEFAULT_NAMESPACE, InMemoryBlobAdapter } from "../../support/inMemoryAdapters";
import { NotFoundError } from "../../../src/errors";

const namespace = DEFAULT_NAMESPACE;

describe("cache-only reads", () => {
  test("returns cached value when present", async () => {
    const adapter = new InMemoryBlobAdapter();
    const { client, context, metrics } = createTestStorageClient({
      blobAdapter: adapter,
      withCache: true,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const ref = { namespace, id: "blob-1" } as const;
    await adapter.write(ref, Buffer.from("hello"), { consistency: "strong" });
    await client.readBlob(ref, { consistency: "strong" }, context);

    const result = await client.readBlob(ref, { consistency: "cache_only" }, context);
    expect(result.metadata.versionId).toBeDefined();
    expect(metrics.counters.cacheRequestsTotal?.length ?? 0).toBeGreaterThan(0);
  });

  test("throws NotFoundError('Cache miss') when cache empty", async () => {
    const adapter = new InMemoryBlobAdapter();
    const { client, context } = createTestStorageClient({
      blobAdapter: adapter,
      withCache: true,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const ref = { namespace, id: "blob-missing" } as const;

    await expect(client.readBlob(ref, { consistency: "cache_only" }, context)).rejects.toThrowError(
      new NotFoundError("Cache miss", { ref, source: "cache" })
    );
  });
});

