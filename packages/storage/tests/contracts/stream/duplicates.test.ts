import { describe, expect, it } from "vitest";
import { createTestStorageClient, InMemoryStreamAdapter } from "../../support/inMemoryAdapters";

describe("stream duplicates", () => {
  it("delivers duplicates in at-least-once semantics and consumer handles idempotency", async () => {
    const streamAdapter = new InMemoryStreamAdapter();
    const { client, context } = createTestStorageClient({ streamAdapter });

    const cursor = streamAdapter.createCursor(context.namespace, "events", 0);
    await client.publishStream(
      {
        id: "event-1",
        namespace: context.namespace,
        stream: "events",
        payload: { foo: "bar" },
        publishedAt: new Date(),
      },
      {},
      context
    );

    streamAdapter.triggerDuplicatesOnNextSubscribe();
    const seen = new Set<string>();
    const consumer = client.subscribeStream(
      "events",
      {
        cursor,
        batchSize: 10,
      },
      context
    );

    for await (const message of consumer) {
      if (seen.has(message.id)) {
        expect(message.id).toEqual("event-1");
        break;
      }
      seen.add(message.id);
    }

    expect(seen.has("event-1")).toBe(true);
  });
});


