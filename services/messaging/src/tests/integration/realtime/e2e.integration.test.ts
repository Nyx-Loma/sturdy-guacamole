import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { setupDatabaseTests } from '../helpers/setupDatabase';
import { createOutboxRepository } from '../../../repositories/outboxRepository';
import { createDispatcher } from '../../../app/stream/dispatcher';
import { createConsumer } from '../../../app/stream/consumer';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const STREAM_NAME = `test:e2e:${Date.now()}`;

describe('E2E Realtime Pipeline Integration Tests', () => {
  if (!process.env.DATABASE_URL) {
    it.skip('skipped: DATABASE_URL not configured');
    return;
  }

  const { client, available } = setupDatabaseTests(process.env.DATABASE_URL, {
    truncateTables: ['messaging.message_outbox', 'messaging.messages', 'messaging.conversations'],
    requireSchema: true,
  });

  let pool: Pool;
  let redis: Redis;
  let redisAvailable = false;

  beforeAll(async () => {
    if (!available) return;

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      application_name: 'integration-test-e2e',
    });

    redis = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      connectTimeout: 3000,
    });

    try {
      await redis.connect();
      await redis.ping();
      redisAvailable = true;
      console.log('✅ Redis connection successful for E2E tests');
    } catch (error) {
      console.warn('⚠️  Redis not available:', (error as Error).message);
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
      
      // Delete consumer group if exists
      try {
        await redis.xgroup('DESTROY', STREAM_NAME, 'test-hub');
      } catch {
        // Ignore if group doesn't exist
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Full Pipeline: HTTP → Outbox → Dispatcher → Redis → Consumer → WebSocket', () => {
    it.skipIf(!available || !redisAvailable)(
      'delivers message end-to-end with correct ordering',
      async () => {
        // Setup: Create conversation
        const conversationId = randomUUID();
        await client.query(
          `INSERT INTO messaging.conversations (id, type, created_at, updated_at, last_seq)
           VALUES ($1, 'direct', NOW(), NOW(), 0)`,
          [conversationId]
        );

        // Mock WebSocketHub
        const broadcastedMessages: any[] = [];
        const mockHub = {
          broadcast: vi.fn((message) => {
            broadcastedMessages.push(message);
          }),
          size: () => 0,
        };

        // Create pipeline components
        const outbox = createOutboxRepository(pool);
        const dispatcher = createDispatcher({
          outbox,
          redis,
          stream: STREAM_NAME,
          batchSize: 10,
          maxAttempts: 3,
        });

        const consumer = createConsumer({
          redis,
          hub: mockHub as any,
          stream: STREAM_NAME,
          group: 'test-hub',
          consumerName: 'test-consumer-1',
          batchSize: 10,
          blockMs: 500,
        });

        // Start consumer
        await consumer.start();

        // Step 1: Simulate 3 messages being written to outbox (simulating HTTP writes)
        const messages = [];
        for (let i = 1; i <= 3; i++) {
          const messageId = randomUUID();
          const eventId = randomUUID();

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
                seq: i,
                ciphertext: `encrypted_message_${i}`,
                occurredAt: new Date().toISOString(),
              }),
            ]
          );

          messages.push({ messageId, seq: i });
        }

        // Step 2: Run dispatcher to publish to Redis Stream
        await dispatcher.tick();

        // Assert: All 3 messages published to Redis
        const streamLength = await redis.xlen(STREAM_NAME);
        expect(streamLength).toBe(3);

        // Assert: All outbox rows marked 'sent'
        const { rows: outboxRows } = await client.query(
          `SELECT status, dispatched_at FROM messaging.message_outbox WHERE aggregate_id = $1`,
          [conversationId]
        );
        expect(outboxRows).toHaveLength(3);
        for (const row of outboxRows) {
          expect(row.status).toBe('sent');
          expect(row.dispatched_at).not.toBeNull();
        }

        // Step 3: Wait for consumer to process (with timeout)
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 2s should be enough for consumer to process

        // Assert: Consumer delivered all 3 messages to WebSocketHub
        expect(broadcastedMessages).toHaveLength(3);

        // Assert: Messages delivered in correct order (by seq)
        for (let i = 0; i < 3; i++) {
          const broadcasted = broadcastedMessages[i];
          expect(broadcasted.type).toBe('msg');
          expect(broadcasted.payload.data.conversationId).toBe(conversationId);
          expect(broadcasted.payload.data.ciphertext).toBe(`encrypted_message_${i + 1}`);
          expect(broadcasted.payload.seq).toBe(i + 1);
        }

        // Assert: Messages ACK'd to Redis
        const pendingInfo = await redis.xpending(STREAM_NAME, 'test-hub');
        expect(pendingInfo[0]).toBe(0); // No pending messages (all ACK'd)

        // Cleanup
        await consumer.stop();
      },
      { timeout: 10000 } // 10s timeout for full E2E test
    );

    it.skipIf(!available || !redisAvailable)(
      'handles idempotency: duplicate message_id not re-delivered',
      async () => {
        const conversationId = randomUUID();
        await client.query(
          `INSERT INTO messaging.conversations (id, type, created_at, updated_at, last_seq)
           VALUES ($1, 'direct', NOW(), NOW(), 0)`,
          [conversationId]
        );

        const broadcastedMessages: any[] = [];
        const mockHub = {
          broadcast: vi.fn((message) => {
            broadcastedMessages.push(message);
          }),
          size: () => 0,
        };

        const outbox = createOutboxRepository(pool);
        const dispatcher = createDispatcher({
          outbox,
          redis,
          stream: STREAM_NAME,
          batchSize: 10,
          maxAttempts: 3,
        });

        const consumer = createConsumer({
          redis,
          hub: mockHub as any,
          stream: STREAM_NAME,
          group: 'test-hub',
          consumerName: 'test-consumer-1',
          batchSize: 10,
          blockMs: 500,
        });

        await consumer.start();

        // Insert same message twice (same message_id)
        const messageId = randomUUID();
        const eventId1 = randomUUID();
        const eventId2 = randomUUID();

        await client.query(
          `INSERT INTO messaging.message_outbox 
           (event_id, message_id, event_type, aggregate_id, payload, status, attempts)
           VALUES ($1, $2, 'MessageCreated', $3, $4, 'pending', 0)`,
          [
            eventId1,
            messageId,
            conversationId,
            JSON.stringify({
              v: 1,
              type: 'MessageCreated',
              messageId,
              conversationId,
              seq: 1,
              ciphertext: 'encrypted_1',
              occurredAt: new Date().toISOString(),
            }),
          ]
        );

        // Second insert with same message_id should fail due to unique constraint
        await expect(
          client.query(
            `INSERT INTO messaging.message_outbox 
             (event_id, message_id, event_type, aggregate_id, payload, status, attempts)
             VALUES ($1, $2, 'MessageCreated', $3, $4, 'pending', 0)`,
            [
              eventId2,
              messageId,
              conversationId,
              JSON.stringify({
                v: 1,
                type: 'MessageCreated',
                messageId,
                conversationId,
                seq: 2,
                ciphertext: 'encrypted_2',
                occurredAt: new Date().toISOString(),
              }),
            ]
          )
        ).rejects.toThrow(/unique constraint|duplicate key/);

        // Run dispatcher
        await dispatcher.tick();

        // Wait for consumer
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Assert: Only 1 message delivered (no duplicate)
        expect(broadcastedMessages).toHaveLength(1);
        expect(broadcastedMessages[0].payload.data.messageId).toBe(messageId);

        await consumer.stop();
      },
      { timeout: 10000 }
    );

    it.skipIf(!available || !redisAvailable)(
      'maintains order across multiple conversations',
      async () => {
        const conversationA = randomUUID();
        const conversationB = randomUUID();

        await client.query(
          `INSERT INTO messaging.conversations (id, type, created_at, updated_at, last_seq)
           VALUES ($1, 'direct', NOW(), NOW(), 0), ($2, 'group', NOW(), NOW(), 0)`,
          [conversationA, conversationB]
        );

        const broadcastedMessages: any[] = [];
        const mockHub = {
          broadcast: vi.fn((message) => {
            broadcastedMessages.push(message);
          }),
          size: () => 0,
        };

        const outbox = createOutboxRepository(pool);
        const dispatcher = createDispatcher({
          outbox,
          redis,
          stream: STREAM_NAME,
          batchSize: 10,
          maxAttempts: 3,
        });

        const consumer = createConsumer({
          redis,
          hub: mockHub as any,
          stream: STREAM_NAME,
          group: 'test-hub',
          consumerName: 'test-consumer-1',
          batchSize: 10,
          blockMs: 500,
        });

        await consumer.start();

        // Insert interleaved messages: A1, B1, A2, B2
        const messages = [
          { conv: conversationA, seq: 1, cipher: 'A1' },
          { conv: conversationB, seq: 1, cipher: 'B1' },
          { conv: conversationA, seq: 2, cipher: 'A2' },
          { conv: conversationB, seq: 2, cipher: 'B2' },
        ];

        for (const msg of messages) {
          await client.query(
            `INSERT INTO messaging.message_outbox 
             (event_id, message_id, event_type, aggregate_id, payload, status, attempts)
             VALUES ($1, $2, 'MessageCreated', $3, $4, 'pending', 0)`,
            [
              randomUUID(),
              randomUUID(),
              msg.conv,
              JSON.stringify({
                v: 1,
                type: 'MessageCreated',
                messageId: randomUUID(),
                conversationId: msg.conv,
                seq: msg.seq,
                ciphertext: msg.cipher,
                occurredAt: new Date().toISOString(),
              }),
            ]
          );
        }

        await dispatcher.tick();
        await new Promise((resolve) => setTimeout(resolve, 2000));

        expect(broadcastedMessages).toHaveLength(4);

        // Assert: Conversation A messages in order
        const convAMessages = broadcastedMessages.filter(
          (m) => m.payload.data.conversationId === conversationA
        );
        expect(convAMessages).toHaveLength(2);
        expect(convAMessages[0].payload.data.ciphertext).toBe('A1');
        expect(convAMessages[1].payload.data.ciphertext).toBe('A2');

        // Assert: Conversation B messages in order
        const convBMessages = broadcastedMessages.filter(
          (m) => m.payload.data.conversationId === conversationB
        );
        expect(convBMessages).toHaveLength(2);
        expect(convBMessages[0].payload.data.ciphertext).toBe('B1');
        expect(convBMessages[1].payload.data.ciphertext).toBe('B2');

        await consumer.stop();
      },
      { timeout: 10000 }
    );
  });
});

