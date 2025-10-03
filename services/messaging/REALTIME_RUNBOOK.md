# Realtime Messaging Pipeline Runbook

**Owner:** Platform Team  
**Last Updated:** 2025-10-03  
**SLA:** p95 < 2s end-to-end, error rate < 1%, consumer lag < 5s

---

## Overview

The **realtime messaging pipeline** delivers encrypted messages from HTTP API to WebSocket clients via a crash-safe, at-least-once delivery system.

**Architecture:**
```
HTTP POST → Outbox (Postgres) → Dispatcher → Redis Stream → Consumer → WebSocketHub → Clients
```

**Components:**
1. **Dispatcher**: Reads `message_outbox`, publishes to Redis Stream
2. **Consumer**: Reads Redis Stream, broadcasts to WebSocket clients
3. **WebSocketHub**: Manages WS connections, handles resume/replay

**Key Properties:**
- At-least-once delivery
- Per-conversation message ordering
- Idempotency (de-duplicate by `message_id`)
- Zero-knowledge (E2EE preserved)
- Horizontal scaling (multiple dispatchers + consumers)

---

## Configuration

### Dispatcher Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DISPATCHER_ENABLED` | `false` | Enable dispatcher (outbox → Redis) |
| `DISPATCH_TICK_MS` | `100` | Dispatcher tick interval (ms) |
| `DISPATCH_BATCH_SIZE` | `256` | Outbox rows per tick |
| `DISPATCH_MAX_ATTEMPTS` | `10` | Max retries before DLQ |
| `DISPATCH_STREAM_NAME` | `sanctum:messages` | Redis Stream name |

### Consumer Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CONSUMER_ENABLED` | `false` | Enable consumer (Redis → WS) |
| `CONSUMER_GROUP_NAME` | `messaging-hub` | Redis consumer group |
| `CONSUMER_NAME` | `consumer-1` | Consumer instance name (unique per pod) |
| `CONSUMER_BATCH_SIZE` | `128` | Messages per `XREADGROUP` call |
| `CONSUMER_BLOCK_MS` | `1000` | Block timeout for `XREADGROUP` (ms) |

### Shared Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_STREAM_MAXLEN` | `1000000` | Stream max length (MAXLEN ~) |
| `POSTGRES_URL` | — | Postgres connection string (required) |
| `REDIS_URL` | — | Redis connection string (required) |
| `WEBSOCKET_HEARTBEAT_INTERVAL_MS` | `30000` | WS heartbeat interval |

---

## Rollout Procedure

### Pre-Flight Checklist

- [ ] Migrations applied (`20250203_message_outbox.sql`)
- [ ] Integration tests passing (`pnpm test:integration`)
- [ ] Metrics/alerts configured (see **Monitoring** section)
- [ ] Runbook reviewed by on-call team
- [ ] Staging environment validated (24h soak test)

### Phased Rollout

**Phase 1: Enable Dispatcher Only (Outbox → Redis)**

1. Enable dispatcher on canary pod (5% traffic):
   ```bash
   kubectl set env deployment/messaging DISPATCHER_ENABLED=true --selector canary=true
   ```

2. Monitor for 30 minutes:
   - `messaging_outbox_sent_total` increasing
   - `messaging_dispatch_published_total` ≈ `sent_total`
   - `messaging_outbox_dead_total` = 0
   - Error rate < 1%

3. If stable, scale to 100%:
   ```bash
   kubectl set env deployment/messaging DISPATCHER_ENABLED=true
   ```

**Phase 2: Enable Consumer (Redis → WS)**

1. Enable consumer on canary pod:
   ```bash
   kubectl set env deployment/messaging CONSUMER_ENABLED=true --selector canary=true
   ```

2. Monitor for 30 minutes:
   - `messaging_consumer_delivered_total` increasing
   - `messaging_consumer_ack_total` ≈ `delivered_total`
   - `messaging_consumer_lag_seconds` p95 < 5s
   - WebSocket clients receiving messages

3. If stable, scale to 100%:
   ```bash
   kubectl set env deployment/messaging CONSUMER_ENABLED=true
   ```

**Rollback:**
```bash
# Disable both immediately
kubectl set env deployment/messaging DISPATCHER_ENABLED=false CONSUMER_ENABLED=false
```

---

## Monitoring

### Key Metrics

#### End-to-End Latency

| Metric | Alert Threshold |
|--------|----------------|
| `messaging_consumer_lag_seconds` (p95) | < 5s |
| `messaging_consumer_lag_seconds` (p99) | < 10s |

```promql
# p95 end-to-end latency
histogram_quantile(0.95, rate(messaging_consumer_lag_seconds_bucket[5m]))
```

#### Dispatcher Health

| Metric | Alert Threshold |
|--------|----------------|
| `messaging_dispatch_ticks_total{result="ok"}` | Increasing |
| `messaging_outbox_sent_total` / `messaging_outbox_picked_total` | > 0.95 |
| `messaging_outbox_dead_total` | 0 |

#### Consumer Health

