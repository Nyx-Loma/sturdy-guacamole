# Contributing to Sanctum Platform

Thank you for contributing to Sanctum! This guide will help you get set up and productive quickly.

## 🚀 Quick Setup (5 minutes)

### Prerequisites
- **Node.js** 20+ 
- **pnpm** 8+
- **Docker** (for integration tests)

### Installation

```bash
# Clone the repository
git clone https://github.com/Nyx-Loma/sanctum-platform.git
cd sanctum-platform

# Install dependencies
pnpm install

# Run unit tests (no database required)
pnpm test
```

That's it! You can now run tests and develop locally.

## 🧪 Testing

### Running Tests

```bash
# Run all tests (unit + integration)
pnpm test

# Run only unit tests (no database required)
pnpm vitest run --project unit

# Run only integration tests (requires database)
pnpm vitest run --project integration
```

### Integration Tests Setup

Integration tests require a PostgreSQL database. We've made this easy:

**Option 1: Automatic Setup (Recommended)**
```bash
# Start database and initialize schema
pnpm db:setup:messaging

# Now run all tests
pnpm test
```

**Option 2: Manual Setup**
```bash
# Start the database container
docker-compose -f docker-compose.dev.yml up -d messaging-db

# Wait for it to be ready
until docker-compose -f docker-compose.dev.yml exec -T messaging-db pg_isready -U messaging > /dev/null 2>&1; do
  sleep 1
done

# Apply schema
docker-compose -f docker-compose.dev.yml exec -T messaging-db \
  psql -U messaging -d messaging < services/messaging/schema.sql

# Run tests
pnpm test
```

### What Happens Without Database?

If the database isn't running, **integration tests will skip gracefully** instead of failing. You'll see:

```
✓ |unit| services/messaging/... (50 tests) 
↓ |integration| services/messaging/... (5 tests | 5 skipped)
```

The skipped tests will show a helpful message:
```
⚠️  Database not available: connect ECONNREFUSED 127.0.0.1:5433
💡 Integration tests will be skipped. To run them:
   1. Start database: docker-compose -f docker-compose.dev.yml up -d messaging-db
   2. Initialize schema: pnpm db:setup:messaging
```

This ensures:
- ✅ Unit tests always run
- ✅ CI can run without database (if needed)
- ✅ Clear feedback when database is missing
- ✅ No false test failures

## 📝 Development Workflow

### Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write tests first (TDD recommended)
   - Ensure code follows existing patterns
   - Add inline documentation for complex logic

3. **Run checks locally**
   ```bash
   # Linting
   pnpm lint
   
   # Type checking
   pnpm typecheck
   
   # Tests
   pnpm test
   
   # Coverage check
   pnpm check:coverage
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```
   
   We use [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New features
   - `fix:` - Bug fixes
   - `docs:` - Documentation changes
   - `test:` - Test additions/changes
   - `refactor:` - Code refactoring
   - `chore:` - Build/tooling changes

5. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

### Testing Strategy

- **Unit tests** - Test individual functions/classes in isolation
- **Integration tests** - Test database interactions, adapters
- **Property tests** - Test with generated data (using fast-check)
- **Contract tests** - Test port interfaces are correctly implemented

## 🏗️ Project Structure

```
.
├── apps/
│   └── server/              # Main application entry points
├── packages/
│   ├── crypto/              # E2EE crypto primitives (mature ✅)
│   ├── transport/           # WebSocket transport (mature ✅)
│   └── config/              # Configuration management
├── services/
│   ├── auth/                # Authentication service (ready ✅)
│   ├── directory/           # User directory service (ready ✅)
│   ├── messaging/           # Messaging service (in development)
│   ├── media/               # Media uploads (scaffold)
│   ├── backup/              # Backup/recovery (scaffold)
│   └── admin/               # Admin dashboard (scaffold)
└── scripts/                 # Utility scripts
```

## 🎯 Code Quality Standards

### Coverage Requirements

- **Overall**: 85% statements, functions
- **Branches**: 75%
- **Auth service**: 90% per-file (statements, functions, branches 85%)
- **Crypto package**: 85% per-file

Run `pnpm check:coverage` to validate.

### Type Safety

- No `any` types (use `unknown` when necessary)
- All functions have explicit return types
- Use branded types for IDs (e.g., `Uuid`, `IsoDateTime`)

### Testing Best Practices

```typescript
// ✅ Good: Descriptive test names
it('creates message and respects idempotency key', async () => {
  // Arrange
  const command = { input: baseInput, idempotencyKey: 'key-1' };
  
  // Act
  const id1 = await adapter.create(command);
  const id2 = await adapter.create(command);
  
  // Assert
  expect(id1).toBe(id2);
});

// ❌ Bad: Vague test names, unclear assertions
it('works', async () => {
  const result = await doSomething();
  expect(result).toBeTruthy();
});
```

## 🔍 Debugging

### Database Issues

```bash
# Check if database is running
docker ps | grep messaging-db

# View database logs
docker-compose -f docker-compose.dev.yml logs messaging-db

# Connect to database
docker-compose -f docker-compose.dev.yml exec messaging-db \
  psql -U messaging -d messaging

# Reset database
docker-compose -f docker-compose.dev.yml down messaging-db
pnpm db:setup:messaging
```

### Test Debugging

```bash
# Run specific test file
pnpm vitest run path/to/test.ts

# Run tests in watch mode
pnpm vitest watch

# Run with verbose output
pnpm vitest run --reporter=verbose

# Run single test
pnpm vitest run -t "test name pattern"
```

## 📚 Additional Resources

- **Architecture**: See service-specific README files
- **Deployment**: See [RUNBOOK.md](./RUNBOOK.md)
- **Production Roadmap**: See [PRODUCTION_ROADMAP.md](./PRODUCTION_ROADMAP.md)
- **Security**: See `packages/crypto/docs/crypto-audit.md`

## 🤝 Getting Help

- Check existing documentation first
- Look for similar code patterns in the codebase
- Review recent PRs for examples
- Ask questions in your PR (we're happy to help!)

## ✅ PR Checklist

Before submitting your PR:

- [ ] Tests pass locally (`pnpm test`)
- [ ] Linter passes (`pnpm lint`)
- [ ] Type check passes (`pnpm typecheck`)
- [ ] Coverage meets thresholds (`pnpm check:coverage`)
- [ ] Code follows existing patterns
- [ ] Added tests for new functionality
- [ ] Updated documentation if needed
- [ ] Commit messages follow Conventional Commits

## 🎉 Thank You!

Your contributions make Sanctum better for everyone. We appreciate your time and effort!

