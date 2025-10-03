import { describe, it, expect } from "vitest";
import { createNoopMetrics, createTestMetrics } from "../src/observability/metrics";

describe("metrics helpers", () => {
  it("createNoopMetrics exposes all counters/histograms without throwing", () => {
    const m = createNoopMetrics();
    expect(() => m.requestsTotal.inc()).not.toThrow();
    expect(() => m.errorsTotal.inc({ code: "X" })).not.toThrow();
    expect(() => m.retriesTotal.inc({}, 2)).not.toThrow();
    expect(() => m.latencyMs.observe({}, 12)).not.toThrow();
    expect(() => m.payloadBytes.observe({}, 34)).not.toThrow();
    expect(() => m.circuitBreakerTransitions.inc({ state: "open" as any })).not.toThrow();
    expect(() => m.cacheHitRatio?.observe({}, 1)).not.toThrow();
    expect(() => m.cacheLatencyMs?.observe({}, 1)).not.toThrow();
    expect(() => m.cacheErrorsTotal?.inc({})).not.toThrow();
    expect(() => m.cacheRetriesTotal?.inc({})).not.toThrow();
    expect(() => m.cacheRequestsTotal?.inc({})).not.toThrow();
  });

  it("createTestMetrics collects labels and values", () => {
    const m = createTestMetrics();
    m.metrics.requestsTotal.inc({ op: "x" });
    m.metrics.errorsTotal.inc({ code: "E" }, 2);
    m.metrics.latencyMs.observe({ op: "x" }, 10);
    m.metrics.payloadBytes.observe({ op: "x" }, 5);
    m.metrics.circuitBreakerTransitions.inc({ state: "open" as any });
    m.metrics.cacheRequestsTotal?.inc({ op: "cache_get" });
    m.metrics.cacheErrorsTotal?.inc({ code: "NotFoundError" });
    m.metrics.cacheRetriesTotal?.inc({ code: "TimeoutError" });
    m.metrics.cacheLatencyMs?.observe({ op: "cache_get" }, 1);

    expect(m.counters.requestsTotal?.length).toBeGreaterThan(0);
    expect(m.histograms.latencyMs?.length).toBeGreaterThan(0);
    expect(m.counters.cacheRequestsTotal?.length).toBeGreaterThan(0);
  });
});



