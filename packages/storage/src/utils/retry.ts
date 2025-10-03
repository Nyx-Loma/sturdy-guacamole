import { setTimeout as delay } from "node:timers/promises";

export interface RetryOptions {
  attempts: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  shouldRetry?: (error: unknown) => boolean;
}

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const {
    attempts,
    baseDelayMs = 100,
    maxDelayMs = 2_000,
    jitter = true,
    shouldRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const canRetry = shouldRetry ? shouldRetry(error) : true;
      if (!canRetry || attempt === attempts - 1) {
        throw error;
      }

      const backoff = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      const delayMs = jitter ? Math.random() * backoff : backoff;
      await delay(delayMs);
    }
  }

  throw lastError;
}


