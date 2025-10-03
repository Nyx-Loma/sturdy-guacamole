# `@sanctum/storage` Phase 1 Architecture Overview

## Goals
- Define the logical architecture, core abstractions, and module boundaries.
- Provide a blueprint for implementing adapters, caching layers, and API APIs.
- Establish consistency with existing Sanctum platform conventions.
- Codify consistency, security, and observability requirements up front.

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      @sanctum/storage (package)                  │
│                                                                  │
│  ┌──────────────┐   ┌───────────────────┐   ┌─────────────────┐ │
│  │ Domain Types │   │ Storage Facade API│   │ Adapter Registry │ │
│  └──────────────┘   └───────────────────┘   └─────────────────┘ │
│          │                          │                 │         │
│          ▼                          ▼                 ▼         │
│  ┌────────────────┐       ┌─────────────────┐   ┌──────────────┐│
│  │ ACL & Policy   │       │ Cache Layer     │   │ Observability││
│  │ Enforcement    │       │ (pluggable)     │   │ (metrics/log)││
│  └────────────────┘       └─────────────────┘   └──────────────┘│
│          │                          │                 │         │
│          ▼                          ▼                 ▼         │
│  ┌─────────────┐    ┌───────────────┐    ┌────────────────────┐ │
│  │ Blob Adapter│    │ Record Adapter│    │ Stream Adapter      │ │
│  └─────────────┘    └───────────────┘    └────────────────────┘ │
│          │                   │                      │           │
│  ┌─────────────┐    ┌───────────────┐    ┌────────────────────┐ │
│  │ S3/GCS/etc. │    │ Postgres/etc. │    │ Redis/Kafka/etc.   │ │
│  └─────────────┘    └───────────────┘    └────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Modules (proposed)
- `src/index.ts`: public entrypoint exporting facade and types.
- `src/types/`: domain types, error classes, configuration schemas.
- `src/facade/`: high-level API orchestrating adapters, caching, observability.
- `src/adapters/`: base adapter interfaces + concrete implementations.
- `src/cache/`: optional caching layer (e.g., Redis, in-memory LRU).
- `src/policies/`: ACL enforcement, tenancy segregation.
- `src/utils/`: serialization, validation, id generators.
- `src/observability/`: logging, metrics, tracing hooks.

### Cross-Cutting Concerns
- **Security**: facade enforces envelope encryption via `@sanctum/crypto` before payload reaches adapters; adapters operate only on ciphertext and metadata.
- **Observability**: integrate with platform metrics/logging; expose instrumentation hooks.
- **Resilience**: retries, idempotent operations, rate limiting via `@sanctum/transport` primitives when applicable.
- **Configuration**: rely on `@sanctum/config` for loading and validation.

## Domain Model
- `StorageObject`: represents a versioned blob with metadata and ACLs.
- `ObjectVersion`: metadata about a stored version (checksum, size, timestamps).
- `Namespace/Bucket`: logical tenant segmentation; supports region affinity.
- `Record`: structured data (row-like) with schema versioning.
- `StreamMessage`: append-only events with cursor management.
- `AccessPolicy`: resolved permissions (read/write/admin) per actor or service.
- `StorageContext`: request-scoped context (tenant id, trace ids, auth token, locale).

## Key Flows
1. **Write Blob**
   - Validate ACL → encrypt payload (facade) → optionally cache metadata → invoke blob adapter with ciphertext → emit audit + metrics.
2. **Read Blob**
   - Resolve policy → apply cache policy (respect `bypassCache`) → fetch from adapter → decrypt (facade) → return streaming reader.
3. **Record Upsert**
   - Schema validate → begin transaction → apply optimistic locking → commit → publish change event.
4. **Stream Consumer**
   - Subscribe via adapter → checkpoint management → backpressure handling → error recovery.

## Adapter Strategy
- Base interfaces defined in `src/adapters/base.ts` (Phase 1 deliverable).
- Each adapter implements lifecycle methods (`init`, `healthCheck`, `dispose`).
- Shared validation ensures adapter conformance before registration.
- Provide official adapters: `PostgresAdapter`, `S3Adapter`, `RedisStreamAdapter` (Phase 2 start).
- Allow custom adapters via dependency injection with config definitions.
- Require adapters to declare delivery semantics (`at_least_once`, `at_most_once`, `exactly_once`) for stream support; facade mediates cursor durability expectations.

## Consistency Model
- Default facade contract is **strongly consistent** for reads/writes when backend supports it.
- `StorageReadOptions.consistency` accepts `"strong" | "eventual" | "cache_only"`; facade defaults to `"strong"` unless caller overrides. `bypassCache: true` always forces adapter access.
- `StorageReadOptions.stalenessBudgetMs` expresses acceptable cache age when using `"strong"` with cached responses.
- Cache layer honours `bypassCache` flag and `StorageContext.cachePolicy` to ensure single-source-of-truth reads.
- Facade performs consistency probes (checksum + version comparisons) and surfaces `ConsistencyError` when mismatch detected.
- ADR-001 (`docs/adr/0001-consistency-semantics.md`) documents quorum rules per adapter type.

## Caching & Consistency
- Optional caching per operation (metadata + object bytes) with TTL and invalidation on writes; default TTL = 5 minutes.
- Writes trigger cache purge + async warm; deletes purge immediately.
- `StorageReadOptions.bypassCache` and `StorageContext.cachePolicy` provide request-level control.
- Document eventual consistency caveats for certain backends (e.g., S3) and mitigation strategies (checksum verification, read-after-write retries).

## Error Handling
- Centralized error hierarchy with error codes (see `docs/error-model.md`).
- Provide typed errors: `NotFoundError`, `ConflictError`, `UnauthorizedError`, `QuotaExceededError`, `ConsistencyError`, `EncryptionError`, `TransientAdapterError`, `PermanentAdapterError`.
- Integrate with platform logging (structured JSON) including correlation IDs.

## Observability Baseline
- Golden metrics emitted per operation: `storage.requests{operation}`, `storage.latency_ms{operation}`, `storage.errors{code}`, `storage.cache.hit_ratio`.
- Audit log hook for ACL evaluations, deletes, recoveries, quota changes.
- Tracing spans wrap facade operations; adapters attach backend attributes (`adapter.kind`, `adapter.name`).

## Initialization Contract
- `createStorageClient` validates config schema (namespaces, adapter kinds, schema versions).
- Production deployments must supply logger, metrics, tracer, crypto dependencies; defaults only for dev/test.
- Adapters register declared schema versions to detect drift at startup.

## Config & Initialization
- Provide `createStorageClient(config: StorageConfig, deps?: StorageDependencies)`. 
- Config includes adapters, encryption settings, cache options, observability hooks.
- Dependencies (optional): logger, metrics emitter, tracer, crypto provider (default from `@sanctum/crypto`).

## Stream Semantics
- Stream adapters must state delivery guarantees; facade defaults to at-least-once processing with idempotent handlers.
- Checkpoints persisted via adapter `commitCursor`; facade enforces durability (e.g., double-write to Postgres for Redis adapters if configured).
- Backpressure + retry policies configurable per namespace.

## Testing Expectations
- Golden contract suite ensures Write→Read→Checksum, Delete→404, Update→Read for strong consistency backends within configured bounds.
- Encryption tests assert adapters never observe plaintext by stubbing crypto layer.
- Observability tests verify metrics/audit events for key flows.

## Future Considerations (Beyond Phase 1)
- Multi-region replication.
- Tiered storage (hot/cold).
- Data retention policies and GDPR delete workflows.
- Pluggable content-addressable storage.

