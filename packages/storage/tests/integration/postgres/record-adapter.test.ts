import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { PostgresRecordAdapter } from "../../../src/adapters/postgres";
import type { StorageWriteOptions } from "../../../src/types";
import { getIntegrationAvailability } from "../state";

const namespace = "integration";

function connectionString(): string {
  const url = process.env.STORAGE_TEST_POSTGRES_URL;
  if (!url) {
    throw new Error("STORAGE_TEST_POSTGRES_URL not set");
  }
  return url;
}

let client: Client;

beforeAll(async () => {
  if (getIntegrationAvailability()?.ready === false) return;
  client = new Client({ connectionString: connectionString() });
  await client.connect();
});

afterAll(async () => {
  if (client) {
    await client.end();
  }
});

describe("PostgresRecordAdapter integration", () => {
  it("initializes schema and performs CRUD with concurrency", async () => {
    const availability = getIntegrationAvailability();
    if (!availability?.ready) {
      return; // skipped due to unavailable runtime
    }
    const adapter = new PostgresRecordAdapter({ dsn: connectionString(), schema: "storage_it", table: `records_${randomUUID().slice(0, 8)}` });

    await adapter.init();

    type UserRecord = { id: string; name: string; email: string };
    const id = randomUUID();
    const base: StorageWriteOptions = {};

    const first: UserRecord = { id, name: "Alice", email: "alice@example.com" };
    await adapter.upsert<UserRecord>(namespace, first, base);

    const storedFirst = await adapter.get<UserRecord>({ namespace, id }, {});
    expect(storedFirst).toEqual(first);

    const concurrencyToken = await fetchVersion(namespace, id);
    expect(concurrencyToken).toBeDefined();

    const second: UserRecord = { id, name: "Alice Updated", email: "alice@example.com" };
    await adapter.upsert<UserRecord>(namespace, second, { concurrencyToken });

    const storedSecond = await adapter.get<UserRecord>({ namespace, id }, {});
    expect(storedSecond).toEqual(second);

    await expect(
      adapter.upsert(namespace, { id, name: "Bad Update", email: "alice@example.com" }, { concurrencyToken: "invalid" }),
    ).rejects.toThrow(/PreconditionFailedError/);

    // pagination
    const extraRecords: UserRecord[] = [];
    for (let i = 0; i < 5; i++) {
      const extra = { id: randomUUID(), name: `User-${i}`, email: `user-${i}@example.com` } as UserRecord;
      extraRecords.push(extra);
      await adapter.upsert<UserRecord>(namespace, extra, base);
    }

    const page1 = await adapter.query<UserRecord>(namespace, {}, { pagination: { limit: 3 } });
    expect(page1.items).toHaveLength(3);
    expect(page1.nextCursor).toBeDefined();

    const page2 = await adapter.query<UserRecord>(namespace, {}, { pagination: { limit: 3, cursor: page1.nextCursor } });
    expect(page2.items.length).toBeGreaterThan(0);

    await adapter.delete({ namespace, id }, {}, undefined);
    await expect(adapter.get<UserRecord>({ namespace, id }, {})).rejects.toThrow(/NotFoundError/);

    await adapter.dispose();
  });
});

async function fetchVersion(namespace: string, id: string): Promise<string | undefined> {
  const result = await client.query<{ version_id: string }>(
    "SELECT version_id FROM storage_it.records WHERE namespace = $1 AND id = $2",
    [namespace, id],
  );
  return result.rows[0]?.version_id;
}
