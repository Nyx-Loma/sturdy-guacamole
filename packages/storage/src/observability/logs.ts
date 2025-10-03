export interface StorageLogFields {
  op: string;
  namespace: string;
  adapter: string;
  durationMs: number;
  code?: string;
  cacheState?: "hit" | "miss" | "bypass";
  requestId?: string;
  tenantId?: string;
  idempotencyKey?: string;
  retryCount?: number;
  retryReason?: string;
}

export interface StorageLogger {
  debug(fields: StorageLogFields & Record<string, unknown>): void;
  info(fields: StorageLogFields & Record<string, unknown>): void;
  warn(fields: StorageLogFields & Record<string, unknown>): void;
  error(fields: StorageLogFields & Record<string, unknown>): void;
}

export function isStorageLogger(value: unknown): value is StorageLogger {
  return (
    typeof value === "object" &&
    value !== null &&
    "debug" in value &&
    "info" in value &&
    "warn" in value &&
    "error" in value
  );
}

export function createConsoleStorageLogger(): StorageLogger {
  const serialize = (fields: StorageLogFields & Record<string, unknown>) => fields;
  return {
    debug: (fields) => console.debug("storage", serialize(fields)),
    info: (fields) => console.info("storage", serialize(fields)),
    warn: (fields) => console.warn("storage", serialize(fields)),
    error: (fields) => console.error("storage", serialize(fields)),
  };
}

