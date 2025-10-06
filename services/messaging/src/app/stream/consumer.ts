import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { WebSocketHub } from '@sanctum/transport';
import { randomUUID } from 'node:crypto';
import type { MessagingMetrics } from '../../observability/metrics';
import { BoundedQueue } from '../../ws/backpressure';
import { createCircuitBreaker } from '../../infra/circuitbreakers';

export interface StreamEvent {
  v: number;
  type: string;
  eventId: string;
  messageId: string;
  conversationId: string;
  seq?: number;
  ciphertext: string;
  metadata?: unknown;
  contentSize?: number;
  contentMimeType?: string;
  occurredAt: string;
  dedupeKey?: string;
}

export interface ConsumerOptions {
  redis: Redis;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pgPool: any; // Pool from 'pg'
  hub: WebSocketHub;
  stream: string;
  group: string;
  consumerName: string;
  metrics: MessagingMetrics;
  batchSize?: number;
  blockMs?: number;
  maxRetries?: number;
  pelHygieneIntervalMs?: number;
  logger?: FastifyBaseLogger;
}

interface PendingMessage {
  redisId: string;
  event: StreamEvent;
}

export interface Consumer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export const createConsumer = (opts: ConsumerOptions): Consumer => {
  const batchSize = opts.batchSize ?? 128;
  const blockMs = opts.blockMs ?? 1000;
  const pelHygieneIntervalMs = opts.pelHygieneIntervalMs ?? 30000; // 30s default
  const log = opts.logger ?? console;

  let running = false;
  let pelHygieneTimer: NodeJS.Timeout | null = null;
  const seenMessageIds = new Set<string>(); // Idempotency dedupe
  const conversationBuffers = new Map<string, PendingMessage[]>(); // Per-conversation ordering

