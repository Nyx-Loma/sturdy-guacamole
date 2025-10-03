# ADR-001: Consistency Semantics for `@sanctum/storage`

## Status
Accepted

## Context
- `@sanctum/storage` spans heterogeneous backends: strongly consistent (e.g., Postgres) and eventually consistent (e.g., S3/MinIO) stores.
- Consumers require deterministic read/write semantics and explicit cache behavior.
- Caching layer introduces the possibility of stale reads; we must expose controls to callers.
- Phase 1 exit criteria demand a documented contract for facade-level consistency and error behavior.

## Decision
- **Default Read Consistency**: The facade defaults to `strong` reads for all operations unless the caller explicitly opts into a weaker mode.
- **Consistency Modes**: All read APIs accept `consistency: "strong" | "eventual" | "cache_only"`.
  - `strong`: bypass cache unless cached entry age ≤ `stalenessBudgetMs` (default 100 ms per namespace, configurable via `StorageConfig.consistency?.stalenessBudgetMs`). `bypassCache: true` always forces a backing adapter read regardless of consistency mode. If the backing store cannot satisfy read-after-write guarantees (e.g., S3 replication delay), the facade throws `ConsistencyError` and advises the caller to retry with jitter.
  - `eventual`: cache-first; stale responses permitted. No `ConsistencyError` is thrown.
  - `cache_only`: never calls the adapter; if no cache entry is present, return `NotFoundError` even when the object exists in the backing store.
- **Write Invalidation**: Successful blob/record writes and deletes synchronously purge relevant cache keys. Distributed caches publish invalidation events asynchronously (Phase 2 implementation detail).
- **Versioning**: All write operations return `{ version, etag }`. Strong reads may include `If-Match: <etag | version>`; if the precondition fails, raise `PreconditionFailedError` (maps to HTTP 412). `ConflictError` remains reserved for concurrent write/write races.
- **Checksum Enforcement**: Facade recomputes payload checksums on strong reads. A mismatch triggers `ChecksumMismatchError` (fail-closed), emits `consistency.violation` logs, and increments `storage.errors_total{code=CHECKSUM_MISMATCH}`.
- **Streams**: Delivery guarantee is `at_least_once`. Consumers must be idempotent. `commitStreamCursor` must be fsync-durable (adapter-dependent) before acknowledging to caller. Restarts resume from last committed cursor (not offset 0). Maximum redelivery interval ≤5s in Phase 1 tests. Trace attributes include `consumer_group` and `cursor` values.
- **Cache Controls**: `StorageContext.cachePolicy` and `StorageReadOptions.bypassCache` provide request-level overrides. Strong reads with `bypassCache` must hit the backing adapter.

## Consequences
- Callers receive deterministic semantics regardless of backend quirks.
- Inconsistencies surface as first-class errors rather than silent stale data.
- Additional engineering needed in adapters to report freshness and support checksum/etag metadata.

## Alternatives Considered
- **Pass-through Semantics**: Expose backend behavior directly and document caveats. Rejected because it leaks complexity to every consumer and invites subtle bugs.

## Acceptance Tests (Golden Contract)
1. **Strong Read**: Write → `readBlob` with `consistency: "strong"` returns new version within ≤100ms (default `stalenessBudgetMs`) or throws `ConsistencyError`.
2. **Eventual Read**: Write → `readBlob` with `consistency: "eventual"` may return previous version but never errors.
3. **Delete Enforcement**: Delete → `readBlob` with `consistency: "strong"` yields `NotFoundError`; eventual reads may see ghost data within cache TTL.
4. **Cache Corruption**: Poison cache entry → `readBlob` with `consistency: "strong", bypassCache: true` returns correct payload.

## Implementation Notes
- Facade instrumentation must record when `ConsistencyError` is raised (metrics/logs).
- Adapter contract includes reporting of `version`, `checksum`, and `etag` metadata.
- Cache layer stores timestamps to evaluate `stalenessBudgetMs`.
- Emit metrics per the observability spec (`storage.requests_total`, `storage.errors_total{code}`, `storage.latency_ms`, `storage.cb_transitions_total`), log `consistency.violation` events with expected/observed versions on mismatches, and include trace attributes (`retry_count`, `consumer_group`, `cursor`).

