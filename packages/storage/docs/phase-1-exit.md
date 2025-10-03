# Phase 1 Exit Readiness – `@sanctum/storage`

## Status Summary
- ✅ Architecture overview updated with consistency, security, observability, caching, and stream semantics.
- ✅ Core TypeScript scaffolding in place (`types`, `errors`, `config`, `client`, `adapters`).
- ✅ Error model doc aligned with new error classes.
- ✅ Phase‑1 exit gates satisfied; CI enforces them.

## Phase-1 Exit Gates (CI-Enforced)
All items must be merged and green in CI:
1. **ADR-001 – Consistency Semantics**: merged with status `Accepted`.
2. **Observability scaffold**: `src/observability/metrics.ts` exports counters/histograms + facade emits metrics/logs per op.
3. **Config schema + version lock**: Zod schema in `src/config/schema.ts`; `createStorageClient` validates & enforces schemaVersion.
4. **Contract/golden tests**: `docs/tests-contracts.md` committed; minimum 4 seed tests (blob, record, stream, cache bypass) green under `pnpm test:contracts`.

### CI Gates to Configure
- `pnpm test:contracts` runs seed tests. ✅
- `pnpm typecheck` + `pnpm lint` required. ✅
- Coverage ≥90% per-file for `src/errors/**` and `src/observability/**` (checked in CI). ✅
- ESLint rule preventing `src/errors/*` or `src/types/*` from importing `src/adapters/*` (maintain layering). ✅

## Deliverable Checklist
- [x] Architecture documentation with module map & key flows.
- [x] Domain types captured in `src/types.ts`.
- [x] Error hierarchy defined and documented.
- [x] Adapter interfaces specified in `src/adapters/base.ts`.
- [x] `createStorageClient` facade scaffolded with resolution logic.
- [x] ADR-001 Consistency semantics accepted.
- [x] Observability scaffold & docs merged.
- [x] Config schema validation & schema-version lock implemented.
- [x] Contract/golden test plan + seed tests merged.

## ADR-001 (Consistency & Read Semantics) – Outline
- **Title**: ADR-001 Consistency Semantics for `@sanctum/storage`
- **Status**: Proposed → Accepted
- **Context**: Mix of strong/eventual backends; optional cache.
- **Decision**:
  - Default read level = `strong`; caller may opt into `eventual` or `cache_only`.
  - `strong` reads bypass cache unless entry is fresh (`age <= stalenessBudgetMs`). If backend cannot provide RAFW guarantees, throw `ConsistencyError` and advise retry with jitter.
  - `eventual` reads favor cache; stale data permitted; no `ConsistencyError`.
  - Write/delete trigger synchronous cache purge + async fanout for distributed caches.
  - All writes return `{ version, etag }`; strong reads respect conditional headers (`If-Match`).
  - Streams guarantee at-least-once delivery; consumer checkpoints must be durable.
- **Consequences**: deterministic semantics, surfaced inconsistencies, uniform API.
- **Acceptance tests**:
  1. Write → strong read returns new version ≤100ms or throws `ConsistencyError`.
  2. Write → eventual read may return previous version but never errors.
  3. Delete → strong read yields `NotFound`; eventual read may observe ghost ≤ TTL.
  4. Cache corruption → strong read with `bypassCache=true` returns correct payload.

## Observability Scaffold (Required Artifacts)
- `src/observability/metrics.ts` exporting:
  - `StorageMetrics` with counters (`requestsTotal`, `errorsTotal`, `retriesTotal`) and histograms (`latencyMs`, `payloadBytes`, optional `cacheHitRatio`).
  - `createNoopMetrics()` returning no-op implementations.
- Facade must record metrics + latency per operation and emit structured logs for errors/ACL decisions.
- `docs/observability.md` to document metric names, labels, log event shapes, and trace attributes.

## Config Schema & Version Lock
- `src/config/schema.ts` defining `StorageConfigV1` (Zod) with `schemaVersion`, namespaces, adapters, cache, observability.
- `parseConfig` validates input and enforces `schemaVersion === 1`; `createStorageClient` consumes parsed config and freezes dependencies.

## Contract / Golden Tests
- `docs/tests-contracts.md` enumerates blob, record, stream, and cache behaviors + error mapping + retry policy.
- Seed tests (Vitest, under `pnpm test:contracts`):
  1. Blob write/read strong-consistency test (new version or `ConsistencyError`). ✅
  2. Record upsert with stale ETag → `PreconditionFailedError`. ✅
  3. Stream delivery duplicate handling (consumer idempotent behavior enforced). ✅
  4. Cache bypass ensures fresh data when cache poisoned. ✅

## RACI & Timelines
| Item | R | A | C | I | Target |
| --- | --- | --- | --- | --- | --- |
| ADR-001 Consistency | Architecture Lead | CTO | Storage TLs | QA | EOW |
| Observability scaffold | Platform DX | CTO | SRE | QA | EOW |
| Config schema + lock | Storage TL | CTO | Architecture | QA | EOW |
| Contract tests (plan + seed) | QA Lead | CTO | Architecture, Storage TL | SRE | EOW |

## PR Template
- Add `.github/PULL_REQUEST_TEMPLATE/storage-phase1.md` including checklist:
  - ADR-001 accepted & linked.
  - Metrics exported + facade instrumentation.
  - Config validated via Zod schema.
  - 4 seed contract tests present & passing.
  - Coverage ≥90% per-file for `src/errors/**` & `src/observability/**`.

## Definition of Done – Phase 1
- Consumers instantiate `createStorageClient()` with validated config.
- Facade emissions per op: metrics, structured logs, correlation IDs, canonical errors.
- `readConsistency` + `bypassCache` honored.
- Seed contract tests pass in CI (`pnpm test:contracts`).
- Documentation reflects actual behavior; no TODOs.

## Risks / Notes
- Cache TTL ≤5s until async invalidation lands.
- Stream semantics remain at-least-once; exactly-once deferred to Phase 2.
- Observability abstraction stays exporter-agnostic.

