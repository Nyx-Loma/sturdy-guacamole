# Auth Service

Handles anonymous account creation, device assertions, pairing, recovery codes, and JWT issuance for Arqivo Chat.

## Features

- Anonymous account provisioning
- Device registration with Ed25519 assertions
- Short-lived JWTs with rotating refresh tokens
- QR-based pairing flow (init, complete, approve)
- Master recovery code hashing & verification
- CAPTCHA enforcement (Turnstile) with metrics
- Pluggable storage adapters (memory, Postgres)

## Getting Started

```bash
pnpm install
pnpm --filter services/auth dev
```

Configure via environment variables (see `src/config`). Default storage uses in-memory repositories; set `STORAGE_DRIVER=postgres` and provide `POSTGRES_URL`, `REDIS_URL` for production. Tests run with `pnpm test -- --filter auth`.

### Running with Docker Compose

```bash
docker compose -f docker-compose.dev.yml up -d auth-db auth-cache
pnpm migrate:auth
docker compose -f docker-compose.dev.yml up auth-service
```

This brings up Postgres + Redis locally and runs migrations before starting the auth service on port `8081`.

