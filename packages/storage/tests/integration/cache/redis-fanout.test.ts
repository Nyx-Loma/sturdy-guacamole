import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RedisCache } from "../../../src/cache/redisCache";
import { CacheManager } from "../../../src/cache/cacheManager";
import { getIntegrationAvailability } from "../state";

const availability = getIntegrationAvailability();
const integrationReady = availability?.ready ?? false;

function redisUrl(): string {
  const url = process.env.STORAGE_TEST_REDIS_URL;
  if (!url) {
    throw new Error("STORAGE_TEST_REDIS_URL not set");
  }
  return url;
}

const namespace = `fanout-${Date.now()}`;

describe.skipIf(!integrationReady)("Redis cache fan-out", () => {
  let cache1: CacheManager<unknown> | undefined;
  let cache2: CacheManager<unknown> | undefined;

  beforeAll(async () => {
    // ensure redis instance is reachable
    const { createClient } = await import("redis");
    const client = createClient({ url: redisUrl() });
    await client.connect();
    await client.quit();
  });

  afterAll(async () => {
    await Promise.all([
      cache1?.dispose().catch(() => undefined),
      cache2?.dispose().catch(() => undefined),
    ]);
  });

  it("invalidates peer caches when a key changes", async () => {
    const cacheKey = `${namespace}:object:${Date.now()}`;
    const redisCache1 = new RedisCache<unknown>({ redisUrl: redisUrl(), namespace });
    const redisCache2 = new RedisCache<unknown>({ redisUrl: redisUrl(), namespace });

    cache1 = new CacheManager(redisCache1, {});
    cache2 = new CacheManager(redisCache2, {});

    await Promise.all([cache1.init(), cache2.init()]);

    let invalidated = false;
    cache2.onInvalidate((key) => {
      if (key === cacheKey) {
        invalidated = true;
      }
    });

    await cache1.set(cacheKey, { value: "payload" });

    // allow fan-out to propagate
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(invalidated).toBe(true);
  });
});
