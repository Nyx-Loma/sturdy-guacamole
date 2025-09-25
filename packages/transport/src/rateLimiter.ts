import type { RateLimiterMemory } from 'rate-limiter-flexible';

export interface RateLimiterSet {
  connectionLimiter?: RateLimiterMemory;
  messageLimiter?: RateLimiterMemory;
}

export interface RateLimiterConfig {
  connectionFactory?: () => RateLimiterMemory | null;
  messageFactory?: () => RateLimiterMemory | null;
}

export const createRateLimiters = (config: RateLimiterConfig): RateLimiterSet => {
  let connectionLimiter: RateLimiterMemory | undefined;
  let messageLimiter: RateLimiterMemory | undefined;

  try {
    connectionLimiter = config.connectionFactory?.() ?? undefined;
  } catch {
    connectionLimiter = undefined;
  }

  try {
    messageLimiter = config.messageFactory?.() ?? undefined;
  } catch {
    messageLimiter = undefined;
  }

  return { connectionLimiter, messageLimiter };
};
