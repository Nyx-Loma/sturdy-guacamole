import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import IORedis, { type Redis } from "ioredis";
import type { CacheEnvelope } from "./cacheManager";

export interface RedisCacheOptions {
  redisUrl: string;
  namespace?: string;
  ttlSeconds?: number;
  fanoutChannel?: string;
  stalenessBudgetMs?: number;
}

export interface CacheEntry<T> {
  value: T;
  ttlSeconds?: number;
}

export class RedisCache<T = unknown> extends EventEmitter {
  private readonly options: Required<RedisCacheOptions>;
  private readonly redis: Redis;
  private readonly subscriber: Redis;
  private readonly instanceId = randomUUID();

  constructor(options: RedisCacheOptions) {
    super();
    this.options = {
      namespace: "cache",
      ttlSeconds: 60,
      fanoutChannel: "cache-invalidation",
      stalenessBudgetMs: 100,
      ...options,
    } as Required<RedisCacheOptions>;

    this.redis = new IORedis(this.options.redisUrl, { lazyConnect: true });
    this.subscriber = new IORedis(this.options.redisUrl, { lazyConnect: true });
  }

  async init(): Promise<void> {
    await this.redis.connect();
    await this.subscriber.connect();
    await this.subscriber.subscribe(this.options.fanoutChannel);
    this.subscriber.on("message", (_, message) => this.handleFanout(message));
  }

  async dispose(): Promise<void> {
    await this.subscriber.quit();
    await this.redis.quit();
  }

  async get(key: string): Promise<CacheEnvelope<T> | undefined> {
    const namespaced = this.namespacedKey(key);
    const raw = await this.redis.get(namespaced);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as CacheEnvelope<T>;
    } catch {
      return undefined;
    }
  }

  async set(key: string, entry: CacheEntry<CacheEnvelope<T>>): Promise<void> {
    const namespaced = this.namespacedKey(key);
    const ttl = entry.ttlSeconds ?? this.options.ttlSeconds;
    const payload = JSON.stringify(entry.value);
    if (ttl > 0) {
      await this.redis.set(namespaced, payload, "EX", ttl);
    } else {
      await this.redis.set(namespaced, payload);
    }
    await this.fanoutInvalidation(key);
  }

  async delete(key: string): Promise<void> {
    const namespaced = this.namespacedKey(key);
    await this.redis.del(namespaced);
    await this.fanoutInvalidation(key);
  }

  private async fanoutInvalidation(key: string): Promise<void> {
    const payload = JSON.stringify({ key, origin: this.instanceId });
    await this.redis.publish(this.options.fanoutChannel, payload);
  }

  private handleFanout(message: string): void {
    try {
      const payload = JSON.parse(message) as { key: string; origin: string };
      if (payload.origin === this.instanceId) return;
      this.emit("invalidate", payload.key);
    } catch {
      // ignore
    }
  }

  private namespacedKey(key: string): string {
    return `${this.options.namespace}:${key}`;
  }
}

