# PR Checklist — Sanctum LL Gates

> Every PR into `staging` must satisfy these gates before merge.

- [ ] Lint: `pnpm lint` green
- [ ] Type Check: `pnpm exec tsc --noEmit` green
- [ ] Unit Tests (node20) green
- [ ] Integration Tests (pg+redis) green
- [ ] Coverage thresholds met (src/** only)
- [ ] New code behind feature flags (default OFF)
- [ ] DB changes: expand → migrate → contract (no destructive rollout)
- [ ] Complies with [RUNBOOK.md](../RUNBOOK.md)

---
⚠️ If any box is unchecked → PR stays open.


