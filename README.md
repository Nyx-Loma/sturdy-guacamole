# Transport Ops Notes

- Dependencies pinned in `package.json` for reproducible builds.
- Environment variables documented in `env.example` including optional tunables: `WS_MAX_QUEUE_LENGTH`, `WS_MAX_REPLAY_BATCH_SIZE`, `METRICS_PREFIX`.
- To generate an SBOM: `pnpm dlx cyclonedx-npm --output-format json --output-file sbom.json`.
- Nightly status: ![Nightly Heavy Tests](https://github.com/OWNER/REPO/actions/workflows/nightly.yml/badge.svg)

## 🚦 Deployment Discipline

Sanctum follows the [🛡️ Last Layer Runbook](./RUNBOOK.md).

**Golden rules:**
- `main` = prod-only, immutable tags.
- `staging` = candidate branch, all merges target here.
- Feature branches → PR → staging → CI gates → tag → main.

No exceptions. Read the full [Runbook](./RUNBOOK.md) before shipping.

## 📊 GA Readiness

See the detailed audit and per-service roadmap: [GA_READINESS.md](./GA_READINESS.md)

