import { Counter, Histogram, Gauge, Registry, collectDefaultMetrics } from 'prom-client';

export type MessagingMetrics = {
  registry: Registry;
  requestCounter: Counter<string>;
  requestDurationMs: Histogram<string>;
  payloadRejects: Counter<string>;
  idempotencyHits: Counter<string>;
  markReadUpdates: Counter<string>;
  messageSizeBytes: Histogram<string>;
  dispatchFetchTotal: Counter<string>;
  dispatchPublishedTotal: Counter<string>;
  dispatchLagSeconds: Histogram<string>;
  dispatchShardsPaused: Gauge<string>;
  dispatchDlqTotal: Counter<string>;
  dispatchTicksTotal: Counter<string>;
  dispatchTickDurationSeconds: Histogram<string>;
  outboxPickedTotal: Counter<string>;
  outboxSentTotal: Counter<string>;
  outboxFailedTotal: Counter<string>;
  outboxDeadTotal: Counter<string>;
  consumerFetchTotal: Counter<string>;
  consumerDeliveredTotal: Counter<string>;
  consumerAckTotal: Counter<string>;
  consumerFailuresTotal: Counter<string>;
  consumerDedupeSkipsTotal: Counter<string>;
  consumerLagSeconds: Histogram<string>;
  dlqWrittenTotal: Counter<string>;
  dlqWriteFailuresTotal: Counter<string>;
  consumerPelSize: Gauge<string>;
  consumerReorderBufferSize: Gauge<string>;
  consumerPelReclaimedTotal: Counter<string>;
  wsQueueDepth: Gauge<string>;
  wsDroppedTotal: Counter<string>;
  breakerOpened: Counter<string>;
  breakerHalfOpen: Counter<string>;
  breakerClosed: Counter<string>;
  conversationsCreatedTotal: Counter<string>;
  conversationsDeletedTotal: Counter<string>;
  conversationVersionConflicts: Counter<string>;
  participantsAddedTotal: Counter<string>;
  participantsRemovedTotal: Counter<string>;
  participantCacheHits: Counter<string>;
  participantCacheMisses: Counter<string>;
  participantCacheErrors: Counter<string>;
  securityDeniedTotal: Counter<string>;
  authenticationFailures: Counter<string>;
  rateLimitExceeded: Counter<string>;
  authRequestsTotal: Counter<string>;
  authLatencyMs: Histogram<string>;
  authJwksFetchFailures: Counter<string>;
  authJwksCacheHits: Counter<string>;
  authJwksCacheMisses: Counter<string>;
  authenticatedRequestsTotal: Counter<string>;
  poolTotalCount: Gauge<string>;
  poolIdleCount: Gauge<string>;
  poolWaitingCount: Gauge<string>;
  poolAcquireWaitMs: Histogram<string>;
  poolAcquireTimeouts: Counter<string>;
  poolConnectErrors: Counter<string>;
};

/**
 * Creates a new isolated metrics registry and all messaging metrics.
 * Each server instance should call this to get its own metrics.
 */
