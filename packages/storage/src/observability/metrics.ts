export type Labels = Record<string, string | number | boolean | undefined>;

export interface Counter {
  inc(labels?: Labels, value?: number): void;
}

export interface Histogram {
  observe(labels: Labels | undefined, valueMs: number): void;
}

export interface StorageMetrics {
  requestsTotal: Counter;
  errorsTotal: Counter;
  retriesTotal: Counter;
  latencyMs: Histogram;
  payloadBytes: Histogram;
  circuitBreakerTransitions: Counter;
  cacheHitRatio?: Histogram;
  cacheLatencyMs?: Histogram;
  cacheErrorsTotal?: Counter;
  cacheRetriesTotal?: Counter;
  cacheRequestsTotal?: Counter;
}

export function createNoopMetrics(): StorageMetrics {
  const counter: Counter = { inc: () => undefined };
  const histogram: Histogram = { observe: () => undefined };
  return {
    requestsTotal: counter,
    errorsTotal: counter,
    retriesTotal: counter,
    latencyMs: histogram,
    payloadBytes: histogram,
    circuitBreakerTransitions: counter,
    cacheHitRatio: histogram,
    cacheLatencyMs: histogram,
    cacheErrorsTotal: counter,
    cacheRetriesTotal: counter,
    cacheRequestsTotal: counter,
  };
}

export function createTestMetrics() {
  const counters: Record<string, Array<{ labels?: Labels; value?: number }>> = {};
  const histograms: Record<string, Array<{ labels?: Labels; value: number }>> = {};

  const makeCounter = (name: string): Counter => ({
    inc(labels, value) {
      counters[name] ??= [];
      counters[name].push({ labels, value });
    },
  });

  const makeHistogram = (name: string): Histogram => ({
    observe(labels, value) {
      histograms[name] ??= [];
      histograms[name].push({ labels, value });
    },
  });

  const metrics: StorageMetrics = {
    requestsTotal: makeCounter("requestsTotal"),
    errorsTotal: makeCounter("errorsTotal"),
    retriesTotal: makeCounter("retriesTotal"),
    latencyMs: makeHistogram("latencyMs"),
    payloadBytes: makeHistogram("payloadBytes"),
    circuitBreakerTransitions: makeCounter("circuitBreakerTransitions"),
    cacheHitRatio: makeHistogram("cacheHitRatio"),
    cacheLatencyMs: makeHistogram("cacheLatencyMs"),
    cacheErrorsTotal: makeCounter("cacheErrorsTotal"),
    cacheRetriesTotal: makeCounter("cacheRetriesTotal"),
    cacheRequestsTotal: makeCounter("cacheRequestsTotal"),
  };

  return { metrics, counters, histograms };
}

