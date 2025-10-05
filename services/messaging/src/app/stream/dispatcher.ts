import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { OutboxRepository } from '../../repositories/outboxRepository';
import { messagingMetrics } from '../../observability/metrics';
import { createCircuitBreaker } from '../../infra/circuitbreakers';

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

        // Wrap Redis publish with a breaker (per tick instance)
        const publishWithBreaker = createCircuitBreaker(
          'redis_xadd',
          async (payload: string, messageId: string, conversationId: string) => {
            await opts.redis.xadd(
              opts.stream,
              'MAXLEN',
              '~',
              String(maxLen),
              '*',
              'message_id',
              messageId,
              'conversation_id',
              conversationId,
              'payload',
              payload
            );
          },
          { timeoutMs: 1500, failureThreshold: 3, halfOpenAfterMs: 5000 },
          {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            breakerOpened: { inc: (labels) => messagingMetrics.breakerOpened.inc(labels as any) },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            breakerHalfOpen: { inc: (labels) => messagingMetrics.breakerHalfOpen.inc(labels as any) },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            breakerClosed: { inc: (labels) => messagingMetrics.breakerClosed.inc(labels as any) },
          }
        );

        for (const row of batch) {
          try {
            await publishWithBreaker(
              JSON.stringify(row.payload),
              String(row.message_id),
              String(row.conversation_id)
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
          // Wrap DB updates with a breaker
          const markSentWithBreaker = createCircuitBreaker(
            'pg_mark_sent',
            async (ids: string[]) => opts.outbox.markSent(ids),
            { timeoutMs: 2000, failureThreshold: 3, halfOpenAfterMs: 5000 },
            {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              breakerOpened: { inc: (labels) => messagingMetrics.breakerOpened.inc(labels as any) },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              breakerHalfOpen: { inc: (labels) => messagingMetrics.breakerHalfOpen.inc(labels as any) },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              breakerClosed: { inc: (labels) => messagingMetrics.breakerClosed.inc(labels as any) },
            }
          );
          await markSentWithBreaker(successes);
          messagingMetrics.outboxSentTotal.inc(successes.length);
        }

        if (softFails.length) {
          const toBury = softFails.filter((f) => f.attempts >= maxAttempts).map((f) => f.id);
          const toRetry = softFails.filter((f) => f.attempts < maxAttempts);

          if (toRetry.length) {
            const markFailedWithBreaker = createCircuitBreaker(
              'pg_mark_failed',
              async (ids: string[], reason: string) => opts.outbox.markFailed(ids, reason),
              { timeoutMs: 2000, failureThreshold: 3, halfOpenAfterMs: 5000 },
              {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                breakerOpened: { inc: (labels) => messagingMetrics.breakerOpened.inc(labels as any) },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                breakerHalfOpen: { inc: (labels) => messagingMetrics.breakerHalfOpen.inc(labels as any) },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                breakerClosed: { inc: (labels) => messagingMetrics.breakerClosed.inc(labels as any) },
              }
            );
            await markFailedWithBreaker(
              toRetry.map((f) => f.id),
              'redis_publish_failed'
            );
            messagingMetrics.outboxFailedTotal.inc(toRetry.length);
          }

          if (toBury.length) {
            const buryWithBreaker = createCircuitBreaker(
              'pg_bury',
              async (ids: string[], reason: string) => opts.outbox.bury(ids, reason),
              { timeoutMs: 2000, failureThreshold: 3, halfOpenAfterMs: 5000 },
              {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                breakerOpened: { inc: (labels) => messagingMetrics.breakerOpened.inc(labels as any) },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                breakerHalfOpen: { inc: (labels) => messagingMetrics.breakerHalfOpen.inc(labels as any) },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                breakerClosed: { inc: (labels) => messagingMetrics.breakerClosed.inc(labels as any) },
              }
            );
            await buryWithBreaker(toBury, 'max_attempts_exceeded');
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