export function createMessagingMetrics(opts?: { defaultPrefix?: string }): MessagingMetrics {
  const registry = new Registry();
  const prefix = opts?.defaultPrefix ?? 'messaging_';

  collectDefaultMetrics({
    register: registry,
    prefix,
  });

  const requestCounter = new Counter({
    name: `${prefix}http_requests_total`,
    help: 'Total HTTP requests received',
    labelNames: ['route', 'method', 'statusCode'],
    registers: [registry],
  });

  const requestDurationMs = new Histogram({
    name: `${prefix}http_request_duration_ms`,
    help: 'HTTP request duration in milliseconds',
    buckets: [5, 10, 25, 50, 100, 250, 500, 750, 1_000, 1_500, 2_000, 5_000],
    labelNames: ['route', 'method', 'statusCode'],
    registers: [registry],
  });

  const payloadRejects = new Counter({
    name: `${prefix}payload_rejects_total`,
    help: 'Payload validation rejections',
    labelNames: ['reason'],
    registers: [registry],
  });

  const idempotencyHits = new Counter({
    name: `${prefix}idempotency_hits_total`,
    help: 'Idempotent replay detections',
    registers: [registry],
  });

  const markReadUpdates = new Counter({
    name: `${prefix}mark_read_updates_total`,
    help: 'Number of messages marked as read',
    registers: [registry],
  });

  const messageSizeBytes = new Histogram({
    name: `${prefix}message_payload_bytes`,
    help: 'Raw encrypted payload size',
    buckets: [512, 1_024, 2_048, 4_096, 8_192, 16_384, 32_768, 65_536],
    registers: [registry],
  });

  const dispatchFetchTotal = new Counter({
    name: `${prefix}dispatch_fetch_total`,
    help: 'Outbox fetch attempts',
    labelNames: ['status'],
    registers: [registry],
  });

  const dispatchPublishedTotal = new Counter({
    name: `${prefix}dispatch_published_total`,
    help: 'Outbox events published to Redis',
    registers: [registry],
  });

  const dispatchLagSeconds = new Histogram({
    name: `${prefix}dispatch_lag_seconds`,
    help: 'Age of oldest undispatched/acked event in seconds',
    buckets: [1, 2, 5, 10, 30, 60, 120, 300],
    registers: [registry],
  });

  const dispatchShardsPaused = new Gauge({
    name: `${prefix}dispatch_shard_paused`,
    help: 'Shard backpressure indicator',
    labelNames: ['shard'],
    registers: [registry],
  });

  const dispatchDlqTotal = new Counter({
    name: `${prefix}dispatch_dlq_total`,
    help: 'DLQ events recorded',
    labelNames: ['sink'],
    registers: [registry],
  });

  const dispatchTicksTotal = new Counter({
    name: `${prefix}dispatch_ticks_total`,
    help: 'Total dispatcher tick invocations',
    labelNames: ['result'],
    registers: [registry],
  });

  const dispatchTickDurationSeconds = new Histogram({
    name: `${prefix}dispatch_tick_duration_seconds`,
    help: 'Dispatcher tick duration in seconds',
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  const outboxPickedTotal = new Counter({
    name: `${prefix}outbox_picked_total`,
    help: 'Outbox rows picked for dispatch',
    registers: [registry],
  });

  const outboxSentTotal = new Counter({
    name: `${prefix}outbox_sent_total`,
    help: 'Outbox rows successfully sent',
    registers: [registry],
  });

  const outboxFailedTotal = new Counter({
    name: `${prefix}outbox_failed_total`,
    help: 'Outbox rows failed (will retry)',
    registers: [registry],
  });

  const outboxDeadTotal = new Counter({
    name: `${prefix}outbox_dead_total`,
    help: 'Outbox rows moved to DLQ (max attempts exceeded)',
    registers: [registry],
  });

  const consumerFetchTotal = new Counter({
    name: `${prefix}consumer_fetch_total`,
    help: 'Consumer stream fetch attempts',
    labelNames: ['status'],
    registers: [registry],
  });

  const consumerDeliveredTotal = new Counter({
    name: `${prefix}consumer_delivered_total`,
    help: 'Messages successfully delivered to WebSocket clients',
    registers: [registry],
  });

  const consumerAckTotal = new Counter({
    name: `${prefix}consumer_ack_total`,
    help: 'Messages acknowledged to Redis Stream',
    registers: [registry],
  });

  const consumerFailuresTotal = new Counter({
    name: `${prefix}consumer_failures_total`,
    help: 'Consumer failures',
    labelNames: ['reason'],
    registers: [registry],
  });

  const consumerDedupeSkipsTotal = new Counter({
    name: `${prefix}consumer_dedupe_skips_total`,
    help: 'Duplicate messages skipped by consumer',
    registers: [registry],
  });

  const consumerLagSeconds = new Histogram({
    name: `${prefix}consumer_lag_seconds`,
    help: 'Consumer lag (time between publish and delivery)',
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [registry],
  });

  const dlqWrittenTotal = new Counter({
    name: `${prefix}dlq_written_total`,
    help: 'Messages written to DLQ',
    labelNames: ['reason'],
    registers: [registry],
  });

  const dlqWriteFailuresTotal = new Counter({
    name: `${prefix}dlq_write_failures_total`,
    help: 'DLQ write failures',
    registers: [registry],
  });

  const consumerPelSize = new Gauge({
    name: `${prefix}consumer_pel_size`,
    help: 'Consumer Pending Entry List size (unacked messages)',
    registers: [registry],
  });

  const consumerReorderBufferSize = new Gauge({
    name: `${prefix}consumer_reorder_buffer_size`,
    help: 'Consumer per-conversation reorder buffer size',
    registers: [registry],
  });

  const consumerPelReclaimedTotal = new Counter({
    name: `${prefix}consumer_pel_reclaimed_total`,
    help: 'Messages reclaimed from stale consumers via XAUTOCLAIM',
    registers: [registry],
  });

  // WebSocket backpressure metrics
  const wsQueueDepth = new Gauge({
    name: 'ws_queue_depth',
    help: 'WebSocket per-socket/backpressure queue depth',
    registers: [registry],
  });

  const wsDroppedTotal = new Counter({
    name: 'ws_dropped_total',
    help: 'WebSocket messages dropped due to backpressure',
    labelNames: ['reason'],
    registers: [registry],
  });

  // Circuit breaker state transitions
  const breakerOpened = new Counter({
    name: `${prefix}breaker_opened_total`,
    help: 'Circuit breaker opened events',
    labelNames: ['name'],
    registers: [registry],
  });

  const breakerHalfOpen = new Counter({
    name: `${prefix}breaker_half_open_total`,
    help: 'Circuit breaker half-open transitions',
    labelNames: ['name'],
    registers: [registry],
  });

  const breakerClosed = new Counter({
    name: `${prefix}breaker_closed_total`,
    help: 'Circuit breaker re-closed events',
    labelNames: ['name'],
    registers: [registry],
  });

  // Stage 3A: Conversation metrics
  const conversationsCreatedTotal = new Counter({
    name: `${prefix}conversations_created_total`,
    help: 'Total conversations created',
    labelNames: ['type'],
    registers: [registry],
  });

  const conversationsDeletedTotal = new Counter({
    name: `${prefix}conversations_deleted_total`,
    help: 'Total conversations deleted (soft delete)',
    registers: [registry],
  });

  const conversationVersionConflicts = new Counter({
    name: `${prefix}conversation_version_conflicts_total`,
    help: 'Optimistic concurrency conflicts (409 errors)',
    registers: [registry],
  });

  // Stage 3B: Participant metrics
  const participantsAddedTotal = new Counter({
    name: `${prefix}participants_added_total`,
    help: 'Total participants added to conversations',
    registers: [registry],
  });

  const participantsRemovedTotal = new Counter({
    name: `${prefix}participants_removed_total`,
    help: 'Total participants removed from conversations',
    registers: [registry],
  });

  const participantCacheHits = new Counter({
    name: `${prefix}participant_cache_hits_total`,
    help: 'Participant cache hits',
    registers: [registry],
  });

  const participantCacheMisses = new Counter({
    name: `${prefix}participant_cache_misses_total`,
    help: 'Participant cache misses',
    registers: [registry],
  });

  const participantCacheErrors = new Counter({
    name: `${prefix}participant_cache_errors_total`,
    help: 'Participant cache errors (fail-closed)',
    registers: [registry],
  });

  // Stage 3D: Security metrics
  const securityDeniedTotal = new Counter({
    name: 'sanctum_security_denied_total',
    help: 'Authorization denials',
    labelNames: ['route', 'reason'],
    registers: [registry],
  });

  const authenticationFailures = new Counter({
    name: `${prefix}authentication_failures_total`,
    help: 'Authentication failures (401 errors)',
    registers: [registry],
  });

  const rateLimitExceeded = new Counter({
    name: `${prefix}rate_limit_exceeded_total`,
    help: 'Rate limit exceeded responses (429 errors)',
    labelNames: ['route', 'scope'],
    registers: [registry],
  });

  const authRequestsTotal = new Counter({
    name: 'sanctum_auth_requests_total',
    help: 'Auth middleware outcomes',
    labelNames: ['outcome'],
    registers: [registry],
  });

  const authLatencyMs = new Histogram({
    name: 'sanctum_auth_latency_ms',
    help: 'Auth middleware latency in milliseconds',
    buckets: [1, 5, 10, 20, 50, 100, 250, 500, 1000],
    registers: [registry],
  });

  const authJwksFetchFailures = new Counter({
    name: 'sanctum_auth_jwks_errors_total',
    help: 'JWKS fetch failures',
    registers: [registry],
  });

  const authJwksCacheHits = new Counter({
    name: 'sanctum_auth_jwks_cache_hits_total',
    help: 'JWKS cache hits',
    registers: [registry],
  });

  const authJwksCacheMisses = new Counter({
    name: 'sanctum_auth_jwks_cache_misses_total',
    help: 'JWKS cache misses',
    registers: [registry],
  });

  const authenticatedRequestsTotal = new Counter({
    name: 'sanctum_auth_success_total',
    help: 'Requests that passed auth middleware',
    registers: [registry],
  });

  // Postgres connection pool metrics
  const poolTotalCount = new Gauge({
    name: `${prefix}postgres_pool_total_count`,
    help: 'Total connections in pool (active + idle)',
    registers: [registry],
  });

  const poolIdleCount = new Gauge({
    name: `${prefix}postgres_pool_idle_count`,
    help: 'Idle connections available',
    registers: [registry],
  });

  const poolWaitingCount = new Gauge({
    name: `${prefix}postgres_pool_waiting_count`,
    help: 'Requests waiting for connection',
    registers: [registry],
  });

  const poolAcquireWaitMs = new Histogram({
    name: `${prefix}postgres_pool_acquire_wait_ms`,
    help: 'Time spent waiting to acquire connection',
    buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000],
    registers: [registry],
  });

  const poolAcquireTimeouts = new Counter({
    name: `${prefix}postgres_pool_acquire_timeouts_total`,
    help: 'Connection acquisition timeouts',
    registers: [registry],
  });

  const poolConnectErrors = new Counter({
    name: `${prefix}postgres_pool_connect_errors_total`,
    help: 'Failed connection attempts',
    labelNames: ['error_type'],
    registers: [registry],
  });

  return {
    registry,
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
    wsQueueDepth,
    wsDroppedTotal,
    breakerOpened,
    breakerHalfOpen,
    breakerClosed,
    conversationsCreatedTotal,
    conversationsDeletedTotal,
    conversationVersionConflicts,
    participantsAddedTotal,
    participantsRemovedTotal,
    participantCacheHits,
    participantCacheMisses,
    participantCacheErrors,
    securityDeniedTotal,
    authenticationFailures,
    rateLimitExceeded,
    authRequestsTotal,
    authLatencyMs,
    authJwksFetchFailures,
    authJwksCacheHits,
    authJwksCacheMisses,
    authenticatedRequestsTotal,
    poolTotalCount,
    poolIdleCount,
    poolWaitingCount,
    poolAcquireWaitMs,
    poolAcquireTimeouts,
    poolConnectErrors,
  };
}

// NOTE: No global exports! All code must use createMessagingMetrics() factory
// and access metrics via app.messagingMetrics or dependency injection