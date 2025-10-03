import { describe, expect, it } from "vitest";
import { createTestStorageClient, InMemoryBlobAdapter } from "../../support/inMemoryAdapters";
import type { StorageObjectReference } from "../../../src/types";

describe("blob strong consistency", () => {
  it("returns latest version on strong read", async () => {
    const blobAdapter = new InMemoryBlobAdapter();
    const { client, context } = createTestStorageClient({ blobAdapter });

    const ref: StorageObjectReference = { id: "obj", namespace: context.namespace };
    await client.writeBlob(ref, Buffer.from("first"), {}, context);
    const second = await client.writeBlob(ref, Buffer.from("second"), {}, context);

    const result = await client.readBlob(ref, { consistency: "strong" }, context);
    expect(result.metadata.versionId).toEqual(second.metadata.versionId);
  });

  it("serves stale data under eventual consistency but strong bypass returns fresh", async () => {
    const blobAdapter = new InMemoryBlobAdapter();
    const { client, context } = createTestStorageClient({ blobAdapter });

    const ref: StorageObjectReference = { id: "obj", namespace: context.namespace };
    const first = await client.writeBlob(ref, Buffer.from("first"), {}, context);
    const second = await client.writeBlob(ref, Buffer.from("second"), {}, context);

    blobAdapter.poisonCache(ref);

    const eventual = await client.readBlob(ref, { consistency: "eventual" }, context);
    expect(eventual.metadata.versionId).toEqual(first.metadata.versionId);

    const strongFresh = await client.readBlob(ref, { consistency: "strong", bypassCache: true }, context);
    expect(strongFresh.metadata.versionId).toEqual(second.metadata.versionId);
  });
});

