import { describe, it, expect } from "vitest";
import {
  StorageError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  QuotaExceededError,
  ValidationFailedError,
  PreconditionFailedError,
  ConsistencyError,
  ChecksumMismatchError,
  EncryptionError,
  TransientAdapterError,
  PermanentAdapterError,
  TimeoutError,
} from "../src/errors";

describe("errors", () => {
  it("constructs storage errors with proper codes and metadata", () => {
    const cases = [
      [new NotFoundError("x", { a: 1 }), "NOT_FOUND"],
      [new ConflictError("x", { a: 1 }), "CONFLICT"],
      [new UnauthorizedError("x", { a: 1 }), "UNAUTHORIZED"],
      [new ForbiddenError("x", { a: 1 }), "FORBIDDEN"],
      [new QuotaExceededError("x", { a: 1 }), "QUOTA_EXCEEDED"],
      [new ValidationFailedError("x", { a: 1 }), "VALIDATION_FAILED"],
      [new PreconditionFailedError("x", { a: 1 }), "PRECONDITION_FAILED"],
      [new ConsistencyError("x", { a: 1 }), "CONSISTENCY_ERROR"],
      [new ChecksumMismatchError("x", { a: 1 }), "CHECKSUM_MISMATCH"],
      [new TimeoutError("x", { a: 1 }), "TIMEOUT"],
    ] as const;

    for (const [err, code] of cases) {
      expect(err).toBeInstanceOf(StorageError);
      expect((err as StorageError).code).toBe(code);
      expect((err as StorageError).metadata?.a).toBe(1);
    }
  });

  it("supports cause on Encryption/Transient/Permanent adapter errors", () => {
    const cause = new Error("cause");
    const e1 = new EncryptionError("enc", { x: 1 }, cause);
    const e2 = new TransientAdapterError("transient", { x: 1 }, cause);
    const e3 = new PermanentAdapterError("permanent", { x: 1 }, cause);

    for (const err of [e1, e2, e3]) {
      expect(err).toBeInstanceOf(StorageError);
      expect((err as StorageError).cause).toBe(cause);
    }
  });

  it("defaults NotFoundError message to 'Storage object not found'", () => {
    const err = new NotFoundError();
    expect(err.message).toMatch(/Storage object not found/);
  });
});



