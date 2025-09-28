# GA Readiness Audit

Date: 2025-09-28

Scope: Holistic audit of this monorepo’s services and core packages with a per-service readiness score (0–10), strengths, risks/gaps, and a focused roadmap to GA (General Availability).

Contents
- Repository overview
- Service readiness reports (auth, directory, admin, messaging, media, backup)
- Cross-cutting audit (CI/CD, security, observability, performance/resilience, docs, data)
- Readiness scoreboard
- Roadmaps to GA (per service and cross-cutting)

---

## Repository overview (high-level)

- services/
  - auth: production-grade Fastify service; adapters for Postgres and Redis; extensive unit/integration tests; load/chaos scripts; metrics & logging.
  - directory: new lookup API; zod-backed config; custom rate limiting; metrics; 90%+ effective coverage; integration tests.
  - admin: scaffold only.
  - messaging: scaffold only.
  - media: scaffold only.
  - backup: scaffold only (note: backup-related primitives exist in packages/crypto).
- packages/
  - config: shared config loader/validator (zod) with tests.
  - crypto: ratchet/session primitives, symmetric/asymmetric utils, identity, HKDF; large test suite.
  - transport: queue, websocket hub, rate limiter, schemas & types; strong unit coverage and property tests.
- apps/server: bootstrap, health/readiness; basic tests.
- CI: Vitest projects (unit/integration/security), CodeQL workflow, coverage check script, PR template, runbook, git hooks.

---

## Service readiness reports

### Auth (`services/auth`) — Readiness: 8/10

Strengths
- Mature Fastify stack; strict runtime config; robust error taxonomy; redaction tested.
- Adapters for Postgres (SQL + migrations) and Redis; in-memory adapters for testability.
- Extensive unit + integration test suites; load (login burst) and chaos tests (Postgres/Redis outage).
- Metrics (prom-client) and structured logs (pino); rate limiting guardrails in tests.

Gaps / Risks
- CI: Some Postgres/Redis integration tests are skipped unless env is present; need reproducible test containers in CI.
- API docs: OpenAPI spec and public error taxonomy not published.
- Coverage: Strong overall, but a few repository modules lag vs 90% thresholds; keep per-file enforcement.
- Operational docs: Production runbook partial for auth specifics (migrations, rollbacks, throttling runbooks).

Roadmap to GA
1) Re-enable DB/Redis integration in CI via Testcontainers (or services) with health checks; remove conditional skips.
2) Ship OpenAPI (paths, schemas, error taxonomy); publish docs and examples; add contract tests.
3) Enforce 90% per-file coverage in `services/auth/**`; add focused tests for under-covered repo modules.
4) Strengthen security posture: bind tighter CSP for web endpoints (if any), dependency review gates, secrets scanning; ensure CodeQL is mandatory.
5) Operationalize: migrations playbook, feature flags default OFF, SLOs/alerts (error rate, p95); graceful shutdown verified; rollout/rollback validated.

---

### Directory (`services/directory`) — Readiness: 8.5/10

Strengths
- Strict zod config with safe defaults; modular in-memory repository + service; clean route layer with zod validation.
- Custom in-process rate limiter and metrics hooks; structured error responses; tests cover core flows.
- 90%+ effective coverage across unit + integration; QA runs green; lint/typecheck clean.

Gaps / Risks
- Persistence: No Postgres adapters/migrations yet; hashed-email index/collation strategy absent.
- Multi-instance rate limiting: in-process limiter is not distributed; needs Redis or token-bucket at edge.
- API docs: OpenAPI not yet published; no public error taxonomy page.
- Ops: Dashboards/alerts and SLOs not finalized; runbook lacks directory-specific procedures.

Roadmap to GA
1) Implement Postgres repository with schema + migrations; add integration tests using containers; ensure case-insensitive hashes with indexes.
2) Add Redis-backed rate limiter or gateway-level limiter; verify fairness/latency under load.
3) Publish OpenAPI + examples; add contract tests; document error codes.
4) Observability: dashboards (requests, duration, 4xx/5xx, RL blocks), SLOs, alerts; readiness/liveness endpoints verified.
5) Enforce 90% per-file coverage; test negative paths and error branches (400/404/429/500).

---

### Admin (`services/admin`) — Readiness: 1/10

Strengths
- Placeholder scaffold to build on.

Gaps / Risks
- No routes, config, auth, or tests; scope unclear.

Roadmap to GA
1) Define admin scope (observability UI, feature flags, customer support tooling?).
2) Add authN/Z (JWT/OIDC) and audit logging; RBAC for admin roles.
3) Implement routes + UI (if applicable); write 90%+ coverage tests.
4) Publish OpenAPI; add dashboards/alerts; runbook for safe admin operations.

---

### Messaging (`services/messaging`) — Readiness: 0.5/10

Strengths
- Scaffold present; transport package provides building blocks (queues, schemas, hub).

Gaps / Risks
- No domain, storage, or APIs; no tests.

Roadmap to GA
1) Define message model (idempotency, ordering, TTL, fanout), API (produce, consume, ack, replay).
2) Implement storage (Postgres partitioned tables or log store) + dedupe keys; integrate `packages/transport`.
3) Add robust tests: property-based (loss/latency), soak tests, replay/resume; enforce 90%+ coverage.
4) Observability: per-topic metrics, dead-letter queues, alerting; OpenAPI.

