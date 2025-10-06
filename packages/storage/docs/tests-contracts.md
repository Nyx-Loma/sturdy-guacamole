# Contract & Golden Test Plan – `@sanctum/storage`

## Blob Storage
- **Write → Strong Read**: After `putBlob`, `readBlob` with `consistency: "strong"` returns new version ≤100ms or throws `ConsistencyError`.
- **Delete → Read**: `deleteBlob` followed by strong read yields `NotFoundError`; eventual read allows ghost within TTL.
- **Checksum Verification**: Read payload checksum matches metadata `checksum`.
- **Checksum Mismatch**: Corrupt stored payload results in `ChecksumMismatchError` surfaced to caller.

## Record Storage
- **Optimistic Upsert**: `upsertRecord` with stale `concurrencyToken` yields `ConflictError` (maps to HTTP 412).
- **Schema Validation**: Invalid record schema triggers `ValidationFailedError`.
- **Query Pagination**: Deterministic cursor progression with `limit` and stable ordering (no duplicates/skips even with concurrent inserts).

## Stream Storage
- **At-least-once Delivery**: Fault injection duplicates messages; consumer idempotency verified.
- **Checkpoint Durability**: `commitStreamCursor` persists position across process restarts (resume from committed cursor, not beginning).
- **Backpressure Handling**: Subscriber respects `batchSize`; latency bounded even with slow consumer.

## Cache Behavior
- **Bypass Freshness**: `readBlob` with `bypassCache` returns backend payload even if cache poisoned.
- **Invalidation**: `putBlob` & `deleteBlob` purge cache entries; eventual reads may see stale data only within TTL window.
- **TTL Expiry**: Eventual read returns stale object until TTL expires; subsequent read returns fresh payload.

## Error Mapping
- Backends map to canonical errors:
  - S3 404 → `NotFoundError`
  - Postgres unique violation → `ConflictError`
  - Redis timeout → `TransientAdapterError`
  - Crypto failure → `EncryptionError`
  - Cache mismatch → `ConsistencyError`

## Retry Policy
- `TransientAdapterError`/`TimeoutError`: retry with exponential backoff + jitter (3 attempts default).
- `ConsistencyError`: retry allowed when `consistency: "strong"` and `bypassCache` true.
- `EncryptionError`: fail closed; no retries.
- Golden test validates retry scheduler emits three attempts with backoff and jitter for transient errors.
- Ensure encryption failures are not retried.

## Seed Tests (Phase 1 Requirement)
1. Blob strong read consistency (write → read new version or `ConsistencyError`).
2. Record upsert stale token → `ConflictError`.
3. Stream duplicate delivery; verify idempotent consumer behavior.
4. Cache bypass returns fresh data when cache corrupted.

