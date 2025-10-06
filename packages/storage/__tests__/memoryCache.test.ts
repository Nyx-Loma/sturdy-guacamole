import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MemoryCache } from "../src/cache/memoryCache";
import type { CacheEnvelope } from "../src/cache/cacheManager";

function makeEnvelope<T>(value: T): CacheEnvelope<T> {
  return { value, storedAt: Date.now() };
}

describe("MemoryCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns stored envelope before TTL expires", async () => {
    const cache = new MemoryCache<string>({ ttlSeconds: 5 });
    await cache.init();

    await cache.set("alpha", makeEnvelope("payload"));

    vi.advanceTimersByTime(4000);
    const hit = await cache.get("alpha");
    expect(hit?.value).toBe("payload");

    await cache.dispose();
  });

  it("evicts values when TTL elapses", async () => {
    const cache = new MemoryCache<string>({ ttlSeconds: 2 });
    await cache.init();

    await cache.set("alpha", makeEnvelope("payload"));
    vi.advanceTimersByTime(2500);

    const miss = await cache.get("alpha");
    expect(miss).toBeUndefined();

    await cache.dispose();
  });

  it("honors per-write TTL overrides", async () => {
    const cache = new MemoryCache<string>({ ttlSeconds: 10 });
    await cache.init();

    await cache.set("alpha", makeEnvelope("payload"), 1);
    vi.advanceTimersByTime(1200);

    const miss = await cache.get("alpha");
    expect(miss).toBeUndefined();

    await cache.dispose();
  });

  it("supports indefinite entries when ttlSeconds is zero", async () => {
    const cache = new MemoryCache<string>({ ttlSeconds: 1 });
    await cache.init();

    await cache.set("alpha", makeEnvelope("payload"), 0);
    vi.advanceTimersByTime(10_000);

    const hit = await cache.get("alpha");
    expect(hit?.value).toBe("payload");

    await cache.dispose();
  });

  it("evicts least recently used entry when maxItems exceeded", async () => {
    const cache = new MemoryCache<string>({ maxItems: 2, ttlSeconds: 10 });
    await cache.init();

    await cache.set("a", makeEnvelope("A"));
    await cache.set("b", makeEnvelope("B"));
    await cache.get("a"); // bump "a" to most recent
    await cache.set("c", makeEnvelope("C"));

    expect((await cache.get("a"))?.value).toBe("A");
    expect(await cache.get("b")).toBeUndefined();
    expect((await cache.get("c"))?.value).toBe("C");

    await cache.dispose();
  });

  it("delete removes entries and ordering", async () => {
    const cache = new MemoryCache<string>({ ttlSeconds: 10 });
    await cache.init();

    await cache.set("alpha", makeEnvelope("payload"));
    await cache.delete("alpha");

    expect(await cache.get("alpha")).toBeUndefined();

    await cache.dispose();
  });

  it("dispose clears stored values", async () => {
    const cache = new MemoryCache<string>({ ttlSeconds: 10 });
    await cache.init();

    await cache.set("alpha", makeEnvelope("payload"));
    await cache.dispose();

    expect(await cache.get("alpha")).toBeUndefined();
  });
});



