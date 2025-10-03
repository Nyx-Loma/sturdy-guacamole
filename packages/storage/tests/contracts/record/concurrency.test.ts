import { describe, expect, it } from "vitest";
import { createTestStorageClient, InMemoryRecordAdapter } from "../../support/inMemoryAdapters";
import { PreconditionFailedError } from "../../../src/errors";

describe("record concurrency", () => {
  it("throws PreconditionFailedError when concurrency token mismatches", async () => {
    const recordAdapter = new InMemoryRecordAdapter<{ id: string; value: string }>();
    const { client, context } = createTestStorageClient({ recordAdapter });
    const record = { id: "rec", value: "initial" } as const;

    await client.upsertRecord(context.namespace, record, {}, context);

    const storedVersion = recordAdapter.getVersion(context.namespace, record.id);
    expect(storedVersion).toBeDefined();

    await expect(
      client.upsertRecord(
        context.namespace,
        { ...record, value: "conflicting" },
        { concurrencyToken: "stale-version" },
        context
      )
    ).rejects.toBeInstanceOf(PreconditionFailedError);
  });
});


