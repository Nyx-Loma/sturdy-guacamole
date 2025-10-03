import type { CacheEnvelope } from "./cacheManager";

interface MemoryCacheEntry<T> {
  value: CacheEnvelope<T>;
  expiresAt?: number;
}

export interface MemoryCacheOptions {
  maxItems?: number;
  ttlSeconds?: number;
}

export class MemoryCache<T = unknown> {
  private readonly options: Required<MemoryCacheOptions>;
  private readonly store = new Map<string, MemoryCacheEntry<T>>();
  private readonly order: string[] = [];

  constructor(options: MemoryCacheOptions = {}) {
    this.options = {
      maxItems: options.maxItems ?? 1000,
      ttlSeconds: options.ttlSeconds ?? 60,
    };
  }

  async init(): Promise<void> {}

  async dispose(): Promise<void> {
    this.store.clear();
    this.order.length = 0;
  }

  async get(key: string): Promise<CacheEnvelope<T> | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    this.bump(key);
    return entry.value;
  }

  async set(key: string, value: CacheEnvelope<T>, ttlSeconds?: number): Promise<void> {
    if (this.store.size >= this.options.maxItems && !this.store.has(key)) {
      const oldest = this.order.shift();
      if (oldest) this.store.delete(oldest);
    }

    const ttl = ttlSeconds ?? this.options.ttlSeconds;
    const expiresAt = ttl > 0 ? Date.now() + ttl * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
    this.bump(key);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
    const index = this.order.indexOf(key);
    if (index >= 0) this.order.splice(index, 1);
  }

  private bump(key: string): void {
    const index = this.order.indexOf(key);
    if (index >= 0) this.order.splice(index, 1);
    this.order.push(key);
  }
}

