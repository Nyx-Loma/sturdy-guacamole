import { describe, beforeAll, afterAll, it, expect } from "vitest";
import type { StreamAdapter } from "../../../src/adapters";
import type { StorageStreamCursor } from "../../../src/types";
import { createTestStorageClient } from "../../support/inMemoryAdapters";

export interface StreamAdapterContractConfig {
  name: string;
  createAdapter: () => Promise<{ adapter: StreamAdapter; cleanup?: () => Promise<void> } | { adapter: StreamAdapter; cleanup?: () => void }>;
  namespace?: string;
  stream?: string;
  skip?: boolean;
}

export function describeStreamAdapterContract(config: StreamAdapterContractConfig): void {
  const nsBase = config.namespace ?? `contract-stream-${Math.random().toString(36).slice(2)}`;
  const stream = config.stream ?? "events";
  const describeFn = config.skip ? describe.skip : describe;

  describeFn(`${config.name} stream adapter contract`, () => {
    let adapter: StreamAdapter;
    let cleanup: (() => Promise<void> | void) | undefined;
    let namespace: string;

    beforeAll(async () => {
      namespace = `${nsBase}-${Math.random().toString(36).slice(2)}`;
      const result = await config.createAdapter();
      adapter = result.adapter;
      cleanup = result.cleanup;
      if (adapter.init) {
        await adapter.init();
      }
    });

    afterAll(async () => {
      if (cleanup) {
        await cleanup();
      }
      if (adapter.dispose) {
        await adapter.dispose();
      }
    });

    it("publishes and consumes messages with durable acknowledgement", async () => {
      const { client, context } = createTestStorageClient({
        namespace,
        streamAdapter: adapter,
      });

      const cursor: StorageStreamCursor = {
        id: `consumer-${Math.random().toString(36).slice(2)}`,
        namespace,
        stream,
        position: "0-0",
      };

      const payload = { runId: Math.random() };
      const published = await client.publishStream(
        {
          namespace,
          stream,
          id: `msg-${Date.now()}`,
          payload,
        },
        {},
        context
      );

      const iterator = client.subscribeStream(
        stream,
        { cursor, batchSize: 1, signal: AbortSignal.timeout(2_000) },
        context
      );

      const { value } = await iterator.next();
      expect(value?.payload).toMatchObject(payload);

      await client.commitStreamCursor({ ...cursor, position: value!.id }, context);

      expect(value?.id).toBeDefined();
      expect(value?.id).not.toEqual(cursor.position);
      expect(published.id).toBeDefined();
    });
  });
}

