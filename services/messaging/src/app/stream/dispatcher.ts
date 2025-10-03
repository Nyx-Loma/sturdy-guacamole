import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { OutboxRepository } from '../../repositories/outboxRepository';
import { messagingMetrics } from '../../observability/metrics';

export interface DispatcherOptions {
  outbox: OutboxRepository;
  redis: Redis;
  stream: string;
  maxLenApprox?: number;
  batchSize?: number;
  maxAttempts?: number;
  logger?: FastifyBaseLogger;
}

export interface Dispatcher {
  tick(): Promise<void>;
}

export const createDispatcher = (opts: DispatcherOptions): Dispatcher => {
  const maxLen = opts.maxLenApprox ?? 1_000_000;
  const batchSize = opts.batchSize ?? 256;
  const maxAttempts = opts.maxAttempts ?? 10;
  const log = opts.logger ?? console;

  return {
    async tick() {
      const startTime = Date.now();
      try {
        const batch = await opts.outbox.fetchBatch(batchSize);
        
        if (!batch.length) {
          messagingMetrics.dispatchTicksTotal.labels({ result: 'empty' }).inc();
          return;
        }

        messagingMetrics.outboxPickedTotal.inc(batch.length);

        const successes: string[] = [];
        const softFails: Array<{ id: string; err: string; attempts: number }> = [];

        for (const row of batch) {
          try {
            await opts.redis.xadd(
              opts.stream,
              'MAXLEN',
              '~',
              String(maxLen),
              '*',
              'message_id',
              String(row.message_id),
              'conversation_id',
              String(row.conversation_id),
              'payload',
              JSON.stringify(row.payload)
            );
            successes.push(String(row.id));
            messagingMetrics.dispatchPublishedTotal.inc();
          } catch (e: unknown) {
            const err = e as Error;
            softFails.push({
              id: String(row.id),
              err: err?.message ?? 'redis_error',
              attempts: row.attempts,
            });
            log.error(
              {
                err,
                outboxId: row.id,
                messageId: row.message_id,
                conversationId: row.conversation_id,
                attempts: row.attempts,
              },
              'redis_publish_failed'
            );
          }
        }

        if (successes.length) {
          await opts.outbox.markSent(successes);
          messagingMetrics.outboxSentTotal.inc(successes.length);
        }

        if (softFails.length) {
          const toBury = softFails.filter((f) => f.attempts >= maxAttempts).map((f) => f.id);
          const toRetry = softFails.filter((f) => f.attempts < maxAttempts);

          if (toRetry.length) {
            await opts.outbox.markFailed(
              toRetry.map((f) => f.id),
              'redis_publish_failed'
            );
            messagingMetrics.outboxFailedTotal.inc(toRetry.length);
          }

          if (toBury.length) {
            await opts.outbox.bury(toBury, 'max_attempts_exceeded');
            messagingMetrics.outboxDeadTotal.inc(toBury.length);
            messagingMetrics.dispatchDlqTotal.labels({ sink: 'postgres' }).inc(toBury.length);
            
            log.warn(
              { outboxIds: toBury, maxAttempts },
              'outbox_rows_buried_after_max_attempts'
            );
          }
        }

        messagingMetrics.dispatchTicksTotal.labels({ result: 'ok' }).inc();
      } catch (error) {
        messagingMetrics.dispatchTicksTotal.labels({ result: 'error' }).inc();
        log.error({ err: error }, 'dispatcher_tick_error');
        throw error;
      } finally {
        const durationSeconds = (Date.now() - startTime) / 1000;
        messagingMetrics.dispatchTickDurationSeconds.observe(durationSeconds);
      }
    },
  };
};