| Metric | Alert Threshold |
|--------|----------------|
| `messaging_consumer_delivered_total` | ≈ `messaging_dispatch_published_total` (with lag) |
| `messaging_consumer_ack_total` | ≈ `messaging_consumer_delivered_total` |
| `messaging_consumer_failures_total{reason}` | < 1% of `delivered_total` |

#### WebSocket Health

| Metric | Alert Threshold |
|--------|----------------|
| `transport_connections_total` | Stable/increasing |
| `transport_messages_sent_total` | ≈ `messaging_consumer_delivered_total` |

### Grafana Dashboard

```
Realtime Messaging Overview
├── End-to-End Latency (p50, p95, p99)
├── Throughput (messages/sec at each stage)
│   ├── Outbox → Dispatcher
│   ├── Dispatcher → Redis
│   ├── Redis → Consumer
│   └── Consumer → WebSocket
├── Error Rate (% per component)
├── Consumer Lag (seconds behind dispatcher)
└── WebSocket Connections (active, new, closed)
```

**PromQL Queries:**

```promql
# End-to-end throughput
rate(messaging_consumer_delivered_total[1m])

# Consumer lag
rate(messaging_dispatch_published_total[5m]) - rate(messaging_consumer_ack_total[5m])

# Error rate
rate(messaging_consumer_failures_total[1m]) / rate(messaging_consumer_fetch_total[1m])
```

---

## Alerts

### Critical

```yaml
- alert: RealtimePipelineDown
  expr: rate(messaging_consumer_delivered_total[2m]) == 0
  for: 3m
  annotations:
    summary: "No messages delivered in 3 minutes"
    runbook: "Check dispatcher + consumer logs"

- alert: ConsumerHighLag
  expr: |
    histogram_quantile(0.95,
      rate(messaging_consumer_lag_seconds_bucket[5m])
    ) > 10
  for: 5m
  annotations:
    summary: "Consumer lag p95 > 10s"
    runbook: "Scale consumer pods or check Redis"

- alert: ConsumerHighFailureRate
  expr: |
    rate(messaging_consumer_failures_total[3m])
      /
    rate(messaging_consumer_fetch_total[3m]) > 0.01
  for: 3m
  annotations:
    summary: "Consumer failure rate > 1%"
    runbook: "Check consumer logs + WS hub"
```

### Warning

```yaml
- alert: ConsumerDedupeHigh
  expr: rate(messaging_consumer_dedupe_skips_total[5m]) > 10
  for: 10m
  annotations:
    summary: "High dedupe rate (duplicate messages)"
    runbook: "Investigate dispatcher/outbox logic"
```

---

## Troubleshooting

### No Messages Delivered to WebSocket Clients

**Symptoms:** `messaging_consumer_delivered_total` flat or `transport_messages_sent_total` not increasing

**Checks:**
1. Is `CONSUMER_ENABLED=true`?
   ```bash
   kubectl get pods -l app=messaging -o jsonpath='{.items[*].spec.containers[*].env[?(@.name=="CONSUMER_ENABLED")].value}'
   ```

2. Is dispatcher publishing?
   ```bash
   redis-cli XLEN sanctum:messages
   ```

3. Check consumer logs:
   ```bash
   kubectl logs -l app=messaging --tail=100 | grep consumer
   ```

**Common Causes:**
- `CONSUMER_ENABLED=false` (forgot to enable)
- Redis consumer group not created (auto-created on first start, check logs)
- WebSocketHub not wired (check server.ts initialization)

**Fix:**
- Enable consumer: `kubectl set env deployment/messaging CONSUMER_ENABLED=true`
- Restart pods if group creation failed

---

### High Consumer Lag

**Symptoms:** `messaging_consumer_lag_seconds` p95 > 10s

**Diagnosis:**
```bash
# Check Redis Stream length
redis-cli XLEN sanctum:messages

# Check consumer group pending
redis-cli XPENDING sanctum:messages messaging-hub
```

**Common Causes:**
- Consumer can't keep up with dispatcher throughput
- WebSocketHub broadcast slow (too many connections)
- Network latency between Redis and consumer pods

**Fix:**
1. Scale consumer pods:
   ```bash
   kubectl scale deployment/messaging --replicas=5
   ```

2. Increase `CONSUMER_BATCH_SIZE`:
   ```bash
   kubectl set env deployment/messaging CONSUMER_BATCH_SIZE=256
   ```

3. Check WebSocketHub metrics:
   ```bash
   curl http://<pod-ip>:8083/ws/metrics | grep transport_
   ```

---

### Consumer Failures Spiking

**Symptoms:** `messaging_consumer_failures_total{reason}` increasing

**Diagnosis:**
```bash
# Check failure reasons in logs
kubectl logs -l app=messaging --tail=500 | grep "consumer_fetch_error\|broadcast_failed"
```

**Common Causes:**
- Redis unavailable (network partition)
- WebSocketHub throwing errors (invalid envelope)
- Malformed payload in Redis Stream

