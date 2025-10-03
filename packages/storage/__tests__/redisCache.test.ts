import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CacheEnvelope } from "../src/cache/cacheManager";

interface FakeRedisInstance {
  connect: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  listeners: Map<string, Array<(...args: unknown[]) => void>>;
  trigger: (event: string, ...args: unknown[]) => void;
}

const redisInstances: FakeRedisInstance[] = [];
let RedisConstructorMock: ReturnType<typeof vi.fn>;

function createFakeRedisInstance(): FakeRedisInstance {
  const instance: FakeRedisInstance = {
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    listeners: new Map(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const listeners = instance.listeners.get(event) ?? [];
      listeners.push(handler);
      instance.listeners.set(event, listeners);
      return instance;
    }),
    get: vi.fn(),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    publish: vi.fn().mockResolvedValue(1),
    trigger(event: string, ...args: unknown[]) {
      const listeners = instance.listeners.get(event) ?? [];
      for (const listener of listeners) {
        listener(...args);
      }
    },
  };
  return instance;
}

vi.mock("ioredis", () => {
  RedisConstructorMock = vi.fn(() => {
    const instance = createFakeRedisInstance();
    redisInstances.push(instance);
    return instance;
  });
  return { __esModule: true, default: RedisConstructorMock };
});

import { RedisCache } from "../src/cache/redisCache";

function makeEnvelope<T>(value: T): CacheEnvelope<T> {
  return { value, storedAt: Date.now() };
}

describe("RedisCache", () => {
  beforeEach(() => {
    redisInstances.length = 0;
    RedisConstructorMock.mockClear();
  });

  it("returns undefined when stored value is invalid JSON", async () => {
    const cache = new RedisCache<string>({ redisUrl: "redis://localhost" });
    const [client] = redisInstances;
    client.get.mockResolvedValue("not-json");

    const result = await cache.get("key");

    expect(result).toBeUndefined();
    expect(client.get).toHaveBeenCalledWith("cache:key");
  });

  it("applies default TTL and publishes fan-out on set", async () => {
    const cache = new RedisCache<string>({
      redisUrl: "redis://localhost",
      namespace: "ns",
      fanoutChannel: "fan-out",
    });
    const [client] = redisInstances;

    await cache.set("foo", { value: makeEnvelope("payload") });

    expect(client.set).toHaveBeenCalledTimes(1);
    const call = client.set.mock.calls[0];
    expect(call[0]).toBe("ns:foo");
    expect(call[2]).toBe("EX");
    expect(call[3]).toBe(60);

    expect(client.publish).toHaveBeenCalledWith(
      "fan-out",
      expect.stringContaining('"key":"foo"'),
    );
  });

  it("omits TTL when entry ttlSeconds is zero", async () => {
    const cache = new RedisCache<string>({
      redisUrl: "redis://localhost",
      namespace: "ns",
    });
    const [client] = redisInstances;

    await cache.set("foo", { value: makeEnvelope("payload"), ttlSeconds: 0 });

    expect(client.set).toHaveBeenCalledTimes(1);
    const call = client.set.mock.calls[0];
    expect(call).toEqual(["ns:foo", expect.any(String)]);
  });

  it("emits invalidate when receiving fan-out from peer", async () => {
    const cache = new RedisCache<string>({
      redisUrl: "redis://localhost",
      namespace: "ns",
      fanoutChannel: "fan-out",
    });
    const [, subscriber] = redisInstances;

    await cache.init();

    expect(subscriber.subscribe).toHaveBeenCalledWith("fan-out");

    const handler = vi.fn();
    cache.on("invalidate", handler);

    subscriber.trigger("message", "fan-out", JSON.stringify({ key: "foo", origin: "peer" }));
    expect(handler).toHaveBeenCalledWith("foo");

    // self-origin payloads are ignored
    await cache.set("bar", { value: makeEnvelope("payload") });
    const [client] = redisInstances;
    const [, payload] = client.publish.mock.calls.pop() ?? [];
    const { origin } = JSON.parse(payload as string);

    handler.mockClear();
    subscriber.trigger("message", "fan-out", JSON.stringify({ key: "bar", origin }));
    expect(handler).not.toHaveBeenCalled();
  });
});

