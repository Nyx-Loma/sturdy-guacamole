import type {
  StorageContext,
  StorageDeleteOptions,
  StorageHealthStatus,
  StorageListQuery,
  StorageListResult,
  StorageObject,
  StorageObjectReference,
  StorageReadOptions,
  StorageWriteOptions,
  StorageStreamCursor,
  StorageStreamMessage,
} from "../types";

export interface AdapterInitOptions {
  context?: StorageContext;
  signal?: AbortSignal;
}

export interface AdapterHealthCheckOptions {
  signal?: AbortSignal;
}

export interface BlobAdapter {
  readonly kind: "blob";
  init(options?: AdapterInitOptions): Promise<void>;
  write(
    ref: StorageObjectReference,
    payload: Buffer | Uint8Array,
    options: StorageWriteOptions,
    context: StorageContext
  ): Promise<StorageObject<Buffer>>;
  read(
    ref: StorageObjectReference,
    options: StorageReadOptions,
    context: StorageContext
  ): Promise<StorageObject<Buffer>>;
  delete(ref: StorageObjectReference, options: StorageDeleteOptions, context: StorageContext): Promise<void>;
  list(query: StorageListQuery, context: StorageContext): Promise<StorageListResult>;
  healthCheck?(options?: AdapterHealthCheckOptions): Promise<StorageHealthStatus>;
  dispose?(): Promise<void>;
}

export interface RecordAdapter {
  readonly kind: "record";
  init(options?: AdapterInitOptions): Promise<void>;
  upsert<T extends Record<string, unknown>>(
    namespace: string,
    record: T,
    options: StorageWriteOptions,
    context: StorageContext
  ): Promise<T>;
  get<T extends Record<string, unknown>>(
    reference: StorageObjectReference,
    options: StorageReadOptions,
    context: StorageContext
  ): Promise<T>;
  delete(reference: StorageObjectReference, options: StorageDeleteOptions, context: StorageContext): Promise<void>;
  query<T extends Record<string, unknown>>(
    namespace: string,
    query: Record<string, unknown>,
    options: StorageReadOptions & { pagination?: { cursor?: string; limit?: number } },
    context: StorageContext
  ): Promise<StorageQueryResponse<T>>;
  healthCheck?(options?: AdapterHealthCheckOptions): Promise<StorageHealthStatus>;
  dispose?(): Promise<void>;
}

export interface StreamAdapter {
  readonly kind: "stream";
  init(options?: AdapterInitOptions): Promise<void>;
  publish(
    message: StorageStreamMessage,
    options: StorageWriteOptions,
    context: StorageContext
  ): Promise<StorageStreamMessage>;
  subscribe(
    stream: string,
    options: { cursor?: StorageStreamCursor; batchSize?: number; signal?: AbortSignal },
    context: StorageContext
  ): AsyncIterable<StorageStreamMessage>;
  commitCursor(cursor: StorageStreamCursor, context: StorageContext): Promise<void>;
  healthCheck?(options?: AdapterHealthCheckOptions): Promise<StorageHealthStatus>;
  dispose?(): Promise<void>;
}

export type StorageAdapter = BlobAdapter | RecordAdapter | StreamAdapter;

export interface AdapterRegistry {
  register(adapter: StorageAdapter): void;
  getBlobAdapter(namespace: string): BlobAdapter | undefined;
  getRecordAdapter(namespace: string): RecordAdapter | undefined;
  getStreamAdapter(namespace: string): StreamAdapter | undefined;
}

