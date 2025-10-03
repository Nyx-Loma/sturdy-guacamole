import { beforeEach, describe, expect, it, vi } from "vitest";
import { RedisStreamAdapter } from "../src/adapters/redisStream";
import { ConsistencyError, TimeoutError, TransientAdapterError } from "../src/errors";

const connectMock = vi.fn();
const quitMock = vi.fn();
const xaddMock = vi.fn();
const xreadgroupMock = vi.fn();
const xackMock = vi.fn();
const xgroupMock = vi.fn();
const pingMock = vi.fn();

vi.mock("ioredis", () => ({
  __esModule: true,
  default: vi.fn(() => ({
    connect: connectMock,
    quit: quitMock,
    xadd: xaddMock,
    xreadgroup: xreadgroupMock,
    xack: xackMock,
    xgroup: xgroupMock,
    ping: pingMock,
  })),
}));

function createAdapter() {
  const adapter = new RedisStreamAdapter({ redisUrl: "redis://localhost" });
  const circuitBreaker = {
    shouldAllow: vi.fn().mockReturnValue(true),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
  };
  Object.assign(adapter as unknown as { circuitBreaker: typeof circuitBreaker }, { circuitBreaker });
  return adapter as RedisStreamAdapter & { circuitBreaker: typeof circuitBreaker };
}

beforeEach(() => {
  connectMock.mockReset();
  connectMock.mockResolvedValue(undefined);
  quitMock.mockReset();
  xaddMock.mockReset();
  xreadgroupMock.mockReset();
  xackMock.mockReset();
  xgroupMock.mockReset();
  pingMock.mockReset();
});

describe("RedisStreamAdapter", () => {
  it("connects redis clients on init", async () => {
    const adapter = createAdapter();
    await adapter.init();

    expect(connectMock).toHaveBeenCalledTimes(2);
  });

  it("publishes messages via xadd", async () => {
    xaddMock.mockResolvedValueOnce("1-0");
    const adapter = createAdapter();
    await adapter.init();

    const message = await adapter.publish({ stream: "events", payload: { foo: "bar" } }, {}, { namespace: "ns" });

    expect(message.id).toBe("1-0");
    expect(xaddMock).toHaveBeenCalled();
  });

  it("subscribes and yields parsed messages", async () => {
    xgroupMock.mockResolvedValueOnce(undefined);
    xreadgroupMock.mockResolvedValueOnce([["ns", [["1-0", ["data", JSON.stringify({ value: 1 })]]]]]);
    xreadgroupMock.mockResolvedValueOnce(null);

    const adapter = createAdapter();
    await adapter.init();
    const iterator = adapter.subscribe("stream", {}, { namespace: "ns" });
    const first = await iterator.next();

    expect(first.value?.id).toBe("1-0");
    expect(xgroupMock).toHaveBeenCalledWith("CREATE", expect.any(String), expect.any(String), "$", "MKSTREAM");
  });

  it("maps NOGROUP errors to ConsistencyError", async () => {
    xgroupMock.mockImplementationOnce(() => {
      const error = new Error("NOGROUP");
      (error as { message: string }).message = "NOGROUP";
      throw error;
    });

    const adapter = createAdapter();
    await adapter.init();

    const iterator = adapter.subscribe("stream", {}, { namespace: "ns" });
    await expect(iterator.next()).rejects.toThrow("NOGROUP");
  });

  it("maps ETIMEDOUT errors to TimeoutError", async () => {
    xaddMock.mockRejectedValue({ code: "ETIMEDOUT" });
    const adapter = createAdapter();
    await adapter.init();

    await expect(adapter.publish({ stream: "events", payload: {} }, {}, { namespace: "ns" })).rejects.toBeInstanceOf(TimeoutError);
  });

  it("treats circuit breaker open as TransientAdapterError", async () => {
    const adapter = createAdapter();
    adapter.circuitBreaker.shouldAllow.mockReturnValue(false);
    await adapter.init();

    await expect(adapter.publish({ stream: "events", payload: {} }, {}, { namespace: "ns" })).rejects.toBeInstanceOf(TransientAdapterError);
    expect(adapter.circuitBreaker.shouldAllow).toHaveBeenCalled();
  });

  it("acknowledges messages with xack", async () => {
    xackMock.mockResolvedValueOnce(1);
    const adapter = createAdapter();
    await adapter.init();

    await adapter.commitCursor({ stream: "events", position: "1-0" }, { namespace: "ns" });
    expect(xackMock).toHaveBeenCalled();
  });

  it("pings redis on health check", async () => {
    pingMock.mockResolvedValue("OK");
    const adapter = createAdapter();
    await adapter.init();
    const result = await adapter.healthCheck();
    expect(result.healthy).toBe(true);
  });
});


