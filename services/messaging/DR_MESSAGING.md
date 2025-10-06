# Disaster Recovery Runbook — Messaging Service

Status: Postgres is source of truth; Redis is streams/cache. Objectives: restore RPO ≤ 5m, RTO ≤ 15m.

## 1) Incident triage
- Confirm impact: API 5xx, dispatcher/consumer lag, WS delivery failures.
- Check dashboards: HTTP (5xx, p95), Dispatcher (sent, rejects), Consumer (broadcasts, 429), DB latency, Redis latency/errors.
- Capture request IDs and error samples; snapshot key metrics.

## 2) Common failures and procedures
### A. Redis outage / latency
- Fail over to standby/cluster (Sentinel/Cluster DNS). Update `REDIS_URL` if needed.
- Restart consumer/dispatcher to pick new endpoints.
- Verify consumer group exists; if missing: `XGROUP CREATE <stream> <group> $ MKSTREAM`.
- Monitor: consumer lag, DLQ writes, ws_queue_depth.

### B. Postgres failover
- Promote replica; update `DATABASE_URL`.
- Run migrations if drift detected; verify schema hash.
- Validate RLS and grants.
- Monitor: insert/update errors, outbox writes.

### C. Outbox backpressure
- Scale dispatcher replicas; reduce `DISPATCH_TICK_MS` if safe.
- If repeated publish failures: route to DLQ and open an incident.

### D. Consumer duplicate/reorder
- Restart with seek-from-seq: compute last committed per conversation and resume.
- Validate no re-emit: spot-check sequences.

## 3) Data hygiene
- DLQ: export and prune older than retention. Open incident if >24h backlog.
- Outbox: prune delivered older than retention.

## 4) Verification (exit criteria)
- HTTP p95 < 1.5s, error rate < 2% for 15m.
- Dispatcher sent steady, negligible rejects.
- Consumer broadcasts steady, ws_queue_depth under threshold.
- No elevated 5xx in logs; auth errors at baseline.

## 5) Contacts & escalation
- On-call: Messaging SRE
- DB: Platform DB
- Cache: Platform Caching
- Security: AppSec on-call

## 6) Appendix
- Redis commands: XGROUP, XINFO, XACK
- Migrations checklist
- Secrets rotation checklist
