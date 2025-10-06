import { describe } from "vitest";
import { RedisStreamAdapter } from "../../../src/adapters/redisStream";
import { describeStreamAdapterContract } from "../shared/streamAdapterContract";

// Use STORAGE_TEST_REDIS_URL (set by integration setup) or REDIS_URL (for manual testing)
const redisUrl = process.env.STORAGE_TEST_REDIS_URL || process.env.REDIS_URL;

describe.skipIf(!redisUrl)("Redis stream adapter", () => {
  describeStreamAdapterContract({
    name: "Redis",
    namespace: "redis-contract",
    createAdapter: async () => {
      const adapter = new RedisStreamAdapter({ redisUrl: redisUrl! });
      return { adapter };
    },
  });
});

