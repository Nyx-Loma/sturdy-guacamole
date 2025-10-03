# Deployment Workflow

## Overview

This document describes the production-grade deployment pipeline for Sanctum Platform. The workflow ensures that **only battle-tested code reaches production** via automated gates and nightly smoke tests.

## Branch Strategy

```
feat/* → staging → main (production)
```

### Branch Roles

- **`feat/*`**: Feature branches for active development
- **`staging`**: Integration branch, tested nightly with load/soak tests
- **`main`**: Production-ready code, always deployable

## Workflow Steps

### 1. Feature Development (`feat/*`)

**Developer workflow:**
```bash
git checkout -b feat/my-feature main
# ... make changes ...
git add .
git commit -m "Implement feature X"
git push origin feat/my-feature
```

**Pre-commit hooks automatically enforce:**
- ✅ ESLint (0 warnings allowed)
- ✅ TypeScript compilation
- ✅ All tests passing
- ✅ Coverage thresholds (≥86% statements, ≥85% branches, ≥90% functions)

### 2. Merge to Staging

**Pull Request: `feat/my-feature` → `staging`**

**Automated CI checks** (`.github/workflows/staging.yml`):
- ✅ Run full test suite (unit + integration)
- ✅ CodeQL security scan
- ✅ Build all services (Auth, Directory, Messaging)
- ✅ Coverage validation

**Merge requirements:**
- All CI checks pass
- Code review approved (recommended)

```bash
# After PR approval
git checkout staging
git merge --ff-only feat/my-feature
git push origin staging
```

### 3. Nightly Smoke Tests

**Scheduled: 2 AM UTC every night** (`.github/workflows/nightly-smoke.yml`)

**Test Suite:**
1. **Load Test (1 KiB payload)**
   - Target: 1000 RPS for 2 minutes
   - SLO: <2% error rate, p95 <1.5s

2. **Load Test (64 KiB payload)**
   - Target: 1000 RPS for 2 minutes
   - SLO: <2% error rate, p95 <1.5s

3. **Soak Test (sustained load)**
   - Target: 500 RPS for 15 minutes
   - SLO: <2% error rate, p95 <1.5s, p99 <3s

**Success criteria:**
- ✅ All SLOs met
- ✅ No service crashes
- ✅ Memory/CPU stable over soak duration

### 4. Automatic Promotion to Main

**If nightly smoke tests pass:**

The workflow automatically:
1. Fast-forwards `main` from `staging`
2. Creates a release tag: `release/YYYYMMDD-HHMMSS`
3. Pushes to GitHub

```
staging (green) → main (auto-merge) → release tag
```

**If smoke tests fail:**
- ❌ Promotion blocked
- ❌ Staging remains ahead of main
- 🔍 Review artifacts: test results + service logs
- 🛠️  Fix issues in new `feat/*` branch → merge to `staging` → retry next night

## Manual Overrides

### Trigger Nightly Tests Manually

```bash
# Via GitHub UI: Actions → Nightly Smoke Tests → Run workflow
# Or via gh CLI:
gh workflow run nightly-smoke.yml \
  --ref staging \
  --field target_rps=1000 \
  --field soak_duration=15
```

### Emergency Hotfix to Main

**Only for production-critical issues:**

```bash
git checkout -b hotfix/critical-bug main
# ... fix ...
git commit -m "Hotfix: Critical bug description"
git push origin hotfix/critical-bug

# Create PR: hotfix/critical-bug → main
# After approval:
git checkout main
git merge --ff-only hotfix/critical-bug
git push origin main

# Backport to staging
git checkout staging
git merge main
git push origin staging
```

## Branch Protection Rules

### `main` branch (Production)

**Required:**
- ✅ Pull request required
- ✅ 1 approval required
- ✅ Status checks must pass:
  - `test`
  - `security`
  - `build`
- ✅ Branch must be up to date before merging
- ✅ Linear history (no merge commits)
- 🚫 Force push disabled
- 🚫 Delete branch disabled

**Allowed exceptions:**
- Nightly automation bot (for `staging` → `main` promotion)

### `staging` branch

**Required:**
- ✅ Pull request required (from `feat/*` branches)
- ✅ Status checks must pass:
  - `test`
  - `security`
  - `build`
- ✅ Branch must be up to date
- 🚫 Force push disabled

