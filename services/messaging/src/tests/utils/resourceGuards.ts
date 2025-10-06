import type { FastifyInstance } from 'fastify';

/**
 * Resource leak guards for tests
 * Call these in teardown to ensure proper cleanup
 */

/**
 * Verify all database connections are closed
 */
export function assertDbClosed(app: FastifyInstance): void {
  const pgPool = (app as any).pgPool;
  if (pgPool) {
    const { totalCount, idleCount, waitingCount } = pgPool;
    if (totalCount !== 0 || waitingCount !== 0) {
      throw new Error(
        `DB pool not closed: total=${totalCount}, idle=${idleCount}, waiting=${waitingCount}`
      );
    }
  }
}

/**
 * Verify Redis connections are closed
 */
export function assertRedisClosed(app: FastifyInstance): void {
  const redis = (app as any).redis;
  const subscriber = (app as any).redisSubscriber;
  
  if (redis && redis.status !== 'end') {
    throw new Error(`Redis main client not closed: status=${redis.status}`);
  }
  
  if (subscriber && subscriber.status !== 'end') {
    throw new Error(`Redis subscriber not closed: status=${subscriber.status}`);
  }
}

/**
 * Check for lingering timers (development/debug only)
 * Requires Node 16+
 */
export async function getActiveTimers(): Promise<string[]> {
  try {
    const perfHooks = await import('node:perf_hooks');
    if ('getActiveResourcesInfo' in perfHooks) {
      type PerfHooksWithInfo = typeof perfHooks & { getActiveResourcesInfo: () => string[] };
      const resources = (perfHooks as PerfHooksWithInfo).getActiveResourcesInfo();
      return resources.filter((r: string) => r === 'Timeout' || r === 'Immediate');
    }
    return [];
  } catch {
    // Not available in this Node version
    return [];
  }
}

/**
 * Get memory stats for debugging
 */
export function getMemoryStats() {
  const usage = process.memoryUsage();
  return {
    rss: Math.round(usage.rss / 1024 / 1024), // MB
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
    external: Math.round(usage.external / 1024 / 1024), // MB
  };
}
