import { Counter, Histogram, Gauge, Registry, collectDefaultMetrics } from 'prom-client';

export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry, prefix: 'messaging_' });

const requestCounter = new Counter({
  name: 'messaging_http_requests_total',
  help: 'Total HTTP requests received',
  labelNames: ['route', 'method', 'statusCode']
});

const requestDurationMs = new Histogram({
  name: 'messaging_http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  buckets: [5, 10, 25, 50, 100, 250, 500, 750, 1_000, 1_500, 2_000, 5_000],
  labelNames: ['route', 'method', 'statusCode']
});

const payloadRejects = new Counter({
  name: 'messaging_payload_rejects_total',
  help: 'Payload validation rejections',
  labelNames: ['reason']
});

const idempotencyHits = new Counter({
  name: 'messaging_idempotency_hits_total',
  help: 'Idempotent replay detections'
});

const markReadUpdates = new Counter({
  name: 'messaging_mark_read_updates_total',
  help: 'Number of messages marked as read'
});

const messageSizeBytes = new Histogram({
  name: 'messaging_message_payload_bytes',
  help: 'Raw encrypted payload size',
  buckets: [512, 1_024, 2_048, 4_096, 8_192, 16_384, 32_768, 65_536]
});

const dispatchFetchTotal = new Counter({
  name: 'messaging_dispatch_fetch_total',
  help: 'Outbox fetch attempts',
  labelNames: ['status']
});

const dispatchPublishedTotal = new Counter({
  name: 'messaging_dispatch_published_total',
  help: 'Outbox events published to Redis'
});

const dispatchLagSeconds = new Histogram({
  name: 'messaging_dispatch_lag_seconds',
  help: 'Age of oldest undispatched/acked event in seconds',
  buckets: [1, 2, 5, 10, 30, 60, 120, 300]
});

const dispatchShardsPaused = new Gauge({
  name: 'messaging_dispatch_shard_paused',
  help: 'Shard backpressure indicator',
  labelNames: ['shard']
});

const dispatchDlqTotal = new Counter({
  name: 'messaging_dispatch_dlq_total',
  help: 'DLQ events recorded',
  labelNames: ['sink']
});

const dispatchTicksTotal = new Counter({
  name: 'messaging_dispatch_ticks_total',
  help: 'Total dispatcher tick invocations',
  labelNames: ['result']
});

const dispatchTickDurationSeconds = new Histogram({
  name: 'messaging_dispatch_tick_duration_seconds',
  help: 'Dispatcher tick duration in seconds',
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});

const outboxPickedTotal = new Counter({
  name: 'messaging_outbox_picked_total',
  help: 'Outbox rows picked for dispatch'
});

const outboxSentTotal = new Counter({
  name: 'messaging_outbox_sent_total',
  help: 'Outbox rows successfully sent'
});

const outboxFailedTotal = new Counter({
  name: 'messaging_outbox_failed_total',
  help: 'Outbox rows failed (will retry)'
});

const outboxDeadTotal = new Counter({
  name: 'messaging_outbox_dead_total',
  help: 'Outbox rows moved to DLQ (max attempts exceeded)'
});

const consumerFetchTotal = new Counter({
  name: 'messaging_consumer_fetch_total',
  help: 'Consumer stream fetch attempts',
  labelNames: ['status']
});

const consumerDeliveredTotal = new Counter({
  name: 'messaging_consumer_delivered_total',
  help: 'Messages successfully delivered to WebSocket clients'
});

const consumerAckTotal = new Counter({
  name: 'messaging_consumer_ack_total',
  help: 'Messages acknowledged to Redis Stream'
});

const consumerFailuresTotal = new Counter({
  name: 'messaging_consumer_failures_total',
  help: 'Consumer failures',
  labelNames: ['reason']
});

const consumerDedupeSkipsTotal = new Counter({
  name: 'messaging_consumer_dedupe_skips_total',
  help: 'Duplicate messages skipped by consumer'
});

const consumerLagSeconds = new Histogram({
  name: 'messaging_consumer_lag_seconds',
  help: 'Consumer lag (time between publish and delivery)',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
});

const dlqWrittenTotal = new Counter({
  name: 'messaging_dlq_written_total',
  help: 'Messages written to DLQ',
  labelNames: ['reason']
});

const dlqWriteFailuresTotal = new Counter({
  name: 'messaging_dlq_write_failures_total',
  help: 'DLQ write failures'
});

const consumerPelSize = new Gauge({
  name: 'messaging_consumer_pel_size',
  help: 'Consumer Pending Entry List size (unacked messages)'
});

const consumerReorderBufferSize = new Gauge({
  name: 'messaging_consumer_reorder_buffer_size',
  help: 'Consumer per-conversation reorder buffer size'
});

const consumerPelReclaimedTotal = new Counter({
  name: 'messaging_consumer_pel_reclaimed_total',
  help: 'Messages reclaimed from stale consumers via XAUTOCLAIM'
});

