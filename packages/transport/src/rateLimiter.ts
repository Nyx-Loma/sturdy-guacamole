import type { RateLimiterMemory } from 'rate-limiter-flexible';

export interface RateLimiterSet {
  connectionLimiter?: RateLimiterMemory;
  messageLimiter?: RateLimiterMemory;
}

export interface RateLimiterConfig {
  connectionFactory?: () => RateLimiterMemory;
  messageFactory?: () => RateLimiterMemory;
}

export const createRateLimiters = (config: RateLimiterConfig): RateLimiterSet => ({
  connectionLimiter: config.connectionFactory?.(),
  messageLimiter: config.messageFactory?.()
});
