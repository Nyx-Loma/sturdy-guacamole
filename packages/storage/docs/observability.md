# Observability Specification – `@sanctum/storage`

## Metrics

| Name | Type | Labels | Description |
| --- | --- | --- | --- |
| `storage.requests_total` | Counter | `op`, `adapter`, `namespace`, `consistency` | Total storage facade operations. |
| `storage.errors_total` | Counter | `op`, `adapter`, `namespace`, `code` | Count of failed operations by error code. |
| `storage.retries_total` | Counter | `op`, `adapter`, `namespace`, `code` | Retry attempts triggered by transient failures. |
| `storage.cb_transitions_total` | Counter | `state`, `adapter`, `namespace` | Circuit-breaker state transitions (closed → open, etc.). |
| `storage.latency_ms` | Histogram | `op`, `adapter`, `namespace` | Operation latency in milliseconds; recommended buckets `[5,10,25,50,100,250,500,1000,5000]`. |
| `storage.payload_bytes` | Histogram | `op`, `adapter`, `namespace` | Payload sizes (bytes); recommended buckets `[512,1024,2048,4096,8192,16384,32768,65536,131072]`. |
| `storage.cache.hit_ratio` | Histogram (acts as gauge) | `namespace`, `adapter` | Cache hit ratio samples; optional. |
| `storage.cache.latency_ms` | Histogram | `op`, `adapter`, `namespace` | Cache operation latency (get/set/delete). |
| `storage.cache.errors_total` | Counter | `op`, `adapter`, `namespace`, `code` | Cache-layer errors by cause. |
| `storage.cache.retries_total` | Counter | `op`, `adapter`, `namespace`, `code` | Retry attempts triggered by cache provider failures. |

### Operations (`op`)
`put_blob`, `get_blob`, `delete_blob`, `list_blob`, `upsert_record`, `get_record`, `delete_record`, `query_record`, `publish_stream`, `subscribe_stream`, `commit_cursor`.

## Logs
- Structured JSON events (through platform logger) per operation.
- Required fields: `timestamp`, `level`, `op`, `namespace`, `adapter`, `consistency`, `requestId`, `tenantId`, `actor` (`user:{uuid}` or `service:{id}`), `durationMs`, `cache` (hit/miss/bypass), `version`, `etag`, `idempotencyKey` (when present), `code` (on error).
- Special events:
  - `acl.denied` when policy denies access.
  - `object.deleted` with `hardDelete` flag.
  - `consistency.violation` when `ConsistencyError` thrown.
  - `cache.hit` / `cache.stale` / `cache.miss` / `cache.invalidate` with `cacheKey`, `stale` flag, and duration for cache operations.

## Tracing
- Span per facade call (`storage.op` attribute).
- Attributes: `storage.namespace`, `storage.adapter`, `storage.consistency`, `storage.version`, `storage.cache_state` (`hit`/`miss`/`bypass`), `storage.error_code` (if error), `storage.retry_count` (if retried), `storage.consumer_group`, `storage.cursor` (for stream ops).
- Link consumer spans (downstream services) via propagation of `traceId` from `StorageContext`.

## Implementation Notes
- `src/observability/metrics.ts` exports interfaces + `createNoopMetrics()`.
- `createStorageClient` requires metrics/tracer/logger via dependencies in production; defaults to no-ops for dev/test.
- Metrics instrumentation must wrap every public API call in the facade (start timer, increment counter, record errors, record latency, record circuit-breaker transitions).
- Unit tests should inject `createTestMetrics()` (in-memory counters/histograms) to assert increments in contract tests.
- Emit cache-specific metrics (`storage.cache.latency_ms`, `storage.cache.errors_total`, `storage.cache.retries_total`) and structured logs for cache hits/stales/misses.
- Cache layer should emit `cache.hit_ratio` samples periodically (optional for Phase 1) and propagate Redis fan-out invalidations across nodes.

## Stage 1 Dashboard & Alert Scaffold

- **SLO Targets** (per Last Layer Charter)
  - Blob/read/write p95 latency ≤ 1.5s (rolling 5m window)
  - Error rate ≤ 2% over 3m sliding window
- **Metrics required (Prometheus names)**
  - `storage.requests_total`, `storage.errors_total`, `storage.retries_total`, `storage.latency_ms`, `storage.payload_bytes`, `storage.cb_transitions_total`
  - Platform HTTP wrappers: `sanctum_http_requests_total{service,route,status}`, `sanctum_http_request_duration_seconds_bucket`
  - Error aggregation: `sanctum_errors_total{service,type}`
  - Saturation/system: `process_cpu_seconds_total`, `process_resident_memory_bytes`, `nodejs_eventloop_lag_seconds`
  - Runtime GC (node): `nodejs_gc_duration_seconds_bucket`
  - Uptime: `up{job="storage"}`
- **Dashboard panels to predefine**
  1. p95 latency by route (`histogram_quantile` over `sanctum_http_request_duration_seconds_bucket`)
  2. Error rate % by service (`rate(errors)/rate(requests)`)
  3. Request throughput (RPS)
  4. Resource saturation (CPU/RAM time series)
  5. k6 load summary (VUs, p95 latency via `http_req_duration`)
  6. Uptime/heartbeat panel (`up{job="storage"}`)
  7. Circuit breaker transitions (`storage.cb_transitions_total`)
- **Alert rules (document only for now)**
  - Error rate > 2% for 3 minutes → page on-call
  - p95 latency > 1.5s for 3 minutes → page
  - Circuit breaker open longer than 2 minutes → warn
- **Label conventions**
  - `service`, `env`, `route`, `status`, `version`, `adapter`, `namespace`
  - Keep tenant identifiers hashed/anonymized before export
- **Dashboard packaging**
  - Store JSON templates under `packages/storage/docs/dashboards/`
  - Use datasource variable `${DS_PROM}` pointing to Prometheus
  - Provide per-service dashboards plus an overall storage SLO board

### Grafana Template Stub

```json
{
  "title": "Sanctum — Storage SLOs",
  "tags": ["sanctum", "storage", "slo"],
  "templating": {
    "list": [
      { "type": "datasource", "query": "prometheus", "name": "DS_PROM" }
    ]
  },
  "panels": [
    {
      "type": "timeseries",
      "title": "p95 latency (ms)",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, sum(rate(sanctum_http_request_duration_seconds_bucket[5m])) by (le, route)) * 1000"
        }
      ]
    },
    {
      "type": "timeseries",
      "title": "Error rate (%)",
      "targets": [
        {
          "expr": "(sum(rate(sanctum_errors_total[5m])) / sum(rate(sanctum_http_requests_total[5m]))) * 100"
        }
      ]
    }
  ]
}
```

### Deployment Sequencing

1. During Stage 1, keep Alloy/Grafana disabled; run k6 & chaos tests locally/CI only.
2. When staging/prod storage service is live:
   - Enable Alloy remote_write → Grafana Cloud Prometheus
   - Import dashboard templates and bind `${DS_PROM}`
   - Activate alert rules with on-call routes
3. Maintain dashboards in Git; updates require PR review from SRE + Platform.
4. Document alert runbooks (cache stale spike, cache circuit open) in `packages/storage/docs/runbooks/cache.md` (placeholder until Stage 3).

