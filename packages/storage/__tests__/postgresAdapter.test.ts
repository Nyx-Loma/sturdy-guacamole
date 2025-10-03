import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostgresRecordAdapter } from "../src/adapters/postgres";
import {
  NotFoundError,
  PreconditionFailedError,
  StorageError,
  TimeoutError,
} from "../src/errors";

const connectMock = vi.fn();
const endMock = vi.fn();
const circuitShouldAllow = vi.fn();
const circuitSuccess = vi.fn();
const circuitFailure = vi.fn();
const client = {
  query: vi.fn(),
  release: vi.fn(),
};

function createAdapter() {
  const adapter = new PostgresRecordAdapter({ dsn: "postgres://localhost/test" });
  Object.assign(adapter as unknown as {
    pool: { connect: typeof connectMock; end: typeof endMock };
    circuitBreaker: {
      shouldAllow: typeof circuitShouldAllow;
      recordSuccess: typeof circuitSuccess;
      recordFailure: typeof circuitFailure;
    };
  }, {
    pool: { connect: connectMock, end: endMock },
    circuitBreaker: {
      shouldAllow: circuitShouldAllow,
      recordSuccess: circuitSuccess,
      recordFailure: circuitFailure,
    },
  });
  return adapter;
}

beforeEach(() => {
  connectMock.mockReset();
  connectMock.mockResolvedValue(client);
  endMock.mockReset();
  circuitShouldAllow.mockReset().mockReturnValue(true);
  circuitSuccess.mockReset();
  circuitFailure.mockReset();
  client.query.mockReset();
  client.release.mockReset();
});

describe("PostgresRecordAdapter", () => {
  it("creates schema, table, and index during init", async () => {
    client.query
      .mockResolvedValueOnce({} as unknown)
      .mockResolvedValueOnce({} as unknown)
      .mockResolvedValueOnce({} as unknown);

    const adapter = createAdapter();
    await adapter.init();

    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls[0][0]).toContain("CREATE SCHEMA IF NOT EXISTS \"storage\"");
    expect(client.query.mock.calls[1][0]).toContain("CREATE TABLE IF NOT EXISTS \"storage\".\"records\"");
    expect(client.query.mock.calls[2][0]).toContain("CREATE INDEX IF NOT EXISTS \"storage\".");
    expect(client.release).toHaveBeenCalled();
  });

  it("upserts records without concurrency token", async () => {
    client.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ data: { id: "abc", value: 42 } }],
    } as unknown);

    const adapter = createAdapter();
    const result = await adapter.upsert("ns", { id: "abc", value: 42 }, {}, undefined);

    expect(result).toEqual({ id: "abc", value: 42 });
    expect(client.query).toHaveBeenCalledTimes(1);
    const [[query]] = client.query.mock.calls;
    expect(query.text).toContain("INSERT INTO \"storage\".\"records\"");
    expect(query.values?.slice(0, 2)).toEqual(["ns", "abc"]);
  });

  it("throws PreconditionFailedError when concurrency token mismatch", async () => {
    client.query.mockResolvedValueOnce({ rowCount: 0, rows: [] } as unknown);

    const adapter = createAdapter();

    await expect(
      adapter.upsert("ns", { id: "abc", value: 1 }, { concurrencyToken: "v1" }, undefined)
    ).rejects.toBeInstanceOf(PreconditionFailedError);
  });

  it("throws PreconditionFailedError when delete version mismatch", async () => {
    client.query.mockResolvedValueOnce({ rowCount: 0 } as unknown);

    const adapter = createAdapter();

    await expect(
      adapter.delete({ namespace: "ns", id: "abc" }, { concurrencyToken: "v1" }, undefined)
    ).rejects.toBeInstanceOf(PreconditionFailedError);
  });

  it("throws NotFoundError when record absent", async () => {
    client.query.mockResolvedValueOnce({ rowCount: 0, rows: [] } as unknown);

    const adapter = createAdapter();

    await expect(
      adapter.get({ namespace: "ns", id: "missing" }, {}, undefined)
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps postgres timeout errors to TimeoutError", async () => {
    const error = { code: "57014" };
    client.query.mockRejectedValue(error);

    const adapter = createAdapter();

    await expect(
      adapter.get({ namespace: "ns", id: "slow" }, {}, undefined)
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it("throws when record id is missing", async () => {
    const adapter = createAdapter();
    await expect(adapter.upsert("ns", { value: 1 } as unknown as { id: string }, {}, undefined)).rejects.toBeInstanceOf(
      StorageError
    );
  });

  it("rejects invalid schema identifiers", () => {
    expect(() => new PostgresRecordAdapter({ dsn: "postgres://", schema: "invalid-name" })).toThrow(StorageError);
  });
});


