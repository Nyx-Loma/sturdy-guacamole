import { EventEmitter } from "node:events";
import { performance } from "node:perf_hooks";
import type { StorageMetrics } from "../observability/metrics";
import { CircuitBreaker } from "../utils/circuitBreaker";
import { retry } from "../utils/retry";
import type { StorageLogger } from "../observability/logs";
import type { RetryOptions } from "../utils/retry";

export interface CacheEnvelope<T> {
  value: T;
  storedAt: number;
}

export interface CacheProvider<T = unknown> {
  init(): Promise<void>;
  dispose(): Promise<void>;
  get(key: string): Promise<T | undefined>;
  set(key: string, entry: { value: T; ttlSeconds?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  on?(event: "invalidate", listener: (key: string) => void): EventEmitter | void;
  off?(event: "invalidate", listener: (key: string) => void): EventEmitter | void;
}

export interface CacheManagerOptions {
  ttlSeconds?: number;
  stalenessBudgetMs?: number;
  metrics?: StorageMetrics;
  namespace?: string;
  adapter?: string;
  logger?: StorageLogger;
  retry?: RetryOptions;
  circuitBreaker?: CircuitBreaker;
}

export class CacheManager<T = unknown> {
  private readonly emitter = new EventEmitter();
  private readonly ttlSeconds: number;
  private readonly stalenessBudgetMs: number;
  private readonly metrics?: StorageMetrics;
  private readonly namespace?: string;
  private readonly adapter?: string;
  private lastSampledAt = 0;
  private staleHits = 0;
  private freshHits = 0;
  private readonly logger?: StorageLogger;
  private readonly retryOptions?: RetryOptions;
  private readonly circuitBreaker?: CircuitBreaker;

  constructor(private readonly provider: CacheProvider<CacheEnvelope<T>>, options: CacheManagerOptions = {}) {
    this.ttlSeconds = options.ttlSeconds ?? 60;
    this.stalenessBudgetMs = options.stalenessBudgetMs ?? 100;
    this.metrics = options.metrics;
    this.namespace = options.namespace;
    this.adapter = options.adapter;
    this.logger = options.logger;
    this.retryOptions = options.retry;
    this.circuitBreaker = options.circuitBreaker;
  }

  onInvalidate(listener: (key: string) => void): void {
    this.emitter.on("invalidate", listener);
  }

  offInvalidate(listener: (key: string) => void): void {
    this.emitter.off("invalidate", listener);
  }

  async get(key: string): Promise<{ value?: T; stale: boolean }> {
    return this.execute("cache_get", key, () => this.provider.get(key), (envelope, duration) => {
      const stale = envelope ? Date.now() - envelope.storedAt > this.stalenessBudgetMs : false;
      if (envelope) {
        if (stale) this.staleHits += 1; else this.freshHits += 1;
        this.log("cache.hit", key, duration, { stale });
      } else {
        this.log("cache.miss", key, duration, {});
      }
      this.recordCacheSample(envelope !== undefined ? 1 : 0);
      return { value: envelope?.value, stale };
    });
  }

  async set(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.execute("cache_set", key, () => this.provider.set(key, { value: { value, storedAt: Date.now() }, ttlSeconds: ttlSeconds ?? this.ttlSeconds }), (_, duration) => {
      this.emitter.emit("invalidate", key);
      this.log("cache.write", key, duration, {});
    });
  }

  async delete(key: string): Promise<void> {
    await this.execute("cache_delete", key, () => this.provider.delete(key), (_, duration) => {
      this.emitter.emit("invalidate", key);
      this.log("cache.invalidate", key, duration, {});
    });
  }

  getStalenessBudgetMs(): number {
    return this.stalenessBudgetMs;
  }

  get cacheHitCounts(): { fresh: number; stale: number } {
    return { fresh: this.freshHits, stale: this.staleHits };
  }

  async resetCacheCounters(): Promise<void> {
    this.freshHits = 0;
    this.staleHits = 0;
  }

  private recordLatency(op: string, durationMs: number): void {
    this.metrics?.latencyMs.observe({ op, adapter: this.adapter ?? "cache", namespace: this.namespace ?? "*" }, durationMs);
    this.metrics?.cacheLatencyMs?.observe({ op, adapter: this.adapter ?? "cache", namespace: this.namespace ?? "*" }, durationMs);
  }

  private recordCacheSample(value: number): void {
    const now = Date.now();
    if (!this.metrics?.cacheHitRatio) return;
    if (now - this.lastSampledAt < 1000) {
      return;
    }
    this.lastSampledAt = now;
    this.metrics.cacheHitRatio.observe({ namespace: this.namespace ?? "*", adapter: this.adapter ?? "cache" }, value);
  }

  private async execute<TResult>(op: "cache_get" | "cache_set" | "cache_delete", key: string, action: () => Promise<TResult>, onSuccess: (result: TResult, duration: number) => TResult | void): Promise<TResult> {
    const labels = { op, adapter: this.adapter ?? "cache", namespace: this.namespace ?? "*" };
    const perform = async (): Promise<TResult> => {
      const start = performance.now();
      let result: TResult;
      if (this.circuitBreaker) {
        if (!this.circuitBreaker.shouldAllow()) {
          this.metrics?.errorsTotal.inc({ ...labels, code: "CircuitOpen" });
          this.metrics?.cacheErrorsTotal?.inc({ ...labels, code: "CircuitOpen" });
          const error = new Error("Cache circuit breaker is open");
          this.logger?.warn({ op, namespace: labels.namespace, adapter: labels.adapter, durationMs: 0, code: "CircuitOpen", cacheState: "miss", error });
          throw error;
        }
        try {
          result = await action();
          this.circuitBreaker.recordSuccess();
        } catch (error) {
          this.circuitBreaker.recordFailure();
          this.metrics?.circuitBreakerTransitions.inc({ state: "open", ...labels });
          this.metrics?.cacheErrorsTotal?.inc({ ...labels, code: error instanceof Error ? error.name : "Unknown" });
          throw error;
        }
      } else {
        result = await action();
      }
      const duration = performance.now() - start;
      this.metrics?.requestsTotal.inc(labels);
      this.metrics?.cacheRequestsTotal?.inc(labels);
      this.recordLatency(op, duration);
      const transformed = onSuccess(result, duration);
      return (transformed === undefined ? result : transformed) as TResult;
    };

    try {
      return this.retryOptions
        ? await retry(async () => {
            try {
              return await perform();
            } catch (error) {
              this.metrics?.retriesTotal.inc({ ...labels, code: error instanceof Error ? error.name : "Unknown" });
              this.metrics?.cacheRetriesTotal?.inc({ ...labels, code: error instanceof Error ? error.name : "Unknown" });
              throw error;
            }
          }, this.retryOptions)
        : await perform();
    } catch (error) {
      this.metrics?.errorsTotal.inc({ ...labels, code: error instanceof Error ? error.name : "Unknown" });
      this.metrics?.cacheErrorsTotal?.inc({ ...labels, code: error instanceof Error ? error.name : "Unknown" });
      this.logger?.warn({ op, namespace: labels.namespace, adapter: labels.adapter, durationMs: 0, code: error instanceof Error ? error.name : "Unknown", cacheState: "miss", error });
      throw error;
    }
  }

  private log(event: string, key: string, duration: number, extra: Record<string, unknown>): void {
    this.logger?.debug({ op: event, namespace: this.namespace ?? "*", adapter: this.adapter ?? "cache", durationMs: duration, cacheKey: key, ...extra });
  }

  private readonly handleExternalInvalidate = (key: string) => {
    this.emitter.emit("invalidate", key);
  };

  async init(): Promise<void> {
    await this.provider.init();
    this.provider.on?.("invalidate", this.handleExternalInvalidate);
  }

  async dispose(): Promise<void> {
    this.provider.off?.("invalidate", this.handleExternalInvalidate);
    await this.provider.dispose();
    this.emitter.removeAllListeners();
  }
}

