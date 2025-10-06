import { describe, expect, it, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import {
  CacheManager,
  type CacheEnvelope,
  type CacheProvider,
} from "../src/cache/cacheManager";
import { createTestMetrics } from "../src/observability/metrics";
import { CircuitBreaker } from "../src/utils/circuitBreaker";

type TestPayload = string;

interface MockProviderContext {
  store: Map<string, CacheEnvelope<TestPayload>>;
  emitter: EventEmitter;
  provider: CacheProvider<CacheEnvelope<TestPayload>>;
}

function createMockProvider(overrides?: Partial<CacheProvider<CacheEnvelope<TestPayload>>>): MockProviderContext {
  const store = new Map<string, CacheEnvelope<TestPayload>>();
  const emitter = new EventEmitter();

  const baseProvider: CacheProvider<CacheEnvelope<TestPayload>> = {
    async init() {},
    async dispose() {
      store.clear();
      emitter.removeAllListeners();
    },
    async get(key) {
      return store.get(key);
    },
    async set(key, entry) {
      store.set(key, entry.value);
      emitter.emit("invalidate", key);
    },
    async delete(key) {
      store.delete(key);
      emitter.emit("invalidate", key);
    },
    on(event, listener) {
      if (event === "invalidate") {
        emitter.on(event, listener);
        return emitter;
      }
      return undefined;
    },
    off(event, listener) {
      if (event === "invalidate") {
        emitter.off(event, listener);
        return emitter;
      }
      return undefined;
    },
  };

  return {
    store,
    emitter,
    provider: { ...baseProvider, ...overrides },
  };
}

describe("CacheManager", () => {
  const namespace = "ns";
  const adapter = "memory";
  let logger: { debug: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  });

  it("records metrics and emits invalidation on writes", async () => {
    const { provider, store } = createMockProvider();
    const metrics = createTestMetrics();
    const manager = new CacheManager<TestPayload>(provider, {
      metrics: metrics.metrics,
      namespace,
      adapter,
      logger,
    });

    await manager.init();

    const invalidate = vi.fn();
    manager.onInvalidate(invalidate);

    await manager.set("key", "value", 10);

    expect(store.get("key")?.value).toBe("value");
    expect(invalidate).toHaveBeenCalledWith("key");
    expect(metrics.counters.cacheRequestsTotal?.length ?? 0).toBe(1);
    expect(metrics.histograms.cacheLatencyMs?.length ?? 0).toBe(1);

    await manager.delete("key");
    expect(invalidate).toHaveBeenCalledWith("key");
    expect(metrics.counters.cacheRequestsTotal?.length ?? 0).toBe(2);

    await manager.dispose();
  });

  it("retries transient failures and logs cache misses", async () => {
    const { provider, store } = createMockProvider();
    const metrics = createTestMetrics();
    const manager = new CacheManager<TestPayload>(provider, {
      metrics: metrics.metrics,
      namespace,
      adapter,
      logger,
      retry: { attempts: 2, baseDelayMs: 1, jitter: false },
    });

    await manager.init();

    await manager.set("key", "initial");

    let attempts = 0;
    provider.get = async (key) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("transient");
      }
      return store.get(key);
    };

    const value = await manager.get("key");
    expect(value.value).toBe("initial");
    expect(metrics.counters.cacheRetriesTotal?.length ?? 0).toBe(1);

    provider.get = async () => undefined;
    await manager.get("missing");
    expect(logger.debug).toHaveBeenCalledWith(expect.objectContaining({ op: "cache.miss", cacheKey: "missing" }));

    await manager.dispose();
  });

  it("opens circuit breaker and surfaces circuit open errors", async () => {
    const failingError = new Error("boom");
    const { provider } = createMockProvider({
      async get() {
        throw failingError;
      },
    });
    const metrics = createTestMetrics();
    const circuitBreaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 10_000 });
    const manager = new CacheManager<TestPayload>(provider, {
      metrics: metrics.metrics,
      namespace,
      adapter,
      logger,
      circuitBreaker,
    });

    await manager.init();

    await expect(manager.get("key")).rejects.toThrow(failingError);
    await expect(manager.get("key")).rejects.toThrow(/Cache circuit breaker is open/);

    const cacheErrors = metrics.counters.cacheErrorsTotal ?? [];
    const codes = cacheErrors.map((entry) => entry.labels?.code);
    expect(codes).toContain("Error");
    expect(codes).toContain("CircuitOpen");
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ code: "CircuitOpen" }));

    await manager.dispose();
  });

  it("suppresses provider JSON parse errors and increments metrics", async () => {
    const parseError = new Error("invalid json");
    const { provider } = createMockProvider({
      async get() {
        throw parseError;
      },
    });
    const metrics = createTestMetrics();
    const manager = new CacheManager<TestPayload>(provider, {
      metrics: metrics.metrics,
      namespace,
      adapter,
      logger,
      retry: { attempts: 1, baseDelayMs: 1, jitter: false },
    });

    await manager.init();

    await expect(manager.get("key")).rejects.toThrow(parseError);

    const errors = metrics.counters.cacheErrorsTotal ?? [];
    expect(errors.map((entry) => entry.labels?.code)).toContain("Error");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ op: "cache_get", code: "Error" })
    );

    await manager.dispose();
  });

  it("propagates provider invalidate events to listeners", async () => {
    const { provider, emitter } = createMockProvider();
    const metrics = createTestMetrics();
    const manager = new CacheManager<TestPayload>(provider, {
      metrics: metrics.metrics,
      namespace,
      adapter,
      logger,
    });
    await manager.init();

    const handler = vi.fn();
    manager.onInvalidate(handler);

    emitter.emit("invalidate", "foo");

    expect(handler).toHaveBeenCalledWith("foo");

    await manager.dispose();
  });
});


