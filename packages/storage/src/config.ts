import type { BlobAdapter, RecordAdapter, StreamAdapter, StorageAdapter } from "./adapters/base";
import type { StorageNamespace } from "./types";

export interface AdapterDefinition<TAdapter extends StorageAdapter> {
  namespaces: StorageNamespace | StorageNamespace[];
  adapter?: TAdapter;
  factory?: (context: { namespace: StorageNamespace }) => Promise<TAdapter> | TAdapter;
  config?: Record<string, unknown>;
}

export interface CacheConfig {
  enabled: boolean;
  maxItems?: number;
  maxBytes?: number;
  ttlSeconds?: number;
  provider?: "memory" | "redis" | string;
  providerConfig?: Record<string, unknown>;
}

export interface ObservabilityConfig {
  metrics?: boolean;
  traces?: boolean;
  logs?: boolean;
  emitter?: string;
}

export interface ConsistencyConfig {
  stalenessBudgetMs?: number;
}

export interface StorageConfig {
  schemaVersion: 1;
  defaultNamespace?: StorageNamespace;
  blobAdapters?: AdapterDefinition<BlobAdapter>[];
  recordAdapters?: AdapterDefinition<RecordAdapter>[];
  streamAdapters?: AdapterDefinition<StreamAdapter>[];
  cache?: CacheConfig;
  observability?: ObservabilityConfig;
  consistency?: ConsistencyConfig;
  featureFlags?: Record<string, boolean>;
}

export interface StorageDependencies {
  logger?: import("./observability/logs").StorageLogger;
  metrics?: import("./observability/metrics").StorageMetrics;
  tracer?: {
    startActiveSpan<T>(name: string, fn: (span: unknown) => Promise<T> | T): Promise<T> | T;
  };
}

