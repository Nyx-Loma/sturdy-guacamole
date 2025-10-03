import { describe, expect, it } from "vitest";
import { createTestStorageClient, InMemoryBlobAdapter } from "../../support/inMemoryAdapters";
import type { StorageObjectReference } from "../../../src/types";

describe("cache consistency", () => {
  it("strong read bypasses stale cache within budget", async () => {
    const blobAdapter = new InMemoryBlobAdapter();
    const { client, context } = createTestStorageClient({ blobAdapter });
    const ref: StorageObjectReference = { id: "obj", namespace: context.namespace };

    await client.writeBlob(ref, Buffer.from("v1"), {}, context);

    const eventual = await client.readBlob(ref, { consistency: "eventual" }, context);
    expect(eventual.metadata.versionId).toBeDefined();

    const second = await client.writeBlob(ref, Buffer.from("v2"), {}, context);

    const strong = await client.readBlob(ref, { consistency: "strong" }, context);
    expect(strong.metadata.versionId).toEqual(second.metadata.versionId);
    expect(strong.payload.equals(Buffer.from("v2"))).toBe(true);
  });
});

