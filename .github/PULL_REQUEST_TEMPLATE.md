# PR Checklist — Sanctum LL Gates

> Every PR into `staging` must satisfy these gates before merge.

- [ ] **Lint:** `pnpm lint` passes locally
- [ ] **Typecheck:** `pnpm exec tsc --noEmit` passes
- [ ] **Unit Tests:** `pnpm test` all green
- [ ] **Integration Tests:** relevant cases covered
- [ ] **Coverage:** thresholds met (source-only, not dist/**)
- [ ] **Feature Flags:** all new functionality behind a flag (default OFF)
- [ ] **DB Migrations:** expand → migrate → contract (no destructive changes)
- [ ] **Runbook Reviewed:** I confirm this PR complies with [RUNBOOK.md](../RUNBOOK.md)

---
⚠️ If any box is unchecked → PR stays open.


