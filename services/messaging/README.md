# Messaging Service

Messaging now uses a port-based architecture with separate read/write/event ports for messages and conversations. Adapters are provided for in-memory and Postgres backends, with contract tests under `src/tests/unit/ports` and integration suites in `src/tests/integration/ports`.

## Authentication

- Set `JWT_JWKS_URL` (preferred) or `JWT_PUBLIC_KEY` for verifying inbound tokens.
- Required env: `JWT_ISSUER`, `JWT_AUDIENCE`, optional `JWT_ALGS` (default `RS256,ES256`), `JWT_CLOCK_SKEW` (seconds).
- Metrics exposed: `sanctum_auth_requests_total`, `sanctum_auth_latency_ms`, JWKS cache counters.
- WebSocket connections must pass `Authorization: Bearer <token>` during upgrade.

## Testing

Run unit tests:

```
pnpm vitest run services/messaging/src/tests/unit/ports
```

Run integration tests (requires `DATABASE_URL`):

```
pnpm vitest run --project integration services/messaging/src/tests/integration/ports
```

