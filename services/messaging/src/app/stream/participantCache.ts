import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

/**
 * Participant cache with versioned keys for invalidation
 * Stage 3B implementation
 * 
 * Strategy:
 * - Cache key: `conv:{conversationId}:participants:v{version}`
 * - Version counter: `conv:{conversationId}:part:ver` (Redis INCR)
 * - On add/remove: INCR version, publish invalidation via pubsub
 * - Consumers keep in-process cache keyed by {conversationId, version}
 * - On version mismatch → reload from Redis or DB
 */

export interface ParticipantCacheEntry {
  conversationId: string;
  version: number;
  userIds: string[];
  cachedAt: number;
}

export interface ParticipantCacheOptions {
  redis: Redis;
  subscriberRedis: Redis;
  logger: Logger;
  ttlSeconds?: number;
  invalidationChannel?: string;
}

export class ParticipantCache {
  private readonly redis: Redis;
  private readonly subscriberRedis: Redis;
  private readonly logger: Logger;
  private readonly ttlSeconds: number;
  private readonly invalidationChannel: string;
  
  // In-process cache: conversationId → { version, userIds }
  private readonly memoryCache = new Map<string, { version: number; userIds: string[]; cachedAt: number }>();
  
  constructor(options: ParticipantCacheOptions) {
    this.redis = options.redis;
    this.subscriberRedis = options.subscriberRedis;
    this.logger = options.logger;
    this.ttlSeconds = options.ttlSeconds ?? 300; // 5min TTL fallback
    this.invalidationChannel = options.invalidationChannel ?? 'conv.participants.inval';
  }

  /**
   * Start listening for invalidation messages
   */
  async start(): Promise<void> {
    await this.subscriberRedis.subscribe(this.invalidationChannel);
    
    this.subscriberRedis.on('message', (channel, message) => {
      if (channel !== this.invalidationChannel) return;
      
      try {
        const payload = JSON.parse(message) as { conversationId: string; version: number };
        this.handleInvalidation(payload.conversationId, payload.version);
      } catch (error) {
        this.logger.warn({ err: error, message }, 'participant_cache_invalidation_parse_error');
      }
    });

    this.logger.info({ channel: this.invalidationChannel }, 'participant_cache_started');
  }

  /**
   * Stop listening
   */
  async stop(): Promise<void> {
    // Remove listener before unsubscribing to prevent leaks
    this.subscriberRedis.removeAllListeners('message');
    await this.subscriberRedis.unsubscribe(this.invalidationChannel);
    this.memoryCache.clear();
    this.logger.info('participant_cache_stopped');
  }

  /**
   * Get participant user IDs for a conversation
   * Returns cached version if available and version matches
   */
  async get(conversationId: string): Promise<string[]> {
    // Get current version from Redis
    const currentVersion = await this.getCurrentVersion(conversationId);
    
    // Check in-process cache
    const cached = this.memoryCache.get(conversationId);
    if (cached && cached.version === currentVersion) {
      this.logger.debug({ conversationId, version: currentVersion }, 'participant_cache_hit_memory');
      return cached.userIds;
    }

    // Check Redis cache
    const cacheKey = this.getCacheKey(conversationId, currentVersion);
    const cachedJson = await this.redis.get(cacheKey);
    
    if (cachedJson) {
      const userIds = JSON.parse(cachedJson) as string[];
      
      // Populate in-process cache
      this.memoryCache.set(conversationId, {
        version: currentVersion,
        userIds,
        cachedAt: Date.now(),
      });
      
      this.logger.debug({ conversationId, version: currentVersion }, 'participant_cache_hit_redis');
      return userIds;
    }

    // Cache miss - caller must fetch from DB
    this.logger.debug({ conversationId, version: currentVersion }, 'participant_cache_miss');
    return [];
  }

  /**
   * Set participant cache for a conversation
   */
  async set(conversationId: string, userIds: string[]): Promise<void> {
    const currentVersion = await this.getCurrentVersion(conversationId);
    const cacheKey = this.getCacheKey(conversationId, currentVersion);
    
    // Store in Redis with TTL
    await this.redis.setex(cacheKey, this.ttlSeconds, JSON.stringify(userIds));
    
    // Store in memory
    this.memoryCache.set(conversationId, {
      version: currentVersion,
      userIds,
      cachedAt: Date.now(),
    });

    this.logger.debug({ conversationId, version: currentVersion, count: userIds.length }, 'participant_cache_set');
  }

  /**
   * Invalidate cache for a conversation (increments version)
   * Publishes invalidation message to all consumers
   */
  async invalidate(conversationId: string): Promise<void> {
    // Increment version
    const newVersion = await this.incrementVersion(conversationId);
    
    // Remove from in-process cache
    this.memoryCache.delete(conversationId);
    
    // Publish invalidation message
    const payload = JSON.stringify({ conversationId, version: newVersion });
    await this.redis.publish(this.invalidationChannel, payload);

    this.logger.info({ conversationId, newVersion }, 'participant_cache_invalidated');
  }

  /**
   * Handle invalidation message from pubsub
   */
  private handleInvalidation(conversationId: string, newVersion: number): void {
    const cached = this.memoryCache.get(conversationId);
    
    if (cached && cached.version < newVersion) {
      // Version is stale, remove from memory
      this.memoryCache.delete(conversationId);
      this.logger.debug({ conversationId, oldVersion: cached.version, newVersion }, 'participant_cache_invalidation_applied');
    }
  }

  /**
   * Get current version counter for a conversation
   */
  private async getCurrentVersion(conversationId: string): Promise<number> {
    const versionKey = this.getVersionKey(conversationId);
    const version = await this.redis.get(versionKey);
    return version ? parseInt(version, 10) : 1;
  }

  /**
   * Increment version counter
   */
  private async incrementVersion(conversationId: string): Promise<number> {
    const versionKey = this.getVersionKey(conversationId);
    return await this.redis.incr(versionKey);
  }

  /**
   * Get cache key for a conversation at a specific version
   */
  private getCacheKey(conversationId: string, version: number): string {
    return `conv:${conversationId}:participants:v${version}`;
  }

  /**
   * Get version counter key
   */
  private getVersionKey(conversationId: string): string {
    return `conv:${conversationId}:part:ver`;
  }

  /**
   * Get cache stats for monitoring
   */
  getStats(): { size: number; entries: Array<{ conversationId: string; version: number; age: number }> } {
    const entries = Array.from(this.memoryCache.entries()).map(([conversationId, entry]) => ({
      conversationId,
      version: entry.version,
      age: Date.now() - entry.cachedAt,
    }));

    return {
      size: this.memoryCache.size,
      entries,
    };
  }
}

/**
 * Create participant cache instance
 */
export function createParticipantCache(options: ParticipantCacheOptions): ParticipantCache {
  return new ParticipantCache(options);
}

