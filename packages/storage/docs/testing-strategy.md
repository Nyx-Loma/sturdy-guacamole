# `@sanctum/storage` Testing & Quality Strategy (Phase 0 Draft)

## Quality Principles
- **Defense in depth**: every adapter must pass shared contract suites plus backend-specific tests.
- **Deterministic + stochastic coverage**: combine classical unit/integration testing with fuzzing and property-based methods.
- **Shift left security**: static analysis, dependency scanning, secret detection on every change.
- **Continuous verification**: nightly stress and chaos suites against staging environments.

## Test Taxonomy
- Unit tests (Vitest): pure functions, domain validation, serializers.
- Contract tests: reusable suite asserting adapter compliance (CRUD, pagination, consistency).
- Integration tests: real infra via Docker Compose (Postgres, Redis, MinIO/S3 stub).
- Performance tests: k6-based load scripts validating latency/throughput SLOs.
- Chaos/resilience tests: fault injection (latency, failure, partial outages) using tools like toxiproxy.
- Security tests: crypto invariants, envelope integrity, ACL bypass attempts.

## Tooling & Frameworks
- **Test runner**: Vitest with TS + ESM support; `vitest.setup.ts` for global fixtures.
- **Mocking**: MSW for HTTP, custom in-memory adapter for storage.
- **Property testing**: fast-check (property-based) integrated into Vitest.
- **Fuzzing**: Jazzer.js for API surfaces (Node harness).
- **Static analysis**: ESLint (strict), TypeScript `strict` mode, `ts-prune`, `depcheck`.
- **Security scanners**: `npm audit`, Snyk/GHAS; `gitleaks` for secrets.
- **Coverage**: `c8` + `vitest --coverage`, thresholds 95% statements/branches.
- **Mutation testing**: Stryker for critical modules once code exists.
- **Load testing**: k6 scripts stored in `packages/storage/perf`.

## Pipelines & Gates
- PR CI workflow running lint, typecheck, unit, contract tests.
- Adapter-specific integration jobs triggered when touching backend code.
- Nightly scheduled workflow: full integration + load (limited concurrency) + mutation smoke.
- Release workflow: run full suite, publish coverage & performance report artifacts.

## Test Data & Fixtures
- Use `@sanctum/crypto` to generate test keys; rotate fixtures regularly.
- Provide synthetic datasets for varying object sizes, metadata shapes, ACL scenarios.
- Maintain golden files for serialization formats in `packages/storage/tests/fixtures`.

## Documentation & Governance
- Maintain `docs/testing-matrix.md` mapping features → test suites.
- Define `TESTING.md` contributor guide (how to run suites locally, env vars).
- Track quality KPIs (coverage, mutation score, flake rate) on dashboard.
- Enforce blocking policy: PRs failing required suites cannot merge without waiver.

## Open Questions
- Which load testing envs (shared staging vs dedicated) are available? (Owner: SRE)
- Budget for chaos tooling in CI vs scheduled staging runs? (Owner: Platform PM)
- Need for dedicated compliance/security test harness? (Owner: Security Eng)

## Next Steps (Phase 0)
- Draft CI workflow spec aligning with repo standards.
- Identify required third-party tooling licenses (Snyk, k6 cloud, etc.).
- Prototype contract test scaffolding with in-memory adapter to validate architecture.


