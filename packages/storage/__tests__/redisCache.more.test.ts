import { describe, it, expect, vi, beforeEach } from "vitest";

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
  return { __esModule: true, default: vi.fn(() => {
    const instance = createFakeRedisInstance();
    redisInstances.push(instance);
    return instance;
  }) };
});

import { RedisCache } from "../src/cache/redisCache";

describe("RedisCache more", () => {
  beforeEach(() => {
    redisInstances.length = 0;
  });

  it("delete publishes fan-out", async () => {
    const cache = new RedisCache<string>({ redisUrl: "redis://localhost", namespace: "ns", fanoutChannel: "fan-out" });
    const [client] = redisInstances;
    await cache.delete("foo");
    expect(client.del).toHaveBeenCalledWith("ns:foo");
    expect(client.publish).toHaveBeenCalledWith("fan-out", expect.stringContaining('"key":"foo"'));
  });

  it("dispose quits clients", async () => {
    const cache = new RedisCache<string>({ redisUrl: "redis://localhost" });
    const [, subscriber] = redisInstances;
    await cache.dispose();
    expect(subscriber.quit).toHaveBeenCalled();
  });

  it("ignores invalid fan-out JSON", async () => {
    const cache = new RedisCache<string>({ redisUrl: "redis://localhost", fanoutChannel: "fan-out" });
    const [, sub] = redisInstances;
    await cache.init();
    const spy = vi.fn();
    cache.on("invalidate", spy);
    sub.trigger("message", "fan-out", "invalid-json");
    expect(spy).not.toHaveBeenCalled();
  });
});



