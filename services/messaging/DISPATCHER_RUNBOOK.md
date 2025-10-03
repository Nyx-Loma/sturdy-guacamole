# Dispatcher Runbook

**Owner:** Platform Team  
**Last Updated:** 2025-10-03  
**SLA:** p95 < 1.5s, error rate < 2%

---

## Overview

The **dispatcher** consumes rows from `messaging.message_outbox` and publishes them to Redis Streams (`sanctum:messages`) for realtime delivery to WebSocket clients.

**Key properties:**
- At-least-once delivery (outbox + Redis Stream + consumer ACK)
- Retry with exponential backoff (up to `DISPATCH_MAX_ATTEMPTS`)
- DLQ for terminal failures (`status='dead'`)
- Concurrent-safe via `FOR UPDATE SKIP LOCKED`
- Zero-knowledge: only encrypted ciphertext is processed

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DISPATCHER_ENABLED` | `false` | Master kill switch. Set to `true` to enable. |
| `DISPATCH_TICK_MS` | `100` | Interval between dispatcher ticks (ms). |
| `DISPATCH_BATCH_SIZE` | `256` | Max rows fetched per tick. |
| `DISPATCH_MAX_ATTEMPTS` | `10` | Max retries before DLQ. |
| `DISPATCH_STREAM_NAME` | `sanctum:messages` | Redis Stream name. |
| `REDIS_STREAM_MAXLEN` | `1000000` | Stream MAXLEN (trim old entries). |
| `OUTBOX_RETENTION_DAYS` | `7` | Prune sent/dead rows older than N days. |
| `DLQ_RETENTION_DAYS` | `30` | Prune DLQ rows older than N days. |

### Feature Flag

```bash
# Enable on a single pod (≈5% traffic)
kubectl set env deployment/messaging DISPATCHER_ENABLED=true --selector app=messaging,canary=true

# Rollout to all pods
kubectl set env deployment/messaging DISPATCHER_ENABLED=true
```

---

## Rollout Procedure

### Pre-Flight Checklist

- [ ] Integration tests passing (`pnpm test:integration --filter @sanctum/messaging`)
- [ ] Migrations applied (`20250203_message_outbox.sql`)
- [ ] Metrics visible in Grafana (`messaging_outbox_*`, `messaging_dispatch_*`)
- [ ] Alerts configured (see **Alerts** section)
- [ ] Runbook reviewed by on-call team

### Phased Rollout

| Phase | Traffic | Duration | Success Criteria |
|-------|---------|----------|------------------|
| **1. Canary** | 5% (1 pod) | 30 min | Error rate < 2%, p95 < 1.5s, no `dead` rows |
| **2. Partial** | 25% | 1 hour | Same as Phase 1 |
| **3. Full** | 100% | — | Same as Phase 1 |

**Enable Phase 1:**
```bash
kubectl set env deployment/messaging DISPATCHER_ENABLED=true --selector canary=true
```

**Monitor for 30 minutes:**
- Watch Grafana dashboard: `Messaging > Dispatcher`
- Check logs for `dispatcher_tick_error` or `outbox_rows_buried_after_max_attempts`
- Verify `messaging_outbox_dead_total` stays at 0

**If SLO breached** (error rate > 2% for 3 min OR p95 > 1.5s for 5 min):
```bash
# Immediate rollback
kubectl set env deployment/messaging DISPATCHER_ENABLED=false --selector canary=true

