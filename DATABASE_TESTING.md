# Database Testing Guide

## Overview

Integration tests in this project are designed to be **developer-friendly** and **CI-compatible**:

- ✅ Tests **skip gracefully** when the database isn't available (no failures)
- ✅ Clear **helpful messages** guide setup
- ✅ **One command** to set up everything: `pnpm db:setup:messaging`
- ✅ Works in **both local and CI** environments

## Quick Start

### For Local Development (Without Database)

```bash
# Just run tests - integration tests will skip
pnpm test
```

**Output:**
```
✓ |unit| services/messaging/... (50 tests) 
↓ |integration| services/messaging/... (5 tests | 5 skipped)

⚠️  Database not available: connect ECONNREFUSED 127.0.0.1:5433
💡 Integration tests will be skipped. To run them:
   1. Start database: docker-compose -f docker-compose.dev.yml up -d messaging-db
   2. Initialize schema: pnpm db:setup:messaging
```

### For Running Integration Tests

```bash
# One command setup (recommended)
pnpm db:setup:messaging

# Now all tests run
pnpm test
```

**Output:**
```
✓ |unit| services/messaging/... (50 tests) 
✓ |integration| services/messaging/... (17 tests)

Test Files  153 passed (153)
     Tests  680 passed (680)
```

## Architecture

### Health Check System

All integration tests use a shared database health check:

```typescript
// services/messaging/src/tests/integration/helpers/dbHealthCheck.ts
export const checkDatabaseHealth = async (connectionString: string) => {
  // Attempts connection
  // Returns { available: true } or { available: false, error: '...' }
}
```

### Test Setup Helper

Each integration test uses `setupDatabaseTests()`:

```typescript
// Example from messagesReadPort.integration.test.ts
import { setupDatabaseTests } from '../../helpers/setupDatabase';

const { client, available } = setupDatabaseTests(process.env.DATABASE_URL, {
  truncateTables: ['messaging.message_idempotency', 'messaging.messages']
});

it.skipIf(!available)('finds messages by id', async () => {
  // Test implementation
});
```

**What this does:**
1. Checks database availability before tests run
2. Shows helpful error messages if DB is missing
3. Automatically truncates tables between tests
4. Skips tests if database is unavailable
5. Properly cleans up connections

### Skip Behavior

Tests use Vitest's `it.skipIf()` API:

```typescript
it.skipIf(!available)('test name', async () => {
  // This test only runs if database is available
});
```

## CI Configuration

GitHub Actions automatically:

1. **Starts PostgreSQL** as a service container
2. **Initializes schema** before running tests
3. **Sets DATABASE_URL** environment variable
4. **Runs all tests** (including integration tests)

See `.github/workflows/ci.yml` for details.

## Manual Database Setup

If you prefer manual control:

```bash
# Start database
docker-compose -f docker-compose.dev.yml up -d messaging-db

# Wait for readiness
until docker-compose -f docker-compose.dev.yml exec -T messaging-db \
  pg_isready -U messaging > /dev/null 2>&1; do
  sleep 1
done

# Apply schema
docker-compose -f docker-compose.dev.yml exec -T messaging-db \
  psql -U messaging -d messaging < services/messaging/schema.sql

# Run tests
pnpm test
```

## Database Connection

**Default connection (configured in `vitest.global.setup.ts`):**
```
postgresql://messaging:messaging@localhost:5433/messaging
```

**Override with environment variable:**
```bash
DATABASE_URL=postgresql://user:pass@host:port/db pnpm test
```

## Troubleshooting

### Integration tests are skipping

**This is normal!** If you haven't run the database setup, integration tests skip automatically.

To run them:
```bash
pnpm db:setup:messaging
pnpm test
```

### "ECONNREFUSED" error

The database isn't running. Start it:
```bash
docker-compose -f docker-compose.dev.yml up -d messaging-db
```

### Schema errors

Reinitialize the schema:
```bash
pnpm db:setup:messaging
```

### Docker not running

Start Docker Desktop, then:
```bash
pnpm db:setup:messaging
```

## File Structure

```
services/messaging/
├── src/tests/integration/
│   ├── helpers/
│   │   ├── dbHealthCheck.ts      # Database availability checks
│   │   └── setupDatabase.ts      # Test setup helper
│   └── ports/
│       ├── messages/
│       │   ├── messagesReadPort.integration.test.ts
│       │   └── messagesWritePort.integration.test.ts
│       └── conversations/
│           ├── conversationsReadPort.integration.test.ts
│           └── conversationsWritePort.integration.test.ts
├── schema.sql                     # Database schema
└── ...

scripts/
└── setup-messaging-db.sh          # Automated setup script

.github/workflows/
└── ci.yml                         # CI configuration with DB setup
```

## Best Practices

### Writing New Integration Tests

```typescript
import { setupDatabaseTests } from '../../helpers/setupDatabase';

describe('MyAdapter (integration)', () => {
  if (!process.env.DATABASE_URL) {
    it.skip('skipped: DATABASE_URL not configured');
    return;
  }

  const { client, available } = setupDatabaseTests(process.env.DATABASE_URL, {
    truncateTables: ['messaging.my_table']
  });

  const adapter = createMyAdapter({ sql: client });

  it.skipIf(!available)('does something', async () => {
    // Test implementation
  });
});
```

### Key Points

1. **Always check `DATABASE_URL`** - First-level check
2. **Use `setupDatabaseTests()`** - Handles connection & cleanup
3. **Use `it.skipIf(!available)`** - Graceful skipping
4. **List tables in dependency order** - For cascade truncates

## Summary

This approach provides:
- ✅ **Zero friction** for new developers (tests "just work")
- ✅ **Clear feedback** when database is needed
- ✅ **No false failures** in CI or local development
- ✅ **Easy setup** with one command
- ✅ **Proper cleanup** between tests
- ✅ **Production-ready** CI configuration

Perfect balance between developer experience and test reliability!