metricsRegistry.registerMetric(requestCounter);
metricsRegistry.registerMetric(requestDurationMs);
metricsRegistry.registerMetric(payloadRejects);
metricsRegistry.registerMetric(idempotencyHits);
metricsRegistry.registerMetric(markReadUpdates);
metricsRegistry.registerMetric(messageSizeBytes);
metricsRegistry.registerMetric(dispatchFetchTotal);
metricsRegistry.registerMetric(dispatchPublishedTotal);
metricsRegistry.registerMetric(dispatchLagSeconds);
metricsRegistry.registerMetric(dispatchShardsPaused);
metricsRegistry.registerMetric(dispatchDlqTotal);
metricsRegistry.registerMetric(dispatchTicksTotal);
metricsRegistry.registerMetric(dispatchTickDurationSeconds);
metricsRegistry.registerMetric(outboxPickedTotal);
metricsRegistry.registerMetric(outboxSentTotal);
metricsRegistry.registerMetric(outboxFailedTotal);
metricsRegistry.registerMetric(outboxDeadTotal);
metricsRegistry.registerMetric(consumerFetchTotal);
metricsRegistry.registerMetric(consumerDeliveredTotal);
metricsRegistry.registerMetric(consumerAckTotal);
metricsRegistry.registerMetric(consumerFailuresTotal);
metricsRegistry.registerMetric(consumerDedupeSkipsTotal);
metricsRegistry.registerMetric(consumerLagSeconds);
metricsRegistry.registerMetric(dlqWrittenTotal);
metricsRegistry.registerMetric(dlqWriteFailuresTotal);
metricsRegistry.registerMetric(consumerPelSize);
metricsRegistry.registerMetric(consumerReorderBufferSize);
metricsRegistry.registerMetric(consumerPelReclaimedTotal);

// Stage 3A: Conversation metrics
const conversationsCreatedTotal = new Counter({
  name: 'messaging_conversations_created_total',
  help: 'Total conversations created',
  labelNames: ['type'],
  registers: [metricsRegistry]
});

const conversationsDeletedTotal = new Counter({
  name: 'messaging_conversations_deleted_total',
  help: 'Total conversations deleted (soft delete)',
  registers: [metricsRegistry]
});

const conversationVersionConflicts = new Counter({
  name: 'messaging_conversation_version_conflicts_total',
  help: 'Optimistic concurrency conflicts (409 errors)',
  registers: [metricsRegistry]
});

// Stage 3B: Participant metrics
const participantsAddedTotal = new Counter({
  name: 'messaging_participants_added_total',
  help: 'Total participants added to conversations',
  registers: [metricsRegistry]
});

const participantsRemovedTotal = new Counter({
  name: 'messaging_participants_removed_total',
  help: 'Total participants removed from conversations',
  registers: [metricsRegistry]
});

const participantCacheHits = new Counter({
  name: 'messaging_participant_cache_hits_total',
  help: 'Participant cache hits',
  registers: [metricsRegistry]
});

const participantCacheMisses = new Counter({
  name: 'messaging_participant_cache_misses_total',
  help: 'Participant cache misses',
  registers: [metricsRegistry]
});

// Stage 3D: Security metrics
const securityDeniedTotal = new Counter({
  name: 'sanctum_security_denied_total',
  help: 'Authorization denials',
  labelNames: ['route', 'reason'],
  registers: [metricsRegistry]
});

const authenticationFailures = new Counter({
  name: 'messaging_authentication_failures_total',
  help: 'Authentication failures (401 errors)',
  registers: [metricsRegistry]
});

metricsRegistry.registerMetric(conversationsCreatedTotal);
metricsRegistry.registerMetric(conversationsDeletedTotal);
metricsRegistry.registerMetric(conversationVersionConflicts);
metricsRegistry.registerMetric(participantsAddedTotal);
metricsRegistry.registerMetric(participantsRemovedTotal);
metricsRegistry.registerMetric(participantCacheHits);
metricsRegistry.registerMetric(participantCacheMisses);
metricsRegistry.registerMetric(securityDeniedTotal);
metricsRegistry.registerMetric(authenticationFailures);

export const messagingMetrics = {
  requestCounter,
  requestDurationMs,
  payloadRejects,
  idempotencyHits,
  markReadUpdates,
  messageSizeBytes,
  dispatchFetchTotal,
  dispatchPublishedTotal,
  dispatchLagSeconds,
  dispatchShardsPaused,
  dispatchDlqTotal,
  dispatchTicksTotal,
  dispatchTickDurationSeconds,
  outboxPickedTotal,
  outboxSentTotal,
  outboxFailedTotal,
  outboxDeadTotal,
  consumerFetchTotal,
  consumerDeliveredTotal,
  consumerAckTotal,
  consumerFailuresTotal,
  consumerDedupeSkipsTotal,
  consumerLagSeconds,
  dlqWrittenTotal,
  dlqWriteFailuresTotal,
  consumerPelSize,
  consumerReorderBufferSize,
  consumerPelReclaimedTotal,
  // Stage 3A
  conversationsCreatedTotal,
  conversationsDeletedTotal,
  conversationVersionConflicts,
  // Stage 3B
  participantsAddedTotal,
  participantsRemovedTotal,
  participantCacheHits,
  participantCacheMisses,
  // Stage 3D
  securityDeniedTotal,
  authenticationFailures,
};


