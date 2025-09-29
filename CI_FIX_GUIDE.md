# 🔧 CI Fix Guide - IMMEDIATE ACTION REQUIRED

**Status:** 🔴 **BLOCKING ALL MERGES**  
**Issue:** GitHub Actions failing while tests pass locally  
**Priority:** P0 - CRITICAL  
**ETA:** 2-3 days

---

## 🎯 Quick Diagnosis

### Symptoms:
- ✅ Tests pass locally: `pnpm test` works
- ❌ CI fails in GitHub Actions
- ⚠️ Likely service connection issues (Postgres/Redis)

### Root Causes (Suspected):
1. **Duplicate pnpm setup** (lines 64-72 in ci.yml)
2. **Service hostname resolution** timing issues
3. **Health check intervals too aggressive** (5s)
4. **Database/Redis connection race conditions**

---

## 🔍 Step 1: Diagnostic Commands

Run these **locally first** to verify baseline:

```bash
# 1. Check current test status
pnpm test

# 2. Verify TypeScript compilation
pnpm exec tsc --noEmit

# 3. Run lint
pnpm lint

# 4. Test with Docker services (simulate CI)
docker compose -f docker-compose.dev.yml up -d auth-db auth-cache

# Wait for services
sleep 10

# Run tests with CI-like environment
export CI=true
export NODE_ENV=test
export POSTGRES_URL=postgres://auth:auth@localhost:5432/auth
export REDIS_URL=redis://localhost:6379
pnpm test

# Cleanup
docker compose -f docker-compose.dev.yml down
```

**Expected:** All tests should pass ✅

---

## 🛠️ Step 2: Fix ci.yml

### Fix 1: Remove Duplicate pnpm Setup

**File:** `.github/workflows/ci.yml`

**Problem:** Lines 64-72 duplicate lines 57-66

```yaml
# REMOVE THESE LINES (64-72):
      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9
```

**After fix:**
```yaml
      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies  # Next step, no duplicate
        run: pnpm install --frozen-lockfile
```

---

### Fix 2: Improve Health Checks

**File:** `.github/workflows/ci.yml`

**Change health check intervals:**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: postgres
    options: >-
      --health-cmd="pg_isready -U postgres -d postgres"
      --health-interval=10s        # was 5s
      --health-timeout=10s          # was 5s
      --health-retries=30           # was 20

  redis:
    image: redis:7-alpine
    options: >-
      --health-cmd="redis-cli ping || exit 1"
      --health-interval=10s        # was 5s
      --health-timeout=10s          # was 5s
      --health-retries=30           # was 20
```

---

### Fix 3: Enhanced Wait Scripts with DNS Checks

**File:** `.github/workflows/ci.yml`

**Replace existing wait scripts:**

```yaml
      - name: Wait for Postgres (enhanced)
        shell: bash
        run: |
          echo "🔍 Checking Postgres DNS resolution..."
          getent hosts postgres || echo "⚠️  DNS not yet resolved (normal in CI)"
          
          echo "⏳ Waiting for Postgres to be ready..."
          for i in {1..60}; do
            echo "  Attempt $i/60..."
            if (echo > /dev/tcp/postgres/5432) >/dev/null 2>&1; then
              echo "✅ Postgres is accepting connections!"
              # Double-check with pg_isready
              if pg_isready -h postgres -p 5432 -U postgres -d postgres 2>&1; then
                echo "✅ Postgres is READY!"
                break
              fi
            fi
            
            if [ $i -eq 60 ]; then
              echo "❌ ERROR: Postgres failed to become ready after 3 minutes"
              echo "📋 Docker service logs:"
              docker ps -a
              exit 1
            fi
            
            sleep 3
          done

      - name: Wait for Redis (enhanced)
        shell: bash
        run: |
          echo "🔍 Checking Redis DNS resolution..."
          getent hosts redis || echo "⚠️  DNS not yet resolved (normal in CI)"
          
          echo "⏳ Waiting for Redis to be ready..."
          for i in {1..60}; do
            echo "  Attempt $i/60..."
            if (echo > /dev/tcp/redis/6379) >/dev/null 2>&1; then
              echo "✅ Redis is accepting connections!"
              # Double-check with ping
              if redis-cli -h redis -p 6379 ping 2>&1 | grep -q PONG; then
                echo "✅ Redis is READY!"
                break
              fi
            fi
            
            if [ $i -eq 60 ]; then
              echo "❌ ERROR: Redis failed to become ready after 3 minutes"
              echo "📋 Docker service logs:"
              docker ps -a
              exit 1
            fi
            
            sleep 3
          done
