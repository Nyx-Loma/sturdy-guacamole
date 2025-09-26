# Auth Load Testing Plan

## Goals

- Validate auth service scaling for Stage 4: sustain target RPS and burst behavior with Postgres + Redis in Docker Compose.
- Verify SLO adherence: p95 latency \<= 250ms for login/pairing and error rate < 0.5% under load.
- Capture metrics (Fastify logs, prom-client counters, database/Redis stats) for trend analysis.

## Tooling

- **k6** (preferred) or **Artillery** for HTTP workloads.
- Compose stack (`docker-compose.dev.yml`) with `auth-service`, `auth-db`, `auth-cache`.
- Optional: `grafana/k6` output via Influx for long runs.

## Scenarios

1. **Login Burst**
   - RPS ramp: 0 → 200 RPS over 1 min, sustain 3 min.
   - Workflow: `/v1/devices/register` (setup), `/v1/auth/nonce`, `/v1/auth/login` (with fake captcha token).
   - Assertions: p95 latency \<= 200ms, captcha denial rate \< 0.1%, DB connection pool saturation < 80%.

2. **Steady Mixed Traffic**
   - 100 RPS stable for 10 min.
   - 70% login flow, 20% pairing (`init -> complete -> approve`), 10% `/health`.
   - Assertions: Postgres CPU < 70%, Redis latency < 5ms, refresh token creation + revocation counts consistent.

3. **Refresh Churn**
   - Simulate 50 RPS refresh-only (nonce + login replaced with `/auth/login` -> `/auth/logout` (future) / refresh).
   - Ensure redis nonce store handles high churn (monitor `auth_captcha_result_total`, nonce consume rate).

## Metrics & Observability

- Fastify logs (structured) with hashed tokens.
- `auth_captcha_result_total`, login success/error counters, DB connection metrics (`pg_stat_activity`).
- Capture k6 summary (latency percentiles, errors, http_req_failed).

## Success Criteria

- No SLO violations across scenarios.
- Error rates < 0.5%, captcha denies < 1% (expected for fake token).
- No runaway resource usage (DB, Redis, CPU < 80%).

## Execution Steps

1. `docker compose -f docker-compose.dev.yml up -d`
2. `pnpm migrate:auth`
3. Run k6 scripts:
   - `k6 run services/auth/tests/load/login-burst.js`
   - `k6 run services/auth/tests/load/mix-traffic.js`
   - `k6 run services/auth/tests/load/refresh-churn.js`
4. Collect metrics (stdout, docker stats, optional Grafana).
5. Document findings in `logs/load/<timestamp>/`.

## Follow-Ups

- Integrate load jobs into CI (nightly) once stable.
- Extend to multi-service flows (auth + transport) when ready.

