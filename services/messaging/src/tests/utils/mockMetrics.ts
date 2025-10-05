import { vi } from 'vitest';
import type { MessagingMetrics } from '../../observability/metrics';

/**
 * Creates a mock MessagingMetrics object for testing
 */
export function createMockMetrics(): MessagingMetrics {
  const mockCounter = () => ({
    inc: vi.fn(),
    labels: vi.fn().mockReturnValue({ inc: vi.fn() }),
  });

  const mockGauge = () => ({
    set: vi.fn(),
    inc: vi.fn(),
    dec: vi.fn(),
    labels: vi.fn().mockReturnValue({ set: vi.fn() }),
  });

  const mockHistogram = () => ({
    observe: vi.fn(),
    labels: vi.fn().mockReturnValue({ observe: vi.fn() }),
  });

  return {
    registry: {
      metrics: vi.fn().mockResolvedValue(''),
      contentType: 'text/plain',
    } as any,
    requestCounter: mockCounter() as any,
    requestDurationMs: mockHistogram() as any,
    payloadRejects: mockCounter() as any,
    idempotencyHits: mockCounter() as any,
    markReadUpdates: mockCounter() as any,
    messageSizeBytes: mockHistogram() as any,
    dispatchFetchTotal: mockCounter() as any,
    dispatchPublishedTotal: mockCounter() as any,
    dispatchLagSeconds: mockHistogram() as any,
    dispatchShardsPaused: mockGauge() as any,
    dispatchDlqTotal: mockCounter() as any,
    dispatchTicksTotal: mockCounter() as any,
    dispatchTickDurationSeconds: mockHistogram() as any,
    outboxPickedTotal: mockCounter() as any,
    outboxSentTotal: mockCounter() as any,
    outboxFailedTotal: mockCounter() as any,
    outboxDeadTotal: mockCounter() as any,
    consumerFetchTotal: mockCounter() as any,
    consumerDeliveredTotal: mockCounter() as any,
    consumerAckTotal: mockCounter() as any,
    consumerFailuresTotal: mockCounter() as any,
    consumerDedupeSkipsTotal: mockCounter() as any,
    consumerLagSeconds: mockHistogram() as any,
    dlqWrittenTotal: mockCounter() as any,
    dlqWriteFailuresTotal: mockCounter() as any,
    consumerPelSize: mockGauge() as any,
    consumerReorderBufferSize: mockGauge() as any,
    consumerPelReclaimedTotal: mockCounter() as any,
    wsQueueDepth: mockGauge() as any,
    wsDroppedTotal: mockCounter() as any,
    breakerOpened: mockCounter() as any,
    breakerHalfOpen: mockCounter() as any,
    breakerClosed: mockCounter() as any,
    conversationsCreatedTotal: mockCounter() as any,
    conversationsDeletedTotal: mockCounter() as any,
    conversationVersionConflicts: mockCounter() as any,
    participantsAddedTotal: mockCounter() as any,
    participantsRemovedTotal: mockCounter() as any,
    participantCacheHits: mockCounter() as any,
    participantCacheMisses: mockCounter() as any,
    participantCacheErrors: mockCounter() as any,
    securityDeniedTotal: mockCounter() as any,
    authenticationFailures: mockCounter() as any,
    rateLimitExceeded: mockCounter() as any,
    authRequestsTotal: mockCounter() as any,
    authLatencyMs: mockHistogram() as any,
    authJwksFetchFailures: mockCounter() as any,
    authJwksCacheHits: mockCounter() as any,
    authJwksCacheMisses: mockCounter() as any,
    authenticatedRequestsTotal: mockCounter() as any,
    poolTotalCount: mockGauge() as any,
    poolIdleCount: mockGauge() as any,
    poolWaitingCount: mockGauge() as any,
    poolAcquireWaitMs: mockHistogram() as any,
    poolAcquireTimeouts: mockCounter() as any,
    poolConnectErrors: mockCounter() as any,
  };
}