**Fix:**
- If Redis down: restart Redis or fail over
- If broadcast errors: check WS hub logs, validate envelope schema
- If parse errors: identify bad messages and ACK manually:
  ```bash
  redis-cli XACK sanctum:messages messaging-hub <message-id>
  ```

---

### Duplicate Messages Delivered

**Symptoms:** Clients receive same `message_id` twice

**Root Cause:** Consumer crashed before ACK, Redis re-delivered

**Expected Behavior:** This is correct (at-least-once semantics). Clients must de-duplicate by `message_id`.

**Verification:**
```bash
# Check dedupe skips
curl http://<pod-ip>:8083/metrics | grep messaging_consumer_dedupe_skips_total
```

**If systematic** (many duplicates):
- Check consumer restart frequency (OOM, crash loop?)
- Increase ACK timeout: consumer ACKs only after successful broadcast

---

## Operations

### Manual Message Replay

To replay messages for a specific conversation:

```sql
-- 1. Find messages in outbox (already sent)
SELECT id, message_id, aggregate_id, payload
FROM messaging.message_outbox
WHERE aggregate_id = '<conversation-id>'
  AND status = 'sent'
  AND occurred_at > NOW() - INTERVAL '24 hours';

-- 2. Reset to pending (dispatcher will re-publish)
UPDATE messaging.message_outbox
SET status = 'pending', attempts = 0, dispatched_at = NULL
WHERE aggregate_id = '<conversation-id>'
  AND occurred_at > NOW() - INTERVAL '1 hour';
```

**Note:** This will cause duplicate delivery. Ensure clients handle idempotency.

---

### Scale Consumer Horizontally

```bash
# Add more consumer pods
kubectl scale deployment/messaging --replicas=10

# Each pod gets a unique CONSUMER_NAME via pod name
kubectl set env deployment/messaging CONSUMER_NAME='$(POD_NAME)'
```

**Redis consumer group** will distribute messages across all consumers automatically.

---

### Drain Consumer Before Shutdown

Consumer stops gracefully on `SIGTERM`:
1. Stops reading new messages from Redis
2. Drains in-flight buffers (broadcasts pending messages)
3. ACKs all successfully delivered messages
4. Exits

**Verify drain:**
```bash
kubectl logs <pod-name> --tail=50 | grep consumer_stopped
```

---

## Testing Locally

### Start Dependencies

```bash
cd services/messaging
docker-compose -f docker-compose.test.yml up -d

# Apply migrations
export DATABASE_URL=postgres://postgres:postgres@localhost:5433/messaging_test
psql $DATABASE_URL -f src/adapters/postgres/migrations/20250203_message_outbox.sql
```

### Enable Full Pipeline

```bash
export DISPATCHER_ENABLED=true
export CONSUMER_ENABLED=true
export REDIS_URL=redis://localhost:6380

pnpm run -w messaging:dev
```

### Send Test Message

```bash
# Insert into outbox (simulates HTTP POST)
psql $DATABASE_URL <<EOF
INSERT INTO messaging.message_outbox (event_id, message_id, event_type, aggregate_id, payload)
VALUES (gen_random_uuid(), gen_random_uuid(), 'MessageCreated', gen_random_uuid(), '{"ciphertext": "test"}');
EOF
```

### Verify Delivery

```bash
# Check Redis Stream
redis-cli -p 6380 XLEN sanctum:messages

# Check consumer logs
# (WebSocket client would receive message)
```

### Run E2E Integration Tests

```bash
export DATABASE_URL=postgres://postgres:postgres@localhost:5433/messaging_test
export REDIS_URL=redis://localhost:6380

pnpm vitest run services/messaging/src/tests/integration/realtime
pnpm vitest run services/messaging/src/tests/integration/dispatcher
```

---

## FAQ

**Q: Can I enable consumer without dispatcher?**  
A: No. Consumer reads from Redis Stream populated by dispatcher. Enable dispatcher first.

**Q: What happens if consumer crashes mid-delivery?**  
A: Messages stay in Redis Stream (not ACK'd). Next consumer read will re-deliver (at-least-once).

**Q: How do I know if a message was delivered?**  
A: Check `messaging_consumer_ack_total` metric. If ACK'd, it was broadcast to WebSocket clients.

**Q: Can multiple consumers run on same stream?**  
A: Yes. Redis consumer group distributes messages across all consumers in `CONSUMER_GROUP_NAME`.

**Q: What if Redis Stream fills up (MAXLEN reached)?**  
A: Old messages are trimmed (`MAXLEN ~ 1M`). If consumer is very slow, messages may be lost. Monitor `messaging_consumer_lag_seconds`.

**Q: How do I replay messages for a specific user?**  
A: Reset outbox rows to `status='pending'` for that conversation. Dispatcher will re-publish.

**Q: Are messages encrypted in Redis?**  
A: Yes. Only encrypted ciphertext is stored/transmitted. Server never sees plaintext.

---

## Contacts

**Owner:** Platform Team  
**Slack:** `#platform-messaging`  
**Pager:** [messaging-realtime](https://pagerduty.com/services/messaging-realtime)

