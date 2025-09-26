# Auth Chaos Testing Plan

## Objectives
- Validate resilience to upstream failures (Postgres, Redis, KMS) and ensure graceful degradation.
- Verify alerting/logging captures incidents; confirm recovery without manual intervention.

## Tooling
- Docker Compose with Postgres/Redis to orchestrate faults (`docker compose stop/start`).
- Scripts using `node` or `bash` to inject faults and run smoke requests.
- Metrics snapshot from `prom-client` endpoints.

## Scenarios
1. **Postgres outage**
   - Steps: run login flow baseline; `docker compose stop auth-db`; issue logins; `docker compose start auth-db`.
   - Expectations: auth service returns 503; metrics/ logs record DB outage; service recovers automatically.

2. **Redis outage**
   - Stop `auth-cache` mid-pairing; ensure nonce replay protection falls back to memory or returns 503.

3. **KMS failure** (mock)
   - Provide fake KMS resolver that throws; ensure login returns 500 with sanitized logs.

## Execution
- Scripts under `services/auth/tests/chaos/*.ts` run sequentially.
- Each script writes report to `logs/chaos/<timestamp>.json`.

## Readiness Gate
- No data corruption; service surfaces errors quickly; recovery automatic within 1 min after restoring dependency.

