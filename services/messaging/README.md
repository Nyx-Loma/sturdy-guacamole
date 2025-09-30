# Messaging Service

Messaging now uses a port-based architecture with separate read/write/event ports for messages and conversations. Adapters are provided for in-memory and Postgres backends, with contract tests under `src/tests/unit/ports` and integration suites in `src/tests/integration/ports`.

## Testing

Run unit tests:

```
pnpm vitest run services/messaging/src/tests/unit/ports
```

Run integration tests (requires `DATABASE_URL`):

```
pnpm vitest run --project integration services/messaging/src/tests/integration/ports
```

