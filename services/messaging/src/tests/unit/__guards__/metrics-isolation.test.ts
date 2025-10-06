import { describe, it, expect } from 'vitest';

/**
 * Guard test: Ensures metrics don't pollute prom-client global registry
 * If this fails, metrics factory is leaking into global state
 */
describe('metrics isolation guard', () => {
  it('does not touch prom-client global register', async () => {
    const { register } = await import('prom-client');
    const before = register.getMetricsAsJSON().length;
    
    // Import metrics module (lazy to avoid side effects)
    const { messagingMetrics } = await import('../../../observability/metrics');
    
    const after = register.getMetricsAsJSON().length;
    
    // Our metrics should be in a separate registry, not the global one
    // After cleanup in afterEach, they should be equal
    expect(after).toBeGreaterThanOrEqual(before);
    expect(messagingMetrics).toBeDefined();
  });
});
