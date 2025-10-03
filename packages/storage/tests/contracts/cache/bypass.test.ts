import { describe, expect, it } from "vitest";
import { createTestStorageClient, InMemoryBlobAdapter } from "../../support/inMemoryAdapters";
import type { StorageObjectReference } from "../../../src/types";

describe("cache bypass", () => {
  it("bypassCache forces fresh read when cache is poisoned", async () => {
    const blobAdapter = new InMemoryBlobAdapter();
    const { client, context } = createTestStorageClient({ blobAdapter });
    const ref: StorageObjectReference = { id: "object", namespace: context.namespace };

    const first = await client.writeBlob(ref, Buffer.from("initial"), {}, context);
    const second = await client.writeBlob(ref, Buffer.from("updated"), {}, context);

    blobAdapter.poisonCache(ref);

    const cached = await client.readBlob(ref, { consistency: "eventual" }, context);
    expect(cached.metadata.versionId).toEqual(first.metadata.versionId);

    const bypassed = await client.readBlob(ref, { consistency: "strong", bypassCache: true }, context);
    expect(bypassed.metadata.versionId).toEqual(second.metadata.versionId);
  });
});