```

---

### Fix 4: Add Debugging Step

**File:** `.github/workflows/ci.yml`

**Add after "Install dependencies":**

```yaml
      - name: Debug CI Environment
        run: |
          echo "=== Node & pnpm versions ==="
          node -v
          pnpm -v
          
          echo "=== Environment Variables ==="
          env | grep -E '(NODE_ENV|CI|POSTGRES|REDIS|DATABASE)' || true
          
          echo "=== Network Connectivity ==="
          echo "Postgres host: postgres"
          getent hosts postgres || echo "Cannot resolve postgres"
          
          echo "Redis host: redis"
          getent hosts redis || echo "Cannot resolve redis"
          
          echo "=== Workspace Contents ==="
          ls -la
          
          echo "=== Package.json scripts ==="
          cat package.json | grep -A 5 '"scripts"'
```

---

### Fix 5: Environment Variable Consistency

**File:** `.github/workflows/ci.yml`

**Ensure both variables are set (some code may use one or the other):**

```yaml
env:
  CI: true
  NODE_ENV: test
  STORAGE_DRIVER: memory
  
  # Use both for maximum compatibility
  DATABASE_URL: postgres://postgres:postgres@postgres:5432/postgres
  POSTGRES_URL: postgres://postgres:postgres@postgres:5432/postgres
  
  REDIS_URL: redis://redis:6379
  
  # JWT defaults
  JWT_SECRET: test-secret-min-32-chars-long-for-security
  JWT_ISSUER: sanctum-auth
  JWT_AUDIENCE: sanctum-client
  
  # Disable external services
  CAPTCHA_PROVIDER: none
  KMS_MODE: inmemory
  RATE_LIMIT_DISABLED: 'true'
```

---

## 🚀 Step 3: Test the Fixes

### Commit and Push

```bash
# Create fix branch
git checkout -b fix/ci-github-actions

# Stage changes
git add .github/workflows/ci.yml

# Commit with descriptive message
git commit -m "fix(ci): resolve GitHub Actions failures

- Remove duplicate pnpm setup (lines 64-72)
- Increase health check intervals (5s → 10s) and retries (20 → 30)
- Add enhanced wait scripts with DNS resolution checks
- Add CI debugging output
- Ensure DATABASE_URL and POSTGRES_URL both set
- Add error handling and timeout messages

This should resolve the issue where CI fails in GitHub Actions
but passes locally."

# Push to remote
git push -u origin fix/ci-github-actions
```

### Create Pull Request

1. Go to: https://github.com/Nyx-Loma/sturdy-guacamole/pulls
2. Click "New Pull Request"
3. Base: `main` (or `staging` if using branching strategy)
4. Compare: `fix/ci-github-actions`
5. Title: `🔧 Fix CI: Resolve GitHub Actions failures`
6. Description:

```markdown
## Problem
CI fails in GitHub Actions but passes locally.

## Root Causes
1. Duplicate pnpm setup causing PATH issues
2. Service health checks too aggressive (5s interval)
3. Wait scripts lacking DNS checks and better logging
4. Potential environment variable inconsistencies

## Solution
- ✅ Removed duplicate pnpm setup
- ✅ Increased health check intervals to 10s
- ✅ Enhanced wait scripts with DNS checks and verbose logging
- ✅ Added CI debugging step
- ✅ Ensured DATABASE_URL and POSTGRES_URL both set

## Testing
- [ ] Run CI workflow and verify it passes
- [ ] Check logs for enhanced debugging output
- [ ] Verify all test suites pass (unit, integration, coverage)
- [ ] Confirm no flaky tests over 3 runs