  const ensureGroup = async () => {
    try {
      await opts.redis.xgroup(
        'CREATE',
        opts.stream,
        opts.group,
        '0',
        'MKSTREAM'
      );
      log.info({ stream: opts.stream, group: opts.group }, 'consumer_group_created');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error?.message?.includes('BUSYGROUP')) {
        log.debug('consumer_group_already_exists');
      } else {
        throw error;
      }
    }
  };

  // Breaker for DLQ writes to Postgres
  const dlqBreaker = createCircuitBreaker(
    'pg_dlq_insert',
    async (query: string, params: unknown[]) => opts.pgPool.query(query, params),
    { timeoutMs: 2000, failureThreshold: 3, halfOpenAfterMs: 5000 },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      breakerOpened: { inc: (labels) => opts.metrics.breakerOpened.inc(labels as any) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      breakerHalfOpen: { inc: (labels) => opts.metrics.breakerHalfOpen.inc(labels as any) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      breakerClosed: { inc: (labels) => opts.metrics.breakerClosed.inc(labels as any) },
    }
  );

  const parseEvent = (fields: string[]): StreamEvent | null => {
    try {
      // Redis XREADGROUP returns: ['message_id', <uuid>, 'conversation_id', <uuid>, 'payload', <json>]
      const payload = fields[5]; // Assuming 'payload' is at index 5
      const event = JSON.parse(payload);
      
      // Schema validation: check required fields
      if (!event.messageId || typeof event.messageId !== 'string') {
        log.warn({ event }, 'parse_error_missing_messageId');
        return null;
      }
      if (!event.conversationId || typeof event.conversationId !== 'string') {
        log.warn({ event }, 'parse_error_missing_conversationId');
        return null;
      }
      if (!event.ciphertext || typeof event.ciphertext !== 'string') {
        log.warn({ event }, 'parse_error_missing_ciphertext');
        return null;
      }
      if (event.seq !== undefined && typeof event.seq !== 'number') {
        log.warn({ event }, 'parse_error_invalid_seq');
        return null;
      }
      
      return event;
    } catch (error) {
      log.warn({ err: error, fields }, 'parse_error_invalid_json');
      return null;
    }
  };

  const extractPartialEvent = (fields: string[], redisId: string): Partial<StreamEvent> => {
    try {
      const payload = fields[5];
      const parsed = JSON.parse(payload);
      return {
        messageId: parsed.messageId || `parse_error_${redisId}`,
        conversationId: parsed.conversationId || `parse_error_${redisId}`,
        eventId: parsed.eventId || `parse_error_${redisId}`,
        type: parsed.type || 'unknown',
        occurredAt: parsed.occurredAt || new Date().toISOString(),
        v: parsed.v || 1,
      };
    } catch {
      // Even JSON.parse failed - use fallback
      return {
        messageId: `json_parse_error_${redisId}`,
        conversationId: `json_parse_error_${redisId}`,
        eventId: `json_parse_error_${redisId}`,
        type: 'unknown',
        occurredAt: new Date().toISOString(),
        v: 1,
      };
    }
  };

  // Simple backpressure buffer per conversation to smooth bursts
  const convoQueues = new Map<string, BoundedQueue<StreamEvent>>();

  const getQueue = (conversationId: string) => {
    let q = convoQueues.get(conversationId);
    if (!q) {
      q = new BoundedQueue<StreamEvent>({
        maxQueue: 100,
        dropPolicy: 'drop_old',
        metrics: {
          wsQueueDepth: { set: (v: number) => opts.metrics.wsQueueDepth.set(v) },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          wsDroppedTotal: { inc: (labels?: Record<string, unknown>) => opts.metrics.wsDroppedTotal.inc(labels as any) },
        },
      });
      convoQueues.set(conversationId, q);
    }
    return q;
  };

  const broadcastEvent = async (event: StreamEvent) => {
    // Idempotency check
    if (seenMessageIds.has(event.messageId)) {
      opts.metrics.consumerDedupeSkipsTotal.inc();
      log.debug({ messageId: event.messageId }, 'duplicate_message_skipped');
      return;
    }

    try {
      // Build WebSocket envelope
      const envelope = {
        v: 1 as const,
        id: randomUUID(),
        type: 'msg' as const,
        size: Buffer.byteLength(JSON.stringify({
          messageId: event.messageId,
          conversationId: event.conversationId,
          seq: event.seq,
          ciphertext: event.ciphertext,
          metadata: event.metadata,
          contentSize: event.contentSize,
          contentMimeType: event.contentMimeType,
          occurredAt: event.occurredAt,
        })),
        payload: {
          seq: event.seq ?? 0,
          data: {
            messageId: event.messageId,
            conversationId: event.conversationId,
            ciphertext: event.ciphertext,
            metadata: event.metadata,
            contentSize: event.contentSize,
            contentMimeType: event.contentMimeType,
            occurredAt: event.occurredAt,
          },
        },
      };

      // Backpressure-aware send
      const q = getQueue(event.conversationId);
      const accepted = q.push(event);
      if (!accepted) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        opts.metrics.wsDroppedTotal.inc({ reason: 'new' } as any);
      }
      q.drain(() => {
        opts.hub.broadcast(envelope);
        // Return true to keep draining
        return true;
      });
      seenMessageIds.add(event.messageId);
      opts.metrics.consumerDeliveredTotal.inc();
      
      log.info({
        messageId: event.messageId,
        conversationId: event.conversationId,
        seq: event.seq,
      }, 'message_broadcasted');
    } catch (error) {
      log.error({ err: error, messageId: event.messageId }, 'broadcast_failed');
      throw error;
    }
  };

  const writeToDLQ = async (pending: PendingMessage, reason: string): Promise<void> => {
    try {
      await dlqBreaker(`
        INSERT INTO messaging.message_dlq (
          source_stream, group_name, event_id, aggregate_id, 
          occurred_at, payload, reason, attempts
        ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, 1)
        ON CONFLICT (event_id) DO UPDATE SET
          attempts = message_dlq.attempts + 1,
          last_seen_at = NOW()
      `, [
        opts.stream,
        opts.group,
        pending.event.messageId,
        pending.event.conversationId,
        JSON.stringify(pending.event),
        reason
      ]);
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (messagingMetrics as any).dlqWrittenTotal?.labels({ reason }).inc();
      log.info({ 
        messageId: pending.event.messageId,
        redisId: pending.redisId,
        reason
      }, 'message_moved_to_dlq');
      
    } catch (error) {
      // CRITICAL: DLQ write failure must NOT block ACK
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (messagingMetrics as any).dlqWriteFailuresTotal?.inc();
      log.error({ err: error, redisId: pending.redisId, reason }, 'dlq_write_failed');
      // Swallow error - we'll still ACK the poison message
    }
  };

  const isPermanentError = (error: unknown): boolean => {
    if (!(error instanceof Error)) return false;
    
    const message = error.message.toLowerCase();
    return (
      message.includes('missing required fields') ||
      message.includes('invalid payload') ||
      message.includes('parse') ||
      message.includes('validation')
    );
  };

  const processBuffer = async (conversationId: string) => {
    const buffer = conversationBuffers.get(conversationId);
    if (!buffer || buffer.length === 0) return;

    // Sort by seq (if present) to preserve order
    buffer.sort((a, b) => (a.event.seq ?? 0) - (b.event.seq ?? 0));

    const acked: string[] = [];

    for (const pending of buffer) {
      try {
        await broadcastEvent(pending.event);
        acked.push(pending.redisId);
      } catch (error) {
        // Distinguish permanent vs transient errors
        if (isPermanentError(error)) {
          // Permanent error: parse/validation failure
          log.error({
            err: error,
            messageId: pending.event.messageId,
            conversationId,
            action: 'acking_poison_message'
          }, 'permanent_broadcast_failure_moved_to_dlq');
          
          // Write to DLQ (swallows errors internally)
          await writeToDLQ(pending, 'permanent_error');
          
          // ACK to unblock the stream
          acked.push(pending.redisId);
          opts.metrics.consumerFailuresTotal.labels({ reason: 'permanent_error' }).inc();
          
          // Continue processing next message
          continue;
        } else {
          // Transient error: hub down, redis timeout, etc.
          log.warn({
            err: error,
            messageId: pending.event.messageId,
            conversationId,
          }, 'transient_broadcast_failure_will_retry');
          opts.metrics.consumerFailuresTotal.labels({ reason: 'transient_error' }).inc();
          
          // Don't ACK - leave in PEL for retry
          break;
        }
      }
    }

    // ACK successfully broadcasted messages + poison messages
    if (acked.length > 0) {
      try {
        await opts.redis.xack(opts.stream, opts.group, ...acked);
        opts.metrics.consumerAckTotal.inc(acked.length);
        log.info({ count: acked.length, conversationId }, 'messages_acked');
      } catch (error) {
        log.error({ err: error, ids: acked }, 'xack_failed');
      }

      // Remove acked messages from buffer
      conversationBuffers.set(
        conversationId,
        buffer.filter((p) => !acked.includes(p.redisId))
      );
    }
    
    // Update buffer size metric
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (messagingMetrics as any).consumerReorderBufferSize?.set(buffer.length - acked.length);
  };

  const pelHygieneLoop = async () => {
    while (running) {
      try {
        await new Promise((resolve) => setTimeout(resolve, pelHygieneIntervalMs));
        
        if (!running) break;
        
        // XAUTOCLAIM: reclaim messages idle >30s from dead consumers
        const result: unknown = await opts.redis.xautoclaim(
          opts.stream,
          opts.group,
          opts.consumerName,
          30000, // min-idle-time: 30s
          '0-0', // start
          'COUNT',
          100    // batch
        );
        
        if (result && Array.isArray(result) && result[1] && Array.isArray(result[1])) {
          const claimedCount = result[1].length;
          log.info({ count: claimedCount }, 'pel_hygiene_claimed_stale_messages');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (messagingMetrics as any).consumerPelReclaimedTotal?.inc(claimedCount);
        }
        
        // Update PEL size metric
        const pelInfo: unknown = await opts.redis.xpending(opts.stream, opts.group, '-', '+', 1);
        if (pelInfo && Array.isArray(pelInfo) && pelInfo.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (messagingMetrics as any).consumerPelSize?.set(pelInfo.length);
        }
        
      } catch (error) {
        log.error({ err: error }, 'pel_hygiene_error');
      }
    }
  };

  const readLoop = async () => {
    while (running) {
      try {
        const results = await opts.redis.xreadgroup(
          'GROUP',
          opts.group,
          opts.consumerName,
          'COUNT',
          batchSize,
          'BLOCK',
          blockMs,
          'STREAMS',
          opts.stream,
          '>'
        );

        if (!results || results.length === 0) {
          // No new messages, continue loop
          continue;
        }

        const [, entries] = results[0] as [string, [string, string[]][]];

        for (const [redisId, fields] of entries) {
          const event = parseEvent(fields);
          if (!event) {
            opts.metrics.consumerFailuresTotal.labels({ reason: 'parse_error' }).inc();
            // ACK malformed messages to avoid blocking the stream
            // Extract whatever IDs we can for DLQ, even if validation failed
            const partialEvent = extractPartialEvent(fields, redisId);
            await writeToDLQ({ redisId, event: partialEvent as StreamEvent }, 'parse_error');
            await opts.redis.xack(opts.stream, opts.group, redisId);
            continue;
          }

          // Add to per-conversation buffer
          const buffer = conversationBuffers.get(event.conversationId) ?? [];
          buffer.push({ redisId, event });
          conversationBuffers.set(event.conversationId, buffer);
          
          opts.metrics.consumerFetchTotal.labels({ status: 'ok' }).inc();
        }

        // Process all conversation buffers
        const conversationIds = new Set(
          entries.map(([, fields]: [string, string[]]) => parseEvent(fields)?.conversationId).filter(Boolean) as string[]
        );

        for (const conversationId of conversationIds) {
          await processBuffer(conversationId);
        }

      } catch (error) {
        opts.metrics.consumerFetchTotal.labels({ status: 'err' }).inc();
        log.error({ err: error }, 'consumer_read_loop_error');
        
        // Backoff on error
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  };

  return {
    async start() {
      if (running) {
        log.warn('consumer_already_running');
        return;
      }

      await ensureGroup();
      running = true;
      
      // Start both loops
      void readLoop();
      void pelHygieneLoop();
      
      log.info({
        stream: opts.stream,
        group: opts.group,
        consumer: opts.consumerName,
        batchSize,
        pelHygieneIntervalMs,
      }, 'consumer_started');
    },

    async stop() {
      if (!running) return;
      running = false;
      
      // Stop PEL hygiene timer if exists
      if (pelHygieneTimer) {
        clearInterval(pelHygieneTimer);
        pelHygieneTimer = null;
      }
      
      // Drain buffers before stopping
      for (const [conversationId] of conversationBuffers) {
        await processBuffer(conversationId);
      }

      log.info('consumer_stopped');
    },
  };
};

