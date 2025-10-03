import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { createOutboxRepository } from '../../../repositories/outboxRepository';
import { createDispatcher } from '../../../app/stream/dispatcher';
import { setupDatabaseTests } from '../helpers/setupDatabase';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const STREAM_NAME = `test:dispatcher:${Date.now()}`;

describe('Dispatcher Integration Tests', () => {
  if (!process.env.DATABASE_URL) {
    it.skip('skipped: DATABASE_URL not configured');
    return;
  }

  const { client, available } = setupDatabaseTests(process.env.DATABASE_URL, {
    truncateTables: ['messaging.message_outbox', 'messaging.message_dlq', 'messaging.messages'],
    requireSchema: true,
  });

  let pool: Pool;
  let redis: Redis;
  let redisAvailable = false;

  beforeAll(async () => {
    if (!available) return;

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      application_name: 'integration-test-dispatcher',
    });

    // Check Redis availability
    redis = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      connectTimeout: 3000,
    });

    try {
      await redis.connect();
      await redis.ping();
      redisAvailable = true;
      console.log('✅ Redis connection successful');
    } catch (error) {
      console.warn('⚠️  Redis not available:', (error as Error).message);
      console.warn('💡 Start Redis: docker run -d -p 6379:6379 redis:7');
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (redis) await redis.quit();
  });

  beforeEach(async () => {
    if (!available || !redisAvailable) return;

    // Clean up Redis stream
    try {
      await redis.del(STREAM_NAME);
    } catch {
      // Ignore if stream doesn't exist
    }
  });

  describe('E2E Happy Path', () => {
    it.skipIf(!available || !redisAvailable)('fetches outbox rows, publishes to Redis, marks sent', async () => {
      const outbox = createOutboxRepository(pool);
      const dispatcher = createDispatcher({
        outbox,
        redis,
        stream: STREAM_NAME,
        batchSize: 10,
        maxAttempts: 3,
      });

      // Seed 5 outbox rows
      const messageIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const messageId = randomUUID();
        const eventId = randomUUID();
        const conversationId = randomUUID();

        await client.query(
          `INSERT INTO messaging.message_outbox 
           (event_id, message_id, event_type, aggregate_id, payload, status, attempts)
           VALUES ($1, $2, 'MessageCreated', $3, $4, 'pending', 0)`,
          [
            eventId,
            messageId,
            conversationId,
            JSON.stringify({
              v: 1,
              type: 'MessageCreated',
              messageId,
              conversationId,
              ciphertext: 'ZW5jcnlwdGVk',
              occurredAt: new Date().toISOString(),
            }),
          ]
        );
        messageIds.push(messageId);
      }

      // Run dispatcher tick
      await dispatcher.tick();

      // Assert Redis stream has 5 entries
      const streamLength = await redis.xlen(STREAM_NAME);
      expect(streamLength).toBe(5);

      // Assert all rows are marked sent
      const { rows } = await client.query(
        `SELECT message_id, status, dispatched_at 
         FROM messaging.message_outbox 
         WHERE message_id = ANY($1)`,
        [messageIds]
      );

      expect(rows).toHaveLength(5);
      for (const row of rows) {
        expect(row.status).toBe('sent');
        expect(row.dispatched_at).not.toBeNull();
      }

      // Assert Redis stream contains correct data
      const messages = await redis.xread('STREAMS', STREAM_NAME, '0');
      expect(messages).toBeDefined();
      const [, entries] = messages![0];
      expect(entries).toHaveLength(5);

      for (const [, fields] of entries) {
        const payload = JSON.parse(fields[5]); // fields are ['message_id', ..., 'payload', <json>]
        expect(payload).toHaveProperty('v', 1);
        expect(payload).toHaveProperty('type', 'MessageCreated');
        expect(payload).toHaveProperty('ciphertext', 'ZW5jcnlwdGVk');
      }
    });

    it.skipIf(!available || !redisAvailable)('handles empty outbox gracefully', async () => {
      const outbox = createOutboxRepository(pool);
      const dispatcher = createDispatcher({
        outbox,
        redis,
        stream: STREAM_NAME,
        batchSize: 10,
        maxAttempts: 3,
      });

      // Run tick on empty outbox
      await expect(dispatcher.tick()).resolves.not.toThrow();

      // Assert no entries in Redis
      const streamLength = await redis.xlen(STREAM_NAME);
      expect(streamLength).toBe(0);
    });
  });

  describe('Concurrent Picking (SKIP LOCKED)', () => {
    it.skipIf(!available || !redisAvailable)(
      'ensures no double-pick when multiple dispatchers run concurrently',
      async () => {
        const outbox = createOutboxRepository(pool);

        // Seed 20 outbox rows
        const messageIds: string[] = [];
        for (let i = 0; i < 20; i++) {
          const messageId = randomUUID();
          await client.query(
            `INSERT INTO messaging.message_outbox 
             (event_id, message_id, event_type, aggregate_id, payload, status, attempts)
             VALUES ($1, $2, 'MessageCreated', $3, $4, 'pending', 0)`,
            [randomUUID(), messageId, randomUUID(), JSON.stringify({ test: i })]
          );
          messageIds.push(messageId);
        }

        // Create 3 dispatcher instances
        const dispatchers = Array.from({ length: 3 }, () =>
          createDispatcher({
            outbox,
            redis,
            stream: STREAM_NAME,
            batchSize: 10,
            maxAttempts: 3,
          })
        );

        // Run all 3 concurrently
        await Promise.all(dispatchers.map((d) => d.tick()));

        // Assert exactly 20 entries in Redis (no duplicates)
        const streamLength = await redis.xlen(STREAM_NAME);
        expect(streamLength).toBe(20);

        // Assert all rows are sent exactly once
        const { rows } = await client.query(
          `SELECT message_id, status, attempts 
           FROM messaging.message_outbox 
           WHERE message_id = ANY($1)`,
          [messageIds]
        );

        expect(rows).toHaveLength(20);
        for (const row of rows) {
          expect(row.status).toBe('sent');
          expect(row.attempts).toBe(1); // Bumped exactly once
        }
      }
    );
  });

  describe('Retry → DLQ', () => {
    it.skipIf(!available || !redisAvailable)(
      'retries on Redis failure, then buries after maxAttempts',
      async () => {
        const outbox = createOutboxRepository(pool);

        // Seed 1 outbox row
        const messageId = randomUUID();
        await client.query(
          `INSERT INTO messaging.message_outbox 
           (event_id, message_id, event_type, aggregate_id, payload, status, attempts)
           VALUES ($1, $2, 'MessageCreated', $3, $4, 'pending', 0)`,
          [randomUUID(), messageId, randomUUID(), JSON.stringify({ test: true })]
        );

        // Create a bad Redis client (wrong host)
        const badRedis = new Redis({
          host: '127.0.0.1',
          port: 9999, // Invalid port
          lazyConnect: true,
          maxRetriesPerRequest: 0,
          connectTimeout: 100,
        });

        const dispatcher = createDispatcher({
          outbox,
          redis: badRedis,
          stream: STREAM_NAME,
          batchSize: 10,
          maxAttempts: 3,
          logger: { error: vi.fn(), warn: vi.fn() } as any,
        });

        // Run tick 3 times (exhaust retries)
        for (let i = 0; i < 3; i++) {
          await dispatcher.tick();
        }

        // Assert row is now 'dead'
        const { rows } = await client.query(
          `SELECT status, attempts, last_error 
           FROM messaging.message_outbox 
           WHERE message_id = $1`,
          [messageId]
        );

        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe('dead');
        expect(rows[0].attempts).toBe(3);
        expect(rows[0].last_error).toContain('max_attempts_exceeded');

        await badRedis.disconnect();
      }
    );
  });

  describe('Idempotency', () => {
    it.skipIf(!available || !redisAvailable)(
      'prevents duplicate publishes for same message_id',
      async () => {
        const outbox = createOutboxRepository(pool);
        const dispatcher = createDispatcher({
          outbox,
          redis,
          stream: STREAM_NAME,
          batchSize: 10,
          maxAttempts: 3,
        });

        const messageId = randomUUID();

        // Insert same message_id twice (simulates idempotent write)
        await client.query(
          `INSERT INTO messaging.message_outbox 
           (event_id, message_id, event_type, aggregate_id, payload, status, attempts)
           VALUES ($1, $2, 'MessageCreated', $3, $4, 'pending', 0)`,
          [randomUUID(), messageId, randomUUID(), JSON.stringify({ test: 1 })]
        );

        // Second insert should be blocked by unique index on message_id
        await expect(
          client.query(
            `INSERT INTO messaging.message_outbox 
             (event_id, message_id, event_type, aggregate_id, payload, status, attempts)
             VALUES ($1, $2, 'MessageCreated', $3, $4, 'pending', 0)`,
            [randomUUID(), messageId, randomUUID(), JSON.stringify({ test: 2 })]
          )
        ).rejects.toThrow(/unique constraint|duplicate key/);

        // Run dispatcher
        await dispatcher.tick();

        // Assert exactly 1 entry in Redis
        const streamLength = await redis.xlen(STREAM_NAME);
        expect(streamLength).toBe(1);

        // Assert exactly 1 row in DB
        const { rows } = await client.query(
          `SELECT COUNT(*) as count FROM messaging.message_outbox WHERE message_id = $1`,
          [messageId]
        );
        expect(Number(rows[0].count)).toBe(1);
      }
    );
  });

  describe('No-Leak Audit', () => {
    it.skipIf(!available || !redisAvailable)(
      'ensures no PII or plaintext in logs/metrics labels',
      async () => {
        const logSpy = vi.fn();
        const outbox = createOutboxRepository(pool);
        const dispatcher = createDispatcher({
          outbox,
          redis,
          stream: STREAM_NAME,
          batchSize: 10,
          maxAttempts: 3,
          logger: {
            error: logSpy,
            warn: logSpy,
            info: logSpy,
            debug: logSpy,
          } as any,
        });

        // Seed row with sensitive-looking data in payload
        const messageId = randomUUID();
        await client.query(
          `INSERT INTO messaging.message_outbox 
           (event_id, message_id, event_type, aggregate_id, payload, status, attempts)
           VALUES ($1, $2, 'MessageCreated', $3, $4, 'pending', 0)`,
          [
            randomUUID(),
            messageId,
            randomUUID(),
            JSON.stringify({
              email: 'user@example.com',
              plaintext: 'secret message',
              ciphertext: 'ZW5jcnlwdGVk',
            }),
          ]
        );

        await dispatcher.tick();

        // Assert logs don't contain forbidden fields
        const allLogs = logSpy.mock.calls.map((call) => JSON.stringify(call)).join(' ');
        expect(allLogs).not.toContain('user@example.com');
        expect(allLogs).not.toContain('secret message');
        expect(allLogs).not.toContain('plaintext');

        // Assert ciphertext is allowed (it's encrypted)
        // But the full payload should not be logged
        const logObjects = logSpy.mock.calls.map((call) => call[0]);
        for (const logObj of logObjects) {
          if (logObj && typeof logObj === 'object') {
            expect(logObj).not.toHaveProperty('payload');
            expect(logObj).not.toHaveProperty('ciphertext');
            expect(logObj).not.toHaveProperty('email');
          }
        }
      }
    );
  });
});