## Related
Blocks: Repository migration to sturdy-guacamole
Part of: PRODUCTION_ROADMAP.md Phase 0
```

---

## 🔍 Step 4: Monitor CI Run

### Watch the workflow:
1. Go to Actions tab: https://github.com/Nyx-Loma/sturdy-guacamole/actions
2. Click on the running workflow
3. Expand each step to see logs

### What to look for:

**✅ Success Indicators:**
```
✅ Postgres is READY!
✅ Redis is READY!
✅ Typecheck passed
✅ Lint passed
✅ Tests passed
✅ Coverage thresholds met
```

**❌ Failure Indicators (if still failing):**
```
❌ ERROR: Postgres failed to become ready
❌ Cannot resolve postgres
❌ Connection refused
❌ Test timeout
```

---

## 🆘 Step 5: If Still Failing (Backup Plans)

### Backup Plan A: Install PostgreSQL client in CI

**Add before "Wait for Postgres":**
```yaml
      - name: Install PostgreSQL client
        run: |
          sudo apt-get update
          sudo apt-get install -y postgresql-client redis-tools
```

### Backup Plan B: Use different service hostnames

**Try using `localhost` instead of service names:**
```yaml
env:
  POSTGRES_URL: postgres://postgres:postgres@localhost:5432/postgres
  REDIS_URL: redis://localhost:6379
```

**And map service ports:**
```yaml
services:
  postgres:
    ports:
      - 5432:5432
  redis:
    ports:
      - 6379:6379
```

### Backup Plan C: Use GitHub-hosted PostgreSQL service

```yaml
# Remove postgres service, use GitHub-hosted
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_PASSWORD: postgres
    ports:
      - 5432:5432
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

### Backup Plan D: Switch to tests.yml workflow

The `tests.yml` workflow is more comprehensive and may work better:
- Uses separate jobs for setup, lint, typecheck, unit, integration
- Has better service configuration
- Includes retry logic

**Consider focusing efforts on `tests.yml` instead of `ci.yml`**

---

## 📊 Step 6: Verify Success

Once CI is passing:

```bash
# 1. Merge the PR
# 2. Verify main branch CI passes
# 3. Tag success state
git checkout main
git pull origin main
git tag -a ci-fixed-v1 -m "CI GitHub Actions fixed and passing"
git push origin ci-fixed-v1

# 4. Update roadmap
echo "✅ Phase 0, Step 2 complete: CI Fixed" >> PRODUCTION_ROADMAP.md
git add PRODUCTION_ROADMAP.md
git commit -m "docs: mark CI fix as complete"
git push origin main
```

---

## 🎯 Success Criteria

- [ ] All GitHub Actions workflows green ✅
- [ ] No flaky tests (3 consecutive successful runs)
- [ ] CI completes in <10 minutes
- [ ] Enhanced logging provides clear diagnostics
- [ ] Team can merge PRs without CI blocking

---

## 📞 Need Help?

### Debug Checklist:
1. Check GitHub Actions logs (full output)
2. Compare local vs CI environment variables
3. Test with docker-compose locally (simulates CI)
4. Verify service hostnames resolve in CI
5. Check for network policies/firewall issues

### Common Issues:

**Issue:** "Cannot resolve postgres"
**Solution:** Services need time to start; increase retries

**Issue:** "Connection refused"
**Solution:** Services not ready; increase health check intervals

**Issue:** "Tests timeout"
**Solution:** DB migrations taking too long; optimize or increase test timeout

**Issue:** "pg_isready: command not found"
**Solution:** Install postgresql-client in CI (Backup Plan A)

---

## 🚀 Next Steps After CI Fix

Once CI is passing, proceed to:
1. ✅ Step 0.3: Repository Migration
2. ✅ Step 0.4: Verification & Handoff
3. ✅ Phase 1: Stabilize Foundation

**Remember:** CI must be green before migrating to new repo!

---

**Document Version:** 1.0  
**Last Updated:** September 29, 2025  
**Status:** 🔴 URGENT - Fix in progress
