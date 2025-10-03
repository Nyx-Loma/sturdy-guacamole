import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RedisStreamAdapter } from "../../../src/adapters/redisStream";
import type { StorageStreamCursor, StorageStreamMessage } from "../../../src/types";
import { getIntegrationAvailability } from "../state";

function redisUrl(): string {
  const url = process.env.STORAGE_TEST_REDIS_URL;
  if (!url) {
    throw new Error("STORAGE_TEST_REDIS_URL not set");
  }
  return url;
}

const availability = getIntegrationAvailability();
const integrationReady = availability?.ready ?? false;

describe.skipIf(!integrationReady)("RedisStreamAdapter integration", () => {
  it("publishes, consumes, and commits cursor", async () => {
    const adapter = new RedisStreamAdapter({ redisUrl: redisUrl(), streamPrefix: "storage-it", groupPrefix: "storage-it-group" });
    await adapter.init();

    const namespace = "integration";
    const stream = `stream-${randomUUID().slice(0, 6)}`;
    const message: StorageStreamMessage = {
      id: randomUUID(),
      namespace,
      stream,
      payload: { value: "hello" },
      publishedAt: new Date(),
    };

    const published = await adapter.publish(message, {}, { namespace });
    expect(published.id).toBeTruthy();

    const cursor: StorageStreamCursor = {
      id: randomUUID(),
      namespace,
      stream,
      position: ">",
    };

    const iterator = adapter.subscribe(stream, { cursor, batchSize: 10 }, { namespace });
    const first = await iterator.next();
    expect(first.value?.payload).toMatchObject({ value: "hello" });
    expect(first.done).toBe(false);

    const consumed = first.value!;
    await adapter.commitCursor({ namespace, stream, id: cursor.id, position: consumed.id }, { namespace });

    await adapter.dispose();
  });
});