**Allowed:**
- Direct push from nightly automation (for post-promotion updates)

### `feat/*` branches

**No restrictions** - developers can force push, rebase, etc.

## Rollback Strategy

### Rollback from Main

```bash
# Identify last good release
git tag -l "release/*" | tail -5

# Revert to last good release
git checkout main
git reset --hard release/20250103-020000
git push --force-with-lease origin main

# Update staging to match
git checkout staging
git reset --hard main
git push --force-with-lease origin staging
```

**Note:** Force push requires temporary disable of branch protection or admin override.

### Rollback from Staging

```bash
# Reset staging to current main
git checkout staging
git reset --hard main
git push --force-with-lease origin staging
```

## Monitoring & Observability

### CI Metrics (GitHub Actions)

- **Test Success Rate**: Target 100%
- **Build Time**: Baseline ~2-3 minutes
- **Coverage Trends**: Must stay ≥86%

### Nightly Smoke Test Metrics

- **Load Test Pass Rate**: Target 100%
- **Soak Test Pass Rate**: Target ≥95% (1 failure per 20 nights acceptable)
- **P95 Latency Trend**: Monitor for degradation over time
- **Error Rate Trend**: Baseline <0.5%, alert at >1%

### Promotion Metrics

- **Staging → Main Lag**: Target <24 hours (1 nightly cycle)
- **Blocked Promotions**: Alert if staging blocked >48 hours
- **Hotfix Rate**: Target <1 per month

## SLO Alerts

### Load Test SLOs

| Metric | SLO | Alert Threshold |
|--------|-----|----------------|
| Error Rate | <2% | ≥2% |
| P95 Latency | <1.5s | ≥1.5s |
| P99 Latency | <3s | ≥3s |

### Soak Test SLOs

| Metric | SLO | Alert Threshold |
|--------|-----|----------------|
| Error Rate | <2% | ≥2% |
| P95 Latency | <1.5s | ≥1.5s |
| Memory Growth | <10% over 15m | ≥10% |
| CPU Sustained | <70% avg | ≥70% |

## Incident Response

### Failed Nightly Smoke Test

1. **Triage** (within 1 hour of notification)
   - Review test results artifact
   - Check service logs artifact
   - Identify root cause

2. **Fix** (same day)
   - Create `feat/fix-nightly-failure` branch
   - Implement fix + add regression test
   - PR to `staging`

3. **Verify** (next night)
   - Monitor next nightly run
   - Confirm auto-promotion succeeds

### Production Incident (Main)

1. **Immediate**
   - Assess severity
   - If critical: hotfix directly to `main`
   - If non-critical: fix in `feat/*` → `staging` → wait for nightly

2. **Post-Incident**
   - Root cause analysis
   - Update tests to catch regression
   - Review if nightly smoke tests should be enhanced

## Release Notes

### Automatic Release Tags

Every successful promotion creates a tag:
```
release/20250103-020000
```

**To generate release notes:**
```bash
# List changes since last release
git log --oneline release/20250102-020000..release/20250103-020000

# Or use GitHub Releases UI
gh release create release/20250103-020000 \
  --title "Nightly Release: 2025-01-03" \
  --notes "$(git log --oneline release/20250102-020000..release/20250103-020000)"
```

## FAQ

### Q: Can I merge `feat/*` directly to `main`?

**A:** No. All features must flow through `staging` and pass nightly smoke tests. This ensures production stability.

### Q: What if I need a feature in production urgently?

**A:** 
1. Merge `feat/*` → `staging`
2. Manually trigger nightly smoke tests (don't wait for 2 AM)
3. If tests pass, promotion happens automatically

### Q: What if smoke tests fail due to flaky test?

**A:**
1. Fix the flaky test first (flakiness is a bug)
2. Or temporarily disable the flaky test (last resort)
3. Re-run workflow manually

### Q: How do I configure branch protection rules?

**GitHub UI:**
1. Repository → Settings → Branches
2. Click "Add rule" for `main` and `staging`
3. Follow "Branch Protection Rules" section above

## Contact

- **Deployment Issues**: Check GitHub Actions logs first
- **SLO Violations**: Review test artifacts and service logs
- **Workflow Questions**: See this document or open discussion

---

**Last Updated:** 2025-01-03  
**Owner:** Platform Team  
**Status:** ✅ Production Ready

