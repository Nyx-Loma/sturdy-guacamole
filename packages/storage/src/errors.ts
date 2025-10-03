export type StorageErrorCode =
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "QUOTA_EXCEEDED"
  | "VALIDATION_FAILED"
  | "PRECONDITION_FAILED"
  | "CONSISTENCY_ERROR"
  | "CHECKSUM_MISMATCH"
  | "ENCRYPTION_ERROR"
  | "TRANSIENT_ADAPTER_ERROR"
  | "PERMANENT_ADAPTER_ERROR"
  | "TIMEOUT"
  | "UNKNOWN";

export class StorageError extends Error {
  public readonly code: StorageErrorCode;
  public readonly cause?: unknown;
  public readonly metadata?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code: StorageErrorCode;
      cause?: unknown;
      metadata?: Record<string, unknown>;
    }
  ) {
    super(message);
    this.name = "StorageError";
    this.code = options.code;
    this.cause = options.cause;
    this.metadata = options.metadata;
  }
}

export class NotFoundError extends StorageError {
  constructor(message = "Storage object not found", metadata?: Record<string, unknown>) {
    super(message, { code: "NOT_FOUND", metadata });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends StorageError {
  constructor(message = "Conflict updating storage object", metadata?: Record<string, unknown>) {
    super(message, { code: "CONFLICT", metadata });
    this.name = "ConflictError";
  }
}

export class UnauthorizedError extends StorageError {
  constructor(message = "Unauthorized access to storage object", metadata?: Record<string, unknown>) {
    super(message, { code: "UNAUTHORIZED", metadata });
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends StorageError {
  constructor(message = "Forbidden access to storage object", metadata?: Record<string, unknown>) {
    super(message, { code: "FORBIDDEN", metadata });
    this.name = "ForbiddenError";
  }
}

export class QuotaExceededError extends StorageError {
  constructor(message = "Storage quota exceeded", metadata?: Record<string, unknown>) {
    super(message, { code: "QUOTA_EXCEEDED", metadata });
    this.name = "QuotaExceededError";
  }
}

export class ValidationFailedError extends StorageError {
  constructor(message = "Storage validation failed", metadata?: Record<string, unknown>) {
    super(message, { code: "VALIDATION_FAILED", metadata });
    this.name = "ValidationFailedError";
  }
}

export class PreconditionFailedError extends StorageError {
  constructor(message = "Storage precondition failed", metadata?: Record<string, unknown>) {
    super(message, { code: "PRECONDITION_FAILED", metadata });
    this.name = "PreconditionFailedError";
  }
}

export class ConsistencyError extends StorageError {
  constructor(message = "Storage consistency violation", metadata?: Record<string, unknown>) {
    super(message, { code: "CONSISTENCY_ERROR", metadata });
    this.name = "ConsistencyError";
  }
}

export class ChecksumMismatchError extends StorageError {
  constructor(message = "Storage checksum mismatch", metadata?: Record<string, unknown>) {
    super(message, { code: "CHECKSUM_MISMATCH", metadata });
    this.name = "ChecksumMismatchError";
  }
}

export class EncryptionError extends StorageError {
  constructor(message = "Storage encryption failure", metadata?: Record<string, unknown>, cause?: unknown) {
    super(message, { code: "ENCRYPTION_ERROR", metadata, cause });
    this.name = "EncryptionError";
  }
}

export class TransientAdapterError extends StorageError {
  constructor(message = "Transient adapter failure", metadata?: Record<string, unknown>, cause?: unknown) {
    super(message, { code: "TRANSIENT_ADAPTER_ERROR", metadata, cause });
    this.name = "TransientAdapterError";
  }
}

export class PermanentAdapterError extends StorageError {
  constructor(message = "Permanent adapter failure", metadata?: Record<string, unknown>, cause?: unknown) {
    super(message, { code: "PERMANENT_ADAPTER_ERROR", metadata, cause });
    this.name = "PermanentAdapterError";
  }
}

export class TimeoutError extends StorageError {
  constructor(message = "Storage operation timed out", metadata?: Record<string, unknown>) {
    super(message, { code: "TIMEOUT", metadata });
    this.name = "TimeoutError";
  }
}

