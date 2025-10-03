# Phase 2 Backlog – Ticket Breakdown

## Adapter Implementation
- [ ] **STOR-201**: Implement Postgres record adapter (CRUD, optimistic locking, migrations, contract tests).
- [ ] **STOR-202**: Implement S3/MinIO blob adapter (multipart upload, checksum enforcement, ACL integration).
- [ ] **STOR-203**: Implement Redis/Kafka stream adapter (publish/consume, cursor durability, backpressure controls).
- [ ] **STOR-204**: Shared adapter validation harness + fixtures (reused across adapters).

## Caching & Consistency
- [ ] **STOR-211**: Redis cache provider with invalidation fan-out and TTL enforcement.
- [ ] **STOR-212**: In-memory LRU cache provider with staleness budget support.
- [ ] **STOR-213**: Consistency probes (checksum verification, strong-read retries) wired into facade.
- [ ] **STOR-214**: Circuit breaker + retry policy instrumentation (metrics & logs).

## Security & Compliance
- [ ] **STOR-221**: Integrate envelope encryption via `@sanctum/crypto` (facade-level enforcement, adapter ciphertext only).
- [ ] **STOR-222**: ACL enforcement hooks + policy evaluation tests.
- [ ] **STOR-223**: Audit log redaction rules + automated tests (sensitive fields scrubbed).
- [ ] **STOR-224**: Compliance review tasks (GDPR delete workflow, data residency documentation).

## Testing & Resilience
- [ ] **STOR-231**: Expanded golden test suite (checksum mismatch, pagination stability, stream restart/backpressure, cache TTL expiry, retry backoff).
- [ ] **STOR-232**: Integration test harness using Docker Compose (Postgres, MinIO, Redis, Kafka).
- [ ] **STOR-233**: k6 load testing scripts + CI job, baseline SLO verification.
- [ ] **STOR-234**: Chaos testing with toxiproxy (fault injection scenarios, nightly schedule).
- [ ] **STOR-235**: Mutation testing (Stryker) on critical modules (adapters, consistency layer).

## Observability & Ops
- [ ] **STOR-241**: Metrics exporter integration + dashboards (latency, errors, cache hit ratio, circuit breaker state).
- [ ] **STOR-242**: OTel tracing wiring with adapter-specific attributes.
- [ ] **STOR-243**: Alerting & SLO configuration (latency/error thresholds, consistency violations).
- [ ] **STOR-244**: Operational tooling (migrations CLI, health probes, chaos toggles).

## DX & Documentation
- [ ] **STOR-251**: Adapter authoring guide + configuration reference.
- [ ] **STOR-252**: Sample CLI / demo app showcasing multi-adapter usage.
- [ ] **STOR-253**: Runbooks (deploy, rollback, incident response).
- [ ] **STOR-254**: Developer preview onboarding kit (checklist, FAQs, support channels).


