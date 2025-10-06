import { randomUUID } from "node:crypto";
import { Pool, type QueryResult } from "pg";
import type {
  RecordAdapter,
  StorageContext,
} from "./base";
import type {
  StorageObjectReference,
  StorageReadOptions,
  StorageWriteOptions,
  StorageDeleteOptions,
  StorageQueryResponse,
} from "../types";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
  StorageError,
  TimeoutError,
} from "../errors";
import { retry } from "../utils/retry";
import { CircuitBreaker } from "../utils/circuitBreaker";

export interface PostgresAdapterOptions {
  dsn: string;
  schema?: string;
  table?: string;
  statementTimeoutMs?: number;
}

interface StoredRecord<T extends Record<string, unknown>> {
  id: string;
  namespace: string;
  data: T;
  version_id: string;
}

export class PostgresRecordAdapter implements RecordAdapter {
  public readonly kind = "record" as const;

  private readonly options: Required<PostgresAdapterOptions>;
  private readonly pool: Pool;
  private readonly schemaIdentifier: string;
  private readonly tableIdentifier: string;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(options: PostgresAdapterOptions) {
    this.options = {
      schema: "storage",
      table: "records",
      statementTimeoutMs: 5_000,
      ...options,
    } as Required<PostgresAdapterOptions>;

    this.schemaIdentifier = this.quoteIdentifier(this.options.schema);
    this.tableIdentifier = this.quoteIdentifier(this.options.table);

    this.pool = new Pool({
      connectionString: this.options.dsn,
      statement_timeout: this.options.statementTimeoutMs,
    });

    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 5_000,
      successThreshold: 2,
    });
  }

  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${this.schemaIdentifier}`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.fqTable()} (
          namespace TEXT NOT NULL,
          id TEXT NOT NULL,
          version_id TEXT NOT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (namespace, id)
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS ${this.fqIndex("records_namespace_idx")} ON ${this.fqTable()} (namespace);
      `);
    } finally {
      client.release();
    }
  }

  async upsert<T extends Record<string, unknown>>(
    namespace: string,
    record: T,
    options: StorageWriteOptions,
    context?: StorageContext
  ): Promise<T> {
    void context;
    const id = this.extractId(record);
    const newVersionId = randomUUID();

    if (options.concurrencyToken) {
      const result = await this.execute<StoredRecord<T>>(
        `
          UPDATE ${this.fqTable()}
             SET data = $3,
                 version_id = $4,
                 updated_at = NOW()
           WHERE namespace = $1
             AND id = $2
             AND version_id = $5
        RETURNING *
        `,
        [namespace, id, record, newVersionId, options.concurrencyToken]
      );

      if (result.rowCount === 0) {
        throw new PreconditionFailedError("Record version mismatch", { namespace, id });
      }

      return result.rows[0].data;
    }

    const result = await this.execute<StoredRecord<T>>(
      `
        INSERT INTO ${this.fqTable()} (namespace, id, version_id, data)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (namespace, id)
        DO UPDATE SET
          data = EXCLUDED.data,
          version_id = EXCLUDED.version_id,
          updated_at = NOW()
        RETURNING *
      `,
      [namespace, id, newVersionId, record]
    );

    if (result.rowCount === 0) {
      throw new StorageError("Failed to upsert record", { code: "UNKNOWN", metadata: { namespace, id } });
    }

    return result.rows[0].data;
  }

  async get<T extends Record<string, unknown>>(
    reference: StorageObjectReference,
    options: StorageReadOptions,
    context?: StorageContext
  ): Promise<T> {
    void options;
    void context;
    const result = await this.execute<StoredRecord<T>>(
      `SELECT * FROM ${this.fqTable()} WHERE namespace = $1 AND id = $2`,
      [reference.namespace, reference.id]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError("Record not found", { reference });
    }

    return result.rows[0].data;
  }

  async delete(reference: StorageObjectReference, options: StorageDeleteOptions, context?: StorageContext): Promise<void> {
    void options;
    void context;
    const values: unknown[] = [reference.namespace, reference.id];
    let statement = `DELETE FROM ${this.fqTable()} WHERE namespace = $1 AND id = $2`;
    if (options?.concurrencyToken) {
      values.push(options.concurrencyToken);
      statement += ` AND version_id = $3`;
    }

    const result = await this.execute(statement, values);

    if (result.rowCount === 0) {
      if (options?.concurrencyToken) {
        throw new PreconditionFailedError("Record version mismatch on delete", {
          namespace: reference.namespace,
          id: reference.id,
        });
      }
      throw new NotFoundError("Record not found", { reference });
    }
  }

  async query<T extends Record<string, unknown>>(
    namespace: string,
    query: Record<string, unknown>,
    options: StorageReadOptions & { pagination?: { cursor?: string; limit?: number } }
  ): Promise<StorageQueryResponse<T>> {
    void query;
    const limit = options.pagination?.limit ?? 50;
    const cursor = options.pagination?.cursor
      ? JSON.parse(Buffer.from(options.pagination.cursor, "base64").toString("utf8"))
      : undefined;

    const values: unknown[] = [namespace];
    let whereClause = `namespace = $1`;
    if (cursor?.lastId) {
      values.push(cursor.lastId);
      whereClause += ` AND id > $${values.length}`;
    }

    const result = await this.execute<StoredRecord<T>>(
      `SELECT * FROM ${this.fqTable()} WHERE ${whereClause} ORDER BY id ASC LIMIT $${values.length + 1}`,
      [...values, limit + 1]
    );

    const rows = result.rows.slice(0, limit);
    const nextCursor = result.rows.length > limit
      ? Buffer.from(JSON.stringify({ lastId: rows[rows.length - 1].id }), "utf8").toString("base64")
      : undefined;

    return {
      items: rows.map((row) => row.data),
      nextCursor,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: Record<string, unknown> }> {
    try {
      await this.execute("SELECT 1", []);
      return { healthy: true };
    } catch (error) {
      return { healthy: false, details: { error } };
    }
  }

  async dispose(): Promise<void> {
    await this.pool.end();
  }

  private fqTable(): string {
    return `${this.schemaIdentifier}.${this.tableIdentifier}`;
  }

  private fqIndex(name: string): string {
    return `${this.schemaIdentifier}.${this.quoteIdentifier(name)}`;
  }

  private extractId(record: Record<string, unknown>): string {
    const value = record.id;
    if (typeof value !== "string" || value.length === 0) {
      throw new StorageError("Record must include string id", { code: "VALIDATION_FAILED" });
    }
    return value;
  }

  private async execute<T>(text: string, values: unknown[]): Promise<QueryResult<T>> {
    const perform = async () => {
      if (!this.circuitBreaker.shouldAllow()) {
        throw new StorageError("Postgres circuit open", {
          code: "TRANSIENT_ADAPTER_ERROR",
          metadata: { text },
        });
      }

      const client = await this.pool.connect();
      try {
        const result = await client.query<T>({ text, values });
        this.circuitBreaker.recordSuccess();
        return result;
      } catch (error) {
        const mapped = this.mapPgError(error);
        this.circuitBreaker.recordFailure();
        throw mapped;
      } finally {
        client.release();
      }
    };

    return retry(perform, {
      attempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1_000,
      jitter: true,
      shouldRetry: (error) => error instanceof TimeoutError || this.isTransientError(error),
    });
  }

  private mapPgError(error: unknown): Error {
    const pgError = error as { code?: string; message?: string };
    if (pgError?.code === "57014") {
      return new TimeoutError("Postgres statement timeout", { cause: pgError });
    }
    if (pgError?.code === "23505") {
      return new ConflictError("Postgres unique constraint violation", { cause: pgError });
    }
    if (error instanceof StorageError) {
      return error;
    }
    if (error instanceof Error) {
      return error;
    }
    return new StorageError("Unknown Postgres error", {
      code: "UNKNOWN",
      metadata: { error: pgError?.message ?? String(error) },
    });
  }

  private isTransientError(error: unknown): boolean {
    const pgError = error as { code?: string };
    return pgError?.code === "40001" || pgError?.code === "40P01" || pgError?.code === "57014";
  }

  private quoteIdentifier(identifier: string): string {
    if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
      throw new StorageError("Invalid identifier", {
        code: "VALIDATION_FAILED",
        metadata: { identifier },
      });
    }
    return `"${identifier}"`;
  }
}

