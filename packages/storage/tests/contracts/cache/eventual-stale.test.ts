import { describe, expect, it } from "vitest";
import { createTestStorageClient, InMemoryBlobAdapter } from "../../support/inMemoryAdapters";
import type { StorageObjectReference } from "../../../src/types";

describe("eventual consistency", () => {
  it("allows stale cache entries", async () => {
    const blobAdapter = new InMemoryBlobAdapter();
    const { client, context } = createTestStorageClient({ blobAdapter });
    const ref: StorageObjectReference = { id: "object", namespace: context.namespace };

    const first = await client.writeBlob(ref, Buffer.from("v1"), {}, context);
    const eventualFirst = await client.readBlob(ref, { consistency: "eventual" }, context);
    expect(eventualFirst.metadata.versionId).toEqual(first.metadata.versionId);

    blobAdapter.poisonCache(ref);

    await client.writeBlob(ref, Buffer.from("v2"), {}, context);

    const eventual = await client.readBlob(ref, { consistency: "eventual" }, context);
    expect(eventual.metadata.versionId).toEqual(first.metadata.versionId);
  });
});


