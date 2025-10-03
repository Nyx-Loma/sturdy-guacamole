import { describe } from "vitest";
import { RedisStreamAdapter } from "../../../src/adapters/redisStream";
import { describeStreamAdapterContract } from "../shared/streamAdapterContract";

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

const skip = !process.env.REDIS_URL;

describe.skipIf(skip)("Redis stream adapter", () => {
  describeStreamAdapterContract({
    name: "Redis",
    namespace: "redis-contract",
    createAdapter: async () => {
      const adapter = new RedisStreamAdapter({ redisUrl });
      await adapter.init();
      return { adapter };
    },
  });
});