# Alert on-call
pagerduty trigger --service messaging --summary "Dispatcher SLO breach"
```

**Advance to Phase 2:**
```bash
kubectl set env deployment/messaging DISPATCHER_ENABLED=true --selector tier=backend
```

**Advance to Phase 3:**
```bash
kubectl set env deployment/messaging DISPATCHER_ENABLED=true
```

---

## Monitoring

### Key Metrics

#### Dispatcher Health

| Metric | Type | Alert Threshold |
|--------|------|----------------|
| `messaging_dispatch_ticks_total{result="ok"}` | Counter | Increasing |
| `messaging_dispatch_ticks_total{result="error"}` | Counter | > 10/min |
| `messaging_dispatch_tick_duration_seconds` (p95) | Histogram | < 1.5s |
| `messaging_dispatch_tick_duration_seconds` (p99) | Histogram | < 3s |

#### Outbox Pipeline

| Metric | Type | Alert Threshold |
|--------|------|----------------|
| `messaging_outbox_picked_total` | Counter | Increasing |
| `messaging_outbox_sent_total` | Counter | ≈ `picked_total` |
| `messaging_outbox_failed_total` | Counter | < 5% of `picked` |
| `messaging_outbox_dead_total` | Counter | 0 (alert on any) |

#### Redis Integration

| Metric | Type | Alert Threshold |
|--------|------|----------------|
| `messaging_dispatch_published_total` | Counter | ≈ `sent_total` |
| `messaging_dispatch_dlq_total{sink="postgres"}` | Counter | 0 (alert on any) |

### Grafana Dashboard

```
Dispatcher Overview
├── Tick Rate (ticks/sec)
├── Tick Duration (p50, p95, p99)
├── Outbox Throughput (picked, sent, failed, dead)
├── Redis Publish Rate
├── DLQ Size (over time)
└── Error Rate (%)
```

**PromQL Queries:**

```promql
# Tick rate
rate(messaging_dispatch_ticks_total{result="ok"}[1m])

# p95 latency
histogram_quantile(0.95, rate(messaging_dispatch_tick_duration_seconds_bucket[5m]))

# Error rate
rate(messaging_dispatch_ticks_total{result="error"}[1m]) 
  / 
rate(messaging_dispatch_ticks_total[1m])

# DLQ growth
rate(messaging_outbox_dead_total[5m])
```

---

## Alerts

### Critical

```yaml
- alert: DispatcherDown
  expr: rate(messaging_dispatch_ticks_total[2m]) == 0
  for: 3m
  annotations:
    summary: "Dispatcher stopped ticking"
    runbook: "Check pod logs for crashes"

- alert: DispatcherHighErrorRate
  expr: |
    rate(messaging_dispatch_ticks_total{result="error"}[3m])
      /
    rate(messaging_dispatch_ticks_total[3m]) > 0.02
  for: 3m
  annotations:
    summary: "Dispatcher error rate > 2%"
    runbook: "Check Redis connectivity"

- alert: DispatcherHighLatency
  expr: |
    histogram_quantile(0.95, 
      rate(messaging_dispatch_tick_duration_seconds_bucket[5m])
    ) > 1.5
  for: 5m
  annotations:
    summary: "Dispatcher p95 latency > 1.5s"
    runbook: "Check Postgres/Redis load"

- alert: DispatcherDLQGrowing
  expr: increase(messaging_outbox_dead_total[10m]) > 0
  annotations:
    summary: "DLQ received rows (terminal failures)"
    runbook: "Investigate root cause and replay"
```

### Warning

```yaml
- alert: DispatcherHighRetries
  expr: |
    rate(messaging_outbox_failed_total[5m])
      /
    rate(messaging_outbox_picked_total[5m]) > 0.05
  for: 10m
  annotations:
    summary: "Dispatcher retry rate > 5%"
    runbook: "Check Redis availability"
```

---

## Troubleshooting

### Dispatcher Not Running

**Symptoms:** `messaging_dispatch_ticks_total` flat

**Checks:**
1. Is `DISPATCHER_ENABLED=true`?
   ```bash
   kubectl get pods -l app=messaging -o jsonpath='{.items[*].spec.containers[*].env[?(@.name=="DISPATCHER_ENABLED")].value}'
   ```
2. Are pods healthy?
   ```bash
   kubectl get pods -l app=messaging
   ```
3. Check logs:
   ```bash
   kubectl logs -l app=messaging --tail=100 | grep dispatcher
   ```

**Fix:** Restart pods if `DISPATCHER_ENABLED=true` but not running.

---

### High Error Rate

**Symptoms:** `messaging_dispatch_ticks_total{result="error"}` spiking

**Common Causes:**
- Redis unavailable (network partition, OOM)
- Postgres overloaded (slow `FOR UPDATE SKIP LOCKED`)
- Bad payload (invalid JSON in `message_outbox.payload`)

**Diagnosis:**
```bash
# Check Redis connectivity
redis-cli -h <redis-host> PING

