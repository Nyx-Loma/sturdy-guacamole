import Fastify from "fastify";
import { createStorageClient } from "../../../src/client";
import { RedisStreamAdapter } from "../../../src/adapters/redisStream";

const PORT = Number(process.env.PORT ?? 4015);
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

async function main() {
  const app = Fastify({ logger: true });

  const streamAdapter = new RedisStreamAdapter({ redisUrl: REDIS_URL });

  const client = createStorageClient({
    schemaVersion: 1 as const,
    streamAdapters: [{ namespaces: "load", adapter: streamAdapter }],
  });

  app.post("/streams/events", async (req, res) => {
    try {
      const payload = req.body ?? {};
      await client.publishStream({ namespace: "load", stream: "events", payload }, {}, { namespace: "load" } as any);
      return res.code(200).send({ ok: true });
    } catch (err) {
      req.log.error({ err }, "publish failed");
      return res.code(500).send({ ok: false });
    }
  });

  await app.listen({ host: "0.0.0.0", port: PORT });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});



