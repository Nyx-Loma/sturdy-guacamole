export type StorageNamespace = string;

export interface StorageContext {
  tenantId: string;
  namespace: StorageNamespace;
  requestId?: string;
  traceId?: string;
  actor?: {
    id: string;
    type: "user" | "service";
    roles?: string[];
  };
  authToken?: string;
  locale?: string;
  metadata?: Record<string, unknown>;
  cachePolicy?: {
    bypass?: boolean;
    ttlSeconds?: number;
    stalenessBudgetMs?: number;
  };
}

export interface StorageMetadata {
  checksum: string;
  checksumAlgorithm: "sha256" | "sha512" | string;
  contentType: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
  versionId: string;
  custom?: Record<string, unknown>;
}

export interface StorageObject<TPayload = Buffer> {
  id: string;
  namespace: StorageNamespace;
  metadata: StorageMetadata;
  payload: TPayload;
}

export interface StorageObjectReference {
  id: string;
  namespace: StorageNamespace;
  versionId?: string;
}

export interface StorageListQuery {
  namespace: StorageNamespace;
  prefix?: string;
  limit?: number;
  cursor?: string;
  includeMetadata?: boolean;
  includeDeleted?: boolean;
  timeoutMs?: number;
}

export interface StorageListResult {
  objects: StorageObjectReference[];
  nextCursor?: string;
}

export type ConsistencyLevel = "strong" | "eventual";

export interface CachePolicy {
  bypass?: boolean;
  ttlSeconds?: number;
  stalenessBudgetMs?: number;
}

export interface StorageReadOptions {
  consistency?: ConsistencyLevel | "cache_only";
  includeMetadata?: boolean;
  timeoutMs?: number;
  bypassCache?: boolean;
  stalenessBudgetMs?: number;
}

export interface StorageWriteOptions {
  encryptionKeyId?: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
  ttlSeconds?: number;
  concurrencyToken?: string;
  auditLabel?: string;
  timeoutMs?: number;
  idempotencyKey?: string;
  retryCount?: number;
  retryReason?: string;
}

export interface StorageDeleteOptions {
  hardDelete?: boolean;
  auditLabel?: string;
  timeoutMs?: number;
  bypassCache?: boolean;
}

export interface StorageStreamMessage<TPayload = unknown> {
  id: string;
  namespace: StorageNamespace;
  stream: string;
  payload: TPayload;
  headers?: Record<string, string>;
  publishedAt: Date;
  acknowledgment?: {
    deliveryGuarantee: "at_least_once" | "at_most_once" | "exactly_once";
  };
}

export interface StorageStreamCursor {
  id: string;
  stream: string;
  namespace: StorageNamespace;
  position: string;
  partition?: string;
  deliveryGuarantee?: "at_least_once" | "at_most_once" | "exactly_once";
}

export interface StorageQueryResponse<T = unknown> {
  items: T[];
  nextCursor?: string;
  totalCount?: number;
}

export interface StorageQuota {
  namespace: StorageNamespace;
  maxBytes: number;
  maxObjects?: number;
  expiresAt?: Date;
}

export interface StorageHealthStatus {
  healthy: boolean;
  details?: Record<string, unknown>;
}

export interface PaginatedQuery {
  cursor?: string;
  limit?: number;
}