---

### Media (`services/media`) — Readiness: 0.5/10

Strengths
- Scaffold present.

Gaps / Risks
- No API/storage; no tests; content scanning/encryption strategy undefined.

Roadmap to GA
1) Define upload/download APIs, pre-signed URLs; S3 or compatible store adapter; encryption-at-rest approach.
2) Virus scanning and content policy; chunked uploads; resumable strategy.
3) Tests: unit + integration + load; 90%+ coverage; OpenAPI + examples.
4) Observability and SLOs; retention; GDPR/PII handling.

---

### Backup (`services/backup`) — Readiness: 0.5/10

Strengths
- Crypto package includes backup-related primitives (e.g., `packages/crypto/src/backup/derive.ts`).

Gaps / Risks
- No service implementation: no APIs, schedules, or restore paths.

Roadmap to GA
1) Define backup APIs (initiate, list, restore, verify); policy (retention, encryption, rotation).
2) Implement storage adapters (object store) with encryption; integrity checks; PITR strategy for DBs.
3) End-to-end restore tests; chaos drills; 90%+ coverage; runbook for disaster recovery.

---

## Cross-cutting audit

CI/CD
- Present: Vitest projects (unit/integration/security), coverage reporting, CodeQL workflow, normalized job naming, PR template, git hooks to protect main.
- Needed: Testcontainers (or services) for Postgres/Redis in CI for auth and directory; enforce `check-coverage.mjs` per workspace; block merges if under thresholds; add smoke deploy gates.

Security
- Present: CodeQL; captcha integration and redaction tested; basic error handling hardened.
- Needed: Secrets scanning, dependency-review gate, SBOM generation; threat model docs; KMS rotation tests in CI; endpoint auth hardening + rate-limits at edge.

Observability
- Present: pino logging, prom-client metrics, redaction tests, metrics middleware in services.
- Needed: Unified trace/correlation-id; dashboards (latency, error rate, RL 429s, websocket health); SLO+alerts; structured audit logs for admin actions.

Performance/Resilience
- Present: Transport property tests; auth load/chaos tests; custom rate limiter in directory.
- Needed: Distributed RL (or gateway); backpressure strategies; soak tests across services; graceful shutdown validations; rollouts w/ auto-rollback based on SLOs.

Docs
- Present: README, RUNBOOK, PR template; internal comments/tests in packages.
- Needed: OpenAPI for public services (auth, directory), error catalogs, contribution/testing guide, readiness scoreboard kept current.

Data
- Present: Auth migrations exist; crypto primitives include backup derivation.
- Needed: Directory schema + migrations; backup service APIs and DR runbooks; PITR verification; data retention/GDPR policies.

---

## Readiness scoreboard (services)

| Service | Score | Config strict | 90% tests | DB/Redis CI | OpenAPI | Metrics | Rate limiting | Runbook |
| --- | ---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| auth | 8.0 | ✅ | ◻︎ (near) | ◻︎ | ◻︎ | ✅ | ✅ | ◻︎ |
| directory | 8.5 | ✅ | ✅ | ◻︎ | ◻︎ | ✅ | ✅ (in-proc) | ◻︎ |
| admin | 1.0 | ◻︎ | ◻︎ | ◻︎ | ◻︎ | ◻︎ | ◻︎ | ◻︎ |
| messaging | 0.5 | ◻︎ | ◻︎ | ◻︎ | ◻︎ | ◻︎ | ◻︎ | ◻︎ |
| media | 0.5 | ◻︎ | ◻︎ | ◻︎ | ◻︎ | ◻︎ | ◻︎ | ◻︎ |
| backup | 0.5 | ◻︎ | ◻︎ | ◻︎ | ◻︎ | ◻︎ | ◻︎ | ◻︎ |

Legend: ✅ done, ◻︎ pending/partial.

---

## Roadmaps (condensed)

Auth (to 9.5/10)
1) Testcontainers for Postgres/Redis in CI; remove skips; stabilize flakiness.
2) Publish OpenAPI + examples; contract tests; error taxonomy page.
3) Close per-file coverage gaps to ≥90%; fuzz tests for token/key paths.
4) Ops: migrations playbook; dashboards + SLOs; auto-rollback gates.

Directory (to 9.5/10)
1) Postgres repo + migrations + CI integration; index/hash strategy tests.
2) Distributed rate limiter; API quotas; load tests.
3) OpenAPI + examples; per-file coverage ≥90%; dashboards + SLOs.

Admin (to 8/10)
1) Define scope + RBAC; implement secure endpoints; 90% tests; OpenAPI; ops runbook.

Messaging (to 8.5/10)
1) Domain + APIs + durable storage; integrate transport; idempotency.
2) Property/soak tests; OpenAPI; metrics; SLO/alerts.

Media (to 8/10)
1) S3 adapter, upload/download, encryption, scanning; resumable.
2) Coverage ≥90%; OpenAPI; metrics; retention policies.

Backup (to 8.5/10)
1) Backup/restore APIs, encryption, integrity checks; scheduling.
2) Disaster-recovery drills; runbooks; coverage ≥90%; OpenAPI.

---

Ownership & cadence
- Keep this document updated each release.
- Add readiness checks to PR template and CI gates.


