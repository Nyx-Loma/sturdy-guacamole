🛡️ Sanctum Last Layer (LL) Runbook

Principle: E2EE integrity beats speed. Roll back faster than a user tweet. Never lose a message, never break replay/resume.

—

1. Branching & Flow

- main = production only. Immutable, tagged releases.
- staging = candidate branch. All merges target staging.
- Feature branches → PR → staging → CI gates → tag → main.
- No direct commits to main.

2. Deployments

- Every build tagged: sanctum:vX.Y.Z.
- Gradual rollout: 5% → 25% → 100%.
- No editing in prod. Emergency = hotfix branch → tag → redeploy.

3. Rollbacks

- Code rollback: promote last healthy tag (sanctum:vX.Y.Z-1) in <30s.
- Feature rollback: all new features behind flags. Default OFF until proven safe. LL can flip OFF instantly.
- DB rollback: expand → migrate → contract. Never drop columns/tables mid-rollout. PITR on Postgres; Redis snapshots daily.

4. CI/CD Gates

Local pre-push:
- pnpm lint
- pnpm exec tsc --noEmit
- pnpm test (unit)

Staging (GitHub Actions):
- Unit + integration + coverage gates
- Typecheck (no emit)

Nightly:
- Chaos tests (Redis/Postgres outage)
- Load tests (k6 bursts, replay storms)
- Golden E2EE crypto tests

Prod promotion is blocked if any gate fails.

5. Observability & Guardrails

- Auto-rollback if: error rate >2% for 3m OR p95 latency >1.5s
- WebSocket handshake & replay/resume checks before >25% rollout
- Global kill switch: LL can shut down Auth, Transport, or Crypto independently

6. Human Interaction

Runbook commands (platform-specific placeholders):

```
flyctl releases list
flyctl releases rollback -i <id>
# or Railway/AWS/GCP equivalents
```

Alerting:
- Every auto-rollback posts to ops Slack
- No silent retries

Postmortems:
- Every rollback requires RCA before next deploy

7. Culture

- Treat main as sacred
- Treat every deploy as potentially the one that breaks trust
- Restrictive defaults: OFF until proven safe
- If in doubt, block rollout

⚡ Fast-push rule: Move quickly in staging; prod is earned.


