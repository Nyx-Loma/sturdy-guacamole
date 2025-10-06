# `@sanctum/storage` Error Model (Phase 1)

## Objectives
- Provide a predictable, typed error hierarchy for consumer handling.
- Encode actionable metadata for observability, auditing, and compliance.
- Align with Sanctum platform error conventions (`code`, `message`, `metadata`).

## Error Taxonomy

| Error Class              | Code                       | Typical Cause                                | Recommended Handling                               |
|--------------------------|---------------------------|----------------------------------------------|-----------------------------------------------------|
| `NotFoundError`          | `NOT_FOUND`               | Object/version missing                        | Surface 404, offer retry with adjusted input        |
| `ConflictError`          | `CONFLICT`                | Concurrency conflict (ETag mismatch)          | Retry with fresh version, escalate to UI conflict   |
| `UnauthorizedError`      | `UNAUTHORIZED`            | Missing/invalid auth credentials               | Refresh session, reauthenticate                     |
| `ForbiddenError`         | `FORBIDDEN`               | ACL denies action                              | Log & audit, notify caller                          |
| `QuotaExceededError`     | `QUOTA_EXCEEDED`          | Namespace exceeds quota                        | Enforce limits, communicate plan upgrade            |
| `ValidationFailedError`  | `VALIDATION_FAILED`       | Schema/ACL/payload validation failure          | Fix input, provide detailed validation errors       |
| `PreconditionFailedError`| `PRECONDITION_FAILED`     | If-Match / version precondition not satisfied   | Prompt client to refresh version and retry          |
| `ConsistencyError`       | `CONSISTENCY_ERROR`       | Cache vs source mismatch, stale version, split brain | Trigger cache purge, raise alert, block mutation |
| `ChecksumMismatchError`  | `CHECKSUM_MISMATCH`       | Payload checksum validation failure             | Fail closed, alert security/ops, investigate integrity |
| `EncryptionError`        | `ENCRYPTION_ERROR`        | Crypto envelope failure, key rotation issues   | Escalate to security, fail closed, alert           |
| `TransientAdapterError`  | `TRANSIENT_ADAPTER_ERROR` | Network/timeout/backing store hiccup           | Retry with backoff; triggers circuit breaker        |
| `PermanentAdapterError`  | `PERMANENT_ADAPTER_ERROR` | Misconfiguration, schema drift, fatal backend  | Alert SRE, require manual intervention              |
| `TimeoutError`           | `TIMEOUT`                 | Operation exceeded configured timeout          | Retry if idempotent, consider raising timeout limit |
| `StorageError`           | `UNKNOWN`                 | Catch-all / migration placeholder              | Log & escalate; should be rare                      |

## Error Shape
- `message: string`
- `code: StorageErrorCode`
- `metadata?: Record<string, unknown>`
- `cause?: unknown`

### Metadata Guidelines
- Include `namespace`, `objectId`, `versionId`, `operation`, `adapter`, `tenantId`, `requestId` where applicable.
- Avoid leaking sensitive payload data; log IDs/hashes only.
- Provide `retryable: boolean` flag for transient vs permanent errors.

## Mapping to HTTP
- 404 → `NotFoundError`
- 409 → `ConflictError`
- 401 → `UnauthorizedError`
- 403 → `ForbiddenError`
- 429/507 → `QuotaExceededError`
- 422 → `ValidationFailedError`
- 412 → `PreconditionFailedError`
- 409/428 → `ConsistencyError`
- 422/500 → `ChecksumMismatchError`
- 500 → `PermanentAdapterError`/`EncryptionError`/`StorageError`
- 503 → `TransientAdapterError`/`TimeoutError`

## Observability Integration
- Emit structured logs: `{ level: "error", code, metadata, cause }`
- Metrics counter: `storage.errors` tagged with `code`, `adapter`, `namespace`.
- Tracing: record error event with attributes `storage.error_code`, `storage.namespace`.

## Testing Requirements
- Unit tests per error verifying code + metadata propagation.
- Contract tests assert adapters translate backend-specific errors to canonical types.
- Fuzz tests ensure metadata serialization handles unexpected values safely.

## Open Items
- Determine standardized `metadata.validationErrors` shape (JSON schema?).
- Align quota errors with billing service error taxonomy.
- Define circuit-breaker behavior for repeated `TransientAdapterError`s.