# Check Postgres
psql $POSTGRES_URL -c "SELECT COUNT(*) FROM messaging.message_outbox WHERE status='pending';"

# Check error logs
kubectl logs -l app=messaging --tail=500 | grep "dispatcher_tick_error"
```

**Fix:**
- If Redis down: restart Redis or fail over
- If Postgres slow: scale up read replicas
- If bad payload: manually mark row as `dead` and investigate source

---

### DLQ Rows Appearing

**Symptoms:** `messaging_outbox_dead_total` > 0

**Investigation:**
```sql
-- List recent DLQ rows
SELECT 
  message_id, 
  event_type, 
  aggregate_id, 
  attempts, 
  last_error, 
  occurred_at
FROM messaging.message_outbox
WHERE status = 'dead'
ORDER BY occurred_at DESC
LIMIT 20;
```

**Common Causes:**
- Redis Stream full (`MAXLEN` reached, old consumer lag)
- Network timeouts during XADD
- Corrupted payload (JSON parse error)

**Remediation:**
1. **Fix root cause** (clear Redis lag, increase MAXLEN, fix payload source)
2. **Replay DLQ rows:**
   ```sql
   -- Reset to pending for retry
   UPDATE messaging.message_outbox
   SET status = 'pending', attempts = 0, last_error = NULL
   WHERE status = 'dead'
     AND occurred_at > NOW() - INTERVAL '1 hour';
   ```
3. **Monitor** for re-occurrence

**Permanent Fix:**
- If systematic: increase `DISPATCH_MAX_ATTEMPTS` (default 10)
- If transient: no action needed (DLQ worked as designed)

---

### Outbox Growing Unbounded

**Symptoms:** Millions of rows in `status='pending'`

**Diagnosis:**
```sql
SELECT status, COUNT(*) as count
FROM messaging.message_outbox
GROUP BY status;
```

**Causes:**
- Dispatcher disabled (`DISPATCHER_ENABLED=false`)
- Dispatcher crashed/OOM
- Redis unavailable for extended period

**Fix:**
1. Enable dispatcher if disabled
2. Scale up dispatcher pods (horizontal scaling)
3. Increase `DISPATCH_BATCH_SIZE` temporarily (e.g., 1000)
4. After drain, reset to default

---

## Operations

### DLQ Replay

```sql
-- View DLQ summary
SELECT 
  last_error, 
  COUNT(*) as count
FROM messaging.message_outbox
WHERE status = 'dead'
GROUP BY last_error;

-- Replay specific error type
UPDATE messaging.message_outbox
SET status = 'pending', attempts = 0, last_error = NULL, picked_at = NULL
WHERE status = 'dead'
  AND last_error LIKE '%redis%'
  AND occurred_at > NOW() - INTERVAL '24 hours';
```

### Manual Cleanup (Pruning)

```sql
-- Run daily via cron
CALL messaging.prune_message_outbox(INTERVAL '7 days');
CALL messaging.prune_message_dlq(INTERVAL '30 days');
```

**Automation (K8s CronJob):**
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: messaging-outbox-prune
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM UTC
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: prune
            image: postgres:16
            command:
            - psql
            - $(POSTGRES_URL)
            - -c
            - "CALL messaging.prune_message_outbox(INTERVAL '7 days'); CALL messaging.prune_message_dlq(INTERVAL '30 days');"
            env:
            - name: POSTGRES_URL
              valueFrom:
                secretKeyRef:
                  name: messaging-db
                  key: url
          restartPolicy: OnFailure
```

### Scale Dispatcher

