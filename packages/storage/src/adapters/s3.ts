import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import type { AdapterHealthCheckOptions, BlobAdapter, StorageContext } from "./base";
import type {
  StorageObject,
  StorageObjectReference,
  StorageReadOptions,
  StorageWriteOptions,
  StorageDeleteOptions,
  StorageListQuery,
  StorageListResult,
  StorageHealthStatus,
} from "../types";
import {
  NotFoundError,
  StorageError,
  TimeoutError,
  TransientAdapterError,
} from "../errors";
import { retry } from "../utils/retry";
import { CircuitBreaker } from "../utils/circuitBreaker";

export interface S3AdapterOptions {
  clientConfig: S3ClientConfig;
  bucket: string;
  forcePathStyle?: boolean;
  region?: string;
}

export class S3BlobAdapter implements BlobAdapter {
  public readonly kind = "blob" as const;

  private readonly options: S3AdapterOptions;
  private client: S3Client;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(options: S3AdapterOptions) {
    this.options = options;
    this.client = new S3Client({
      forcePathStyle: options.forcePathStyle,
      region: options.region,
      ...options.clientConfig,
    });
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      successThreshold: 1,
      resetTimeoutMs: 5_000,
    });
  }

  async init(): Promise<void> {
    await this.execute("head_bucket", async () => {
      await this.client.send(new HeadBucketCommand({ Bucket: this.options.bucket }));
    });
  }

  async write(
    ref: StorageObjectReference,
    payload: Buffer | Uint8Array,
    options: StorageWriteOptions,
    context?: StorageContext
  ): Promise<StorageObject<Buffer>> {
    void context;
    const key = this.objectKey(ref);
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    const checksum = this.calculateChecksum(body);
    const attempts = options.retryCount ?? 3;

    const result = await this.execute(
      "put_object",
      async () =>
        this.client.send(
          new PutObjectCommand({
            Bucket: this.options.bucket,
            Key: key,
            Body: body,
            ContentType: options.contentType,
            Metadata: {
              checksum,
              checksumAlgorithm: "sha256",
              ...(options.metadata ? this.stringifyMetadata(options.metadata) : {}),
            },
            ...(options.concurrencyToken ? { IfMatch: options.concurrencyToken } : {}),
          })
        ),
      attempts
    );

    return {
      id: ref.id,
      namespace: ref.namespace,
      payload: body,
      metadata: {
        checksum,
        checksumAlgorithm: "sha256",
        contentType: options.contentType ?? "application/octet-stream",
        size: body.byteLength,
        createdAt: new Date(),
        updatedAt: new Date(),
        versionId: this.resolveVersionId(result?.VersionId, result?.ETag) ?? this.fallbackVersionId(ref, checksum),
        custom: options.metadata,
      },
    };
  }

  async read(
    ref: StorageObjectReference,
    options: StorageReadOptions,
    context?: StorageContext
  ): Promise<StorageObject<Buffer>> {
    void context;
    const key = this.objectKey(ref);
    const result = await this.execute(
      "get_object",
      async () => this.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: key })),
      options.retryCount ?? 3
    );

    const body = result.Body;
    if (!body) {
      throw new StorageError("S3 object stream missing", {
        code: "UNKNOWN",
        metadata: { key },
      });
    }
    const payload = await this.streamToBuffer(body as Readable);
    const checksum = result.Metadata?.checksum ?? this.calculateChecksum(payload);

    return {
      id: ref.id,
      namespace: ref.namespace,
      payload,
      metadata: {
        checksum,
        checksumAlgorithm: result.Metadata?.checksumAlgorithm ?? "sha256",
        contentType: result.ContentType ?? "application/octet-stream",
        size: payload.byteLength,
        createdAt: result.LastModified ?? new Date(),
        updatedAt: result.LastModified ?? new Date(),
        versionId:
          this.resolveVersionId(result.VersionId, result.ETag, options?.consistency)
            ?? this.fallbackVersionId(ref, checksum),
        custom: result.Metadata ? this.parseMetadata(result.Metadata) : undefined,
      },
    };
  }

  async delete(ref: StorageObjectReference, options: StorageDeleteOptions, context?: StorageContext): Promise<void> {
    void context;
    const key = this.objectKey(ref);
    await this.execute(
      "delete_object",
      async () => this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key })),
      options.retryCount ?? 3
    );
  }

  async list(query: StorageListQuery, context?: StorageContext): Promise<StorageListResult> {
    void context;
    const prefix = this.namespacePrefix(query.namespace, query.prefix);
    const result = await this.execute(
      "list_objects",
      async () =>
        this.client.send(
          new ListObjectsV2Command({
            Bucket: this.options.bucket,
            Prefix: prefix,
            ContinuationToken: query.cursor,
            MaxKeys: query.limit,
          })
        ),
      3
    );

    return {
      objects:
        result.Contents?.map((item) => ({
          id: item.Key?.split("/").pop() ?? "",
          namespace: query.namespace,
          versionId: item.ETag ? this.stripQuotes(item.ETag) : undefined,
        })) ?? [],
      nextCursor: result.NextContinuationToken,
    };
  }

  async healthCheck(options?: AdapterHealthCheckOptions): Promise<StorageHealthStatus> {
    void options;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.options.bucket }));
      return { healthy: true };
    } catch (error) {
      return { healthy: false, details: { error: (error as Error).message } };
    }
  }

  async dispose(): Promise<void> {
    this.client.destroy();
  }

  private objectKey(ref: StorageObjectReference): string {
    return `${ref.namespace}/${ref.id}`;
  }

  private namespacePrefix(namespace: string, prefix?: string): string {
    return prefix ? `${namespace}/${prefix}` : `${namespace}/`;
  }

  private async execute<T>(operation: string, fn: () => Promise<T>, attempts: number): Promise<T> {
    const run = async (): Promise<T> => {
      if (!this.circuitBreaker.shouldAllow()) {
        throw new TransientAdapterError(`S3 circuit open for ${operation}`);
      }
      try {
        const result = await fn();
        this.circuitBreaker.recordSuccess();
        return result;
      } catch (error) {
        this.circuitBreaker.recordFailure();
        throw this.mapS3Error(error, operation);
      }
    };

    return retry(run, {
      attempts,
      baseDelayMs: 200,
      maxDelayMs: 2_000,
      shouldRetry: (error) => this.isRetryable(error),
    });
  }

  private mapS3Error(error: unknown, operation: string): Error {
    if (error instanceof StorageError || error instanceof TimeoutError) {
      return error;
    }
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number }; $retryable?: { throttling?: boolean } };
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
      return new NotFoundError("S3 object not found", { operation });
    }
    if (err?.name === "TimeoutError") {
      return new TimeoutError("S3 request timed out", { metadata: { operation } });
    }
    if (err?.$retryable?.throttling) {
      return new TransientAdapterError("S3 throttled request", { metadata: { operation } });
    }
    if (error instanceof Error) {
      return error;
    }
    return new StorageError("Unknown S3 error", {
      code: "UNKNOWN",
      metadata: { operation },
    });
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof TimeoutError || error instanceof TransientAdapterError) {
      return true;
    }
    const err = error as { $retryable?: { throttling?: boolean } };
    return Boolean(err?.$retryable?.throttling);
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
  }

  private stringifyMetadata(metadata: Record<string, unknown>): Record<string, string> {
    const entries = Object.entries(metadata).map(([key, value]) => [key, String(value)] as [string, string]);
    return Object.fromEntries(entries);
  }

  private parseMetadata(metadata: Record<string, string>): Record<string, unknown> {
    const entries = Object.entries(metadata).filter(([key]) => !["checksum", "checksumAlgorithm"].includes(key));
    return entries.length ? Object.fromEntries(entries) : {};
  }

  private calculateChecksum(payload: Buffer): string {
    return createHash("sha256").update(payload).digest("hex");
  }

  private resolveVersionId(versionId?: string, etag?: string, consistency?: StorageReadOptions["consistency"]): string | undefined {
    if (versionId && versionId.length > 0) {
      return versionId;
    }
    if (consistency === "strong" && !etag) {
      return undefined;
    }
    if (etag) {
      return this.stripQuotes(etag);
    }
    return undefined;
  }

  private stripQuotes(value?: string): string | undefined {
    if (!value) return undefined;
    return value.replace(/^"|"$/g, "");
  }

  private fallbackVersionId(ref: StorageObjectReference, checksum: string): string {
    return `${ref.namespace}:${ref.id}:${checksum}:${randomUUID()}`;
  }
}