```bash
# Increase tick frequency (more aggressive)
kubectl set env deployment/messaging DISPATCH_TICK_MS=50

# Increase batch size (drain backlog faster)
kubectl set env deployment/messaging DISPATCH_BATCH_SIZE=500

# Add more pods (parallel processing)
kubectl scale deployment/messaging --replicas=5
```

**Trade-offs:**
- Lower `DISPATCH_TICK_MS` → higher CPU, more pressure on Postgres
- Higher `DISPATCH_BATCH_SIZE` → larger transactions, slower ticks
- More replicas → better throughput, but watch Postgres connection pool

---

## Testing Locally

### Start Dependencies

```bash
cd services/messaging
docker-compose -f docker-compose.test.yml up -d

# Wait for health
docker-compose -f docker-compose.test.yml ps
```

### Run Migrations

```bash
export DATABASE_URL=postgres://postgres:postgres@localhost:5433/messaging_test
psql $DATABASE_URL -f src/adapters/postgres/migrations/20250203_message_outbox.sql
```

### Enable Dispatcher

```bash
export DISPATCHER_ENABLED=true
export REDIS_URL=redis://localhost:6380

pnpm run -w messaging:dev
```

### Seed Outbox

```bash
psql $DATABASE_URL <<EOF
INSERT INTO messaging.message_outbox (event_id, message_id, event_type, aggregate_id, payload)
VALUES (gen_random_uuid(), gen_random_uuid(), 'MessageCreated', gen_random_uuid(), '{"test": true}');
EOF
```

### Verify Redis

```bash
redis-cli -p 6380 XLEN sanctum:messages
redis-cli -p 6380 XREAD STREAMS sanctum:messages 0
```

### Run Integration Tests

```bash
export DATABASE_URL=postgres://postgres:postgres@localhost:5433/messaging_test
export REDIS_URL=redis://localhost:6380

pnpm vitest run services/messaging/src/tests/integration/dispatcher
```

---

## Rollback Checklist

If **any** SLO is breached during rollout:

1. **Disable immediately:**
   ```bash
   kubectl set env deployment/messaging DISPATCHER_ENABLED=false
   ```

2. **Verify outbox safety:**
   ```sql
   SELECT status, COUNT(*) FROM messaging.message_outbox GROUP BY status;
   ```
   - Rows should stay `status='pending'` (safe)
   - No data loss (dispatcher is write-only to Redis)

3. **Alert team:**
   - Post in `#platform-incidents`
   - Page on-call if critical

4. **Root cause:**
   - Check logs: `kubectl logs -l app=messaging --tail=1000`
   - Check metrics: Grafana → Dispatcher dashboard
   - Check Redis: `redis-cli INFO stats`

5. **Fix & re-enable:**
   - After mitigation, follow **Rollout Procedure** again from Phase 1

---

## FAQ

**Q: Can I enable dispatcher without Redis?**  
A: No. Dispatcher requires Redis Stream for publishing. Use `DISPATCHER_ENABLED=false` if Redis is unavailable.

**Q: What happens if dispatcher is disabled mid-run?**  
A: Outbox rows stay in `status='pending'` or `status='picked'`. Safe to re-enable later; rows will be retried.

**Q: Can multiple dispatcher instances run?**  
A: Yes. `FOR UPDATE SKIP LOCKED` prevents double-picking. Scale horizontally for higher throughput.

**Q: How do I replay a specific message?**  
A: Set its outbox row to `status='pending'` and `attempts=0`. Dispatcher will pick it up on next tick.

**Q: What if Redis Stream is full?**  
A: Increase `REDIS_STREAM_MAXLEN` or clear old entries. Consumer lag will cause backpressure.

**Q: Are messages lost if Redis crashes?**  
A: No. Outbox rows stay `status='sent'` but not ACK'd by consumer. Consumer will re-read from stream after Redis recovery (at-least-once delivery).

---

## Contacts

**Owner:** Platform Team  
**Slack:** `#platform-messaging`  
**Pager:** [messaging-dispatcher](https://pagerduty.com/services/messaging-dispatcher)

